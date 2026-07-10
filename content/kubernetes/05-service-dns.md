---
title: "05. Service와 DNS — 바뀌는 Pod에 고정 주소 주기"
summary: "Pod가 교체되어도 같은 이름으로 접근하도록 Service, selector, EndpointSlice와 DNS를 한 경로로 연결합니다."
description: "4강의 web Deployment를 확인하고, 없으면 독립 실습용으로 준비한 뒤 Service와 DNS 장애를 만들고 반드시 복구합니다."
weight: 50
categories: ["Kubernetes"]
tags: ["Service", "DNS", "EndpointSlice", "Networking"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 05 · Beginner · Networking</p>

## 이번 시간에 해결할 문제

Deployment가 관리하는 Pod는 고장 나거나 배포가 바뀔 때 새 객체로 교체됩니다. 새 Pod는 이름과 IP도 달라집니다. 호출자가 Pod IP를 직접 저장한다면 교체될 때마다 설정을 다시 바꿔야 합니다.

이번 강의에서는 `web`이라는 변하지 않는 이름을 만들고, 그 이름이 현재 Ready 상태인 Pod까지 어떻게 이어지는지 직접 추적합니다.

> Service는 Pod를 소유하지 않습니다. label이 맞는 Pod를 찾아 안정적인 이름과 가상 IP 뒤에 연결합니다.

## 이 강의를 마치면

- Service가 필요한 이유를 Pod 교체와 연결해 설명할 수 있습니다.
- Service selector와 Pod label이 어떻게 EndpointSlice를 만드는지 확인할 수 있습니다.
- `port`, `targetPort`, `containerPort`를 요청 경로에서 구분할 수 있습니다.
- DNS는 성공하지만 HTTP 요청은 실패하는 selector 장애를 증거로 복구할 수 있습니다.

## 시작 전 확인

이 과정은 POSIX shell을 기준으로 합니다. macOS·Linux의 Bash/Zsh 또는 Windows WSL2의 Bash에서 실행하세요.

먼저 강의용 클러스터와 4강의 `web` Deployment를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get namespace k8s-labs
kubectl --context kind-k8s-masterclass get deployment web \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=web \
  -o wide
```

<div class="expected-result"><strong>성공 기준</strong><span>Deployment의 READY가 원하는 replica 수와 같고, Pod가 모두 <code>Running</code>이며 READY가 <code>1/1</code>입니다.</span></div>

### 4강을 건너뛰었다면

Namespace 또는 `web` Deployment가 없다는 오류가 보이면 다음 내용을 `05-web-bootstrap.yaml`로 저장합니다. 앞 강의를 들은 경우에는 이 파일을 만들 필요가 없습니다.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: k8s-labs
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: k8s-labs
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - name: http
              containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 3
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
            limits:
              memory: 128Mi
```

적용하고 준비가 끝날 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 05-web-bootstrap.yaml
kubectl --context kind-k8s-masterclass rollout status \
  deployment/web \
  -n k8s-labs \
  --timeout=2m
```

`deployment "web" successfully rolled out`가 보이면 다음 단계로 갑니다.

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 확인할 곳 |
|---|---|---|
| label | 객체에 붙이는 이름표 | Pod의 `app: web` |
| selector | 원하는 이름표를 고르는 조건 | Service의 `spec.selector` |
| Service | 변하지 않는 이름과 가상 IP | `kubectl get service` |
| EndpointSlice | Service가 현재 연결할 Pod 주소 목록 | `kubectl get endpointslice` |
| DNS | Service 이름을 ClusterIP로 바꾸는 기능 | Pod 안의 `nslookup` |

## 요청 경로를 그림으로 보기

```text
netcheck Pod
    │  http://web:80
    │
    ├─ DNS: web → Service의 ClusterIP
    │
    ▼
web Service
    │  selector: app=web
    │  port 80 → targetPort "http"
    ▼
EndpointSlice
    │  Ready Pod의 IP 목록
    ▼
web Pod의 containerPort 80
```

`containerPort`는 컨테이너가 사용하는 포트를 설명합니다. Service의 `targetPort`가 그 이름 또는 숫자를 가리키고, 호출자는 Service의 `port`로 요청합니다.

## 실습 1 — Service 만들기

다음 내용을 `05-web-service.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: k8s-labs
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: http
```

적용한 뒤 Service와 연결 대상을 함께 봅니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 05-web-service.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=create \
  endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=web \
  --timeout=90s
DESIRED_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get deployment web \
  -n k8s-labs \
  -o jsonpath='{.spec.replicas}')
READY_ENDPOINTS=0
for attempt in {1..45}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq "$DESIRED_ENDPOINTS" ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s/%s\n' \
  "$READY_ENDPOINTS" "$DESIRED_ENDPOINTS"
test "$READY_ENDPOINTS" -eq "$DESIRED_ENDPOINTS"
kubectl --context kind-k8s-masterclass get service web \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=web
```

중간 loop는 Deployment의 원하는 replica 수와 모든 EndpointSlice의 ready 주소 수가 같아질 때까지 최대 90초 기다립니다. 4강을 거치면 3개, 독립 bootstrap을 사용하면 2개이므로 숫자를 고정하지 않습니다.

예상 결과의 핵심은 다음과 같습니다.

```text
NAME   TYPE        CLUSTER-IP      PORT(S)
web    ClusterIP   10.x.x.x        80/TCP

NAME        ADDRESSTYPE   PORTS   ENDPOINTS
web-...     IPv4          80      10.x.x.x,10.x.x.x
```

EndpointSlice가 아직 비어 있다면 먼저 Deployment가 준비됐는지 확인합니다.

```bash
kubectl --context kind-k8s-masterclass rollout status \
  deployment/web \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass describe service web \
  -n k8s-labs
```

`Endpoints:`에 Pod IP가 보이면 selector와 label이 연결된 것입니다.

## 실습 2 — 클러스터 안에서 DNS와 HTTP 확인하기

Service의 ClusterIP는 클러스터 안에서 사용합니다. 요청을 보낼 작은 진단 Pod를 만듭니다. 다음 내용을 `05-netcheck.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: netcheck
  namespace: k8s-labs
spec:
  restartPolicy: Never
  containers:
    - name: netcheck
      image: busybox:1.36
      command: ["sh", "-c", "sleep 86400"]
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          memory: 64Mi
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 05-netcheck.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/netcheck \
  -n k8s-labs \
  --timeout=90s
```

이제 이름 해석과 HTTP 요청을 차례대로 확인합니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- nslookup web
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- wget -qO- http://web
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- \
  nslookup web.k8s-labs.svc.cluster.local
```

<div class="expected-result"><strong>성공 기준</strong><span><code>nslookup</code>은 Service의 ClusterIP를 보여주고, <code>wget</code>은 nginx 시작 HTML을 출력합니다.</span></div>

같은 Namespace에서는 `web`만 써도 됩니다. 다른 Namespace에서는 `web.k8s-labs`, 완전한 이름은 `web.k8s-labs.svc.cluster.local`입니다.

## 하나만 바꾸기 — selector를 틀리게 만들기

원본 `05-web-service.yaml`은 수정하지 않습니다. live Service의 selector 값 하나만 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass patch service web \
  -n k8s-labs \
  --type=merge \
  -p '{"spec":{"selector":{"app":"does-not-exist"}}}'
READY_ENDPOINTS=-1
for attempt in {1..30}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq 0 ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s\n' "$READY_ENDPOINTS"
test "$READY_ENDPOINTS" -eq 0
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=web \
  -o wide
```

예상 변화:

- Service와 ClusterIP는 그대로 있습니다.
- DNS 이름도 계속 해석됩니다.
- EndpointSlice의 ENDPOINTS는 비게 됩니다.

### 예상 실패 실습

다음 `wget`은 약 2초 뒤 실패해야 정상입니다. 이 블록은 성공 명령이 아닙니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- \
  wget -T 2 -qO- http://web
```

{{< alert "triangle-exclamation" >}}
`wget: download timed out` 또는 연결 실패가 예상 결과입니다. 종료 코드가 0이 아니어도 이번 단계에서는 실습이 성공한 것입니다.
{{< /alert >}}

DNS 문제인지 backend 문제인지 증거를 나누어 봅니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- nslookup web
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=web \
  --show-labels
kubectl --context kind-k8s-masterclass describe service web \
  -n k8s-labs
```

DNS는 성공하고 Pod도 Ready지만 Service의 `Endpoints:`가 비어 있습니다. 원인은 CoreDNS가 아니라 `selector: app=does-not-exist`입니다.

## 반드시 복구하고 검증하기

live selector를 명시적으로 되돌린 뒤 원본 파일을 다시 적용해 source와 live 상태를 함께 맞춥니다.

```bash
kubectl --context kind-k8s-masterclass patch service web \
  -n k8s-labs \
  --type=merge \
  -p '{"spec":{"selector":{"app":"web"}}}'
kubectl --context kind-k8s-masterclass apply \
  -f 05-web-service.yaml
DESIRED_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get deployment web \
  -n k8s-labs \
  -o jsonpath='{.spec.replicas}')
READY_ENDPOINTS=0
for attempt in {1..45}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq "$DESIRED_ENDPOINTS" ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s/%s\n' \
  "$READY_ENDPOINTS" "$DESIRED_ENDPOINTS"
test "$READY_ENDPOINTS" -eq "$DESIRED_ENDPOINTS"
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- wget -qO- http://web
```

HTML이 다시 출력되어야 복구가 끝난 것입니다. `kubectl apply` 성공만 보고 넘어가지 않습니다.

## 스스로 해보기 — Service port만 8080으로 바꾸기

`05-web-service.yaml`의 `port: 80`만 `port: 8080`으로 바꾸고 적용하세요. `targetPort: http`는 바꾸지 않습니다.

다음 두 요청 중 어느 것이 성공할지 먼저 예상합니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- wget -T 2 -qO- http://web
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- wget -qO- http://web:8080
```

<details class="course-hint">
<summary>정답과 원래 상태로 돌리는 법</summary>

호출자가 접근하는 포트가 8080으로 바뀌었으므로 `http://web:8080`만 성공합니다. Service는 그 요청을 Pod의 이름 붙은 `http` port, 즉 containerPort 80으로 전달합니다.

연습이 끝나면 파일의 `port`를 다시 80으로 저장하고 적용한 뒤 HTTP를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 05-web-service.yaml
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs netcheck -- wget -qO- http://web
```

</details>

## 3문장 정리

1. Service는 교체되는 Pod 앞에 변하지 않는 DNS 이름과 ClusterIP를 제공합니다.
2. Service selector와 Pod label이 맞아야 Ready Pod 주소가 EndpointSlice에 들어갑니다.
3. DNS가 성공해도 EndpointSlice가 비면 HTTP는 실패하므로 DNS → selector → endpoint → port 순서로 확인합니다.

## 다음 강의로 가져가는 상태

다음 상태를 유지합니다.

- `web` Deployment: Ready
- `web` Service: selector `app=web`, port 80
- `netcheck` Pod: Ready
- 로컬 파일: `05-web-service.yaml`, 필요하면 `05-web-bootstrap.yaml`, `05-netcheck.yaml`

```bash
kubectl --context kind-k8s-masterclass get \
  deployment,service,pod,endpointslice \
  -n k8s-labs
```

`web` Service에 endpoint가 있고 netcheck가 Ready이면 6강으로 이동합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/04-workloads/">← 이전: Deployment</a><a href="/kubernetes/06-config-secret/">다음: ConfigMap과 Secret →</a></nav>

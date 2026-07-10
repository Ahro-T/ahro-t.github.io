---
title: "08. Probe와 리소스 — 살아 있음과 준비됨 구분하기"
summary: "startup·readiness·liveness의 시간순서를 확인하고, CPU·메모리 단위와 requests·limits를 OOMKilled까지 연결합니다."
description: "readiness만 실패시켜 Service endpoint가 빠지지만 컨테이너는 재시작되지 않는 현상을 관찰하고 원본과 live 상태를 복구합니다."
weight: 80
categories: ["Kubernetes"]
tags: ["Probes", "Resources", "OOMKilled"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 08 · Beginner · Reliability</p>

## 이번 시간에 해결할 문제

프로세스가 실행 중이어도 요청을 받을 준비가 안 되었을 수 있습니다. 캐시를 채우거나 설정을 읽는 동안에는 살아 있지만 트래픽을 받으면 안 됩니다. 반대로 외부 데이터베이스가 잠시 느리다는 이유로 정상 프로세스를 계속 재시작하면 장애가 더 커집니다.

쿠버네티스는 서로 다른 세 질문을 Probe로 나눕니다.

> 시작이 끝났는가, 지금 요청을 받아도 되는가, 스스로 회복할 수 없게 멈췄는가.

## 이 강의를 마치면

- startup, readiness, liveness probe가 실행되는 순서와 실패 결과를 구분할 수 있습니다.
- readiness 실패 Pod가 재시작되지 않으면서 Service endpoint에서 빠지는 것을 증명할 수 있습니다.
- `100m` CPU와 `128Mi` 메모리 단위를 읽고 requests와 limits의 역할을 설명할 수 있습니다.
- 메모리 limit 초과로 종료된 Pod에서 `OOMKilled`와 exit code를 확인할 수 있습니다.

## 시작 전 확인

macOS·Linux Bash/Zsh 또는 Windows WSL2 Bash에서 진행합니다. Namespace와 현재 실패 Pod를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get namespace k8s-labs
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs
```

Namespace가 없다면 독립 실습용으로 만듭니다.

```bash
kubectl --context kind-k8s-masterclass create namespace k8s-labs
```

앞 강의의 의도적 실패 Pod가 남아 있다면 먼저 해당 강의의 복구 절차를 완료하세요. 이번 강의는 새 이름인 `probe-web`과 `memory-hog`만 사용합니다.

## 오늘의 용어 5개

| 용어 | 질문 | 실패 결과 |
|---|---|---|
| startup probe | 초기화가 끝났나 | 기준을 넘겨 실패하면 컨테이너 재시작 |
| readiness probe | 지금 요청을 받아도 되나 | Service의 ready endpoint에서 제외 |
| liveness probe | 프로세스가 회복 불가능하게 멈췄나 | 컨테이너 재시작 |
| requests | 배치를 위해 필요하다고 선언한 양 | Scheduler와 HPA 계산에 사용 |
| limits | 컨테이너가 사용할 수 있는 상한 | 메모리 초과 시 종료될 수 있음 |

## Probe 시간순서를 그림으로 보기

```text
컨테이너 시작
    │
    ▼
startup probe 반복
    │ 성공 전에는 readiness와 liveness를 시작하지 않음
    ▼
┌─────────────────────────────────────────┐
│ readiness 반복 → 실패: endpoint에서 제외 │
│ liveness  반복 → 실패: 컨테이너 재시작    │
└─────────────────────────────────────────┘
```

readiness는 트래픽을 제어하고 liveness는 재시작을 제어합니다. 같은 URL을 아무 생각 없이 복사하면 외부 의존성 장애 때 모든 Pod를 재시작하는 연쇄 장애를 만들 수 있습니다.

## CPU와 메모리 단위 먼저 읽기

| 표기 | 뜻 | 예시 |
|---|---|---|
| `1` CPU | CPU core 하나 | `500m`의 두 배 |
| `100m` CPU | 0.1 CPU core | 짧은 작업의 작은 request |
| `1Mi` | 1,048,576 bytes | 2진 단위 메비바이트 |
| `128Mi` | 128 × 1Mi | 메모리 request 또는 limit |

`m`은 CPU에서 milli를 뜻하지만 메모리의 `M`과는 다릅니다. 메모리에서는 `Mi`, `Gi`처럼 단위를 끝까지 적는 습관이 안전합니다.

- Scheduler는 requests를 보고 Pod를 놓을 Node를 찾습니다.
- CPU limit을 넘으면 일반적으로 throttling이 발생합니다.
- memory limit을 넘으면 프로세스가 종료되어 `OOMKilled`가 될 수 있습니다.
- HPA가 CPU 사용률을 계산하려면 CPU request가 필요합니다.

## 실습 1 — 세 Probe가 있는 Deployment 만들기

이 실습은 readiness 실패 때 endpoint가 완전히 빠지는 모습을 분명히 보기 위해 학습용 `Recreate` 전략을 사용합니다. 운영의 일반적인 rolling update와는 선택 이유가 다릅니다.

다음 내용을 `08-probe-web.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: probe-web-content
  namespace: k8s-labs
data:
  index.html: |
    probe-web is alive
  ready: |
    ready
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probe-web
  namespace: k8s-labs
spec:
  replicas: 2
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: probe-web
  template:
    metadata:
      labels:
        app: probe-web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - name: http
              containerPort: 80
          startupProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 2
            failureThreshold: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            periodSeconds: 3
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
            limits:
              cpu: 250m
              memory: 128Mi
          volumeMounts:
            - name: content
              mountPath: /usr/share/nginx/html
              readOnly: true
      volumes:
        - name: content
          configMap:
            name: probe-web-content
---
apiVersion: v1
kind: Service
metadata:
  name: probe-web
  namespace: k8s-labs
spec:
  selector:
    app: probe-web
  ports:
    - name: http
      port: 80
      targetPort: http
```

적용하고 rollout을 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 08-probe-web.yaml
kubectl --context kind-k8s-masterclass rollout status \
  deployment/probe-web \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=probe-web
```

정상이라면 Pod 두 개가 `1/1 Running`이고 RESTARTS는 0입니다.

Service와 EndpointSlice를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=create \
  endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=probe-web \
  --timeout=90s
READY_ENDPOINTS=0
for attempt in {1..45}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=probe-web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq 2 ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s/2\n' "$READY_ENDPOINTS"
test "$READY_ENDPOINTS" -eq 2
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=probe-web \
  -o wide
```

loop는 첫 endpoint 하나만 보지 않고 모든 EndpointSlice의 ready 주소를 세어 정확히 2개가 될 때까지 최대 90초 기다립니다.

Endpoint가 두 개 보이면 readiness가 트래픽 진입 허가로 사용된 것입니다.

## 하나만 바꾸기 — readiness path만 틀리게 만들기

원본 `08-probe-web.yaml`은 계속 `/ready`를 유지합니다. live Deployment의 readiness path 한 곳만 `/not-ready`로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass patch deployment probe-web \
  -n k8s-labs \
  --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/not-ready"}]'
```

Recreate 전략 때문에 기존 Pod가 종료되고 잘못된 readiness를 가진 새 Pod가 생깁니다.

### 예상 실패 실습

다음 rollout wait는 30초 뒤 실패해야 정상입니다.

```bash
kubectl --context kind-k8s-masterclass rollout status \
  deployment/probe-web \
  -n k8s-labs \
  --timeout=30s
```

{{< alert "triangle-exclamation" >}}
`progress deadline` 또는 `timed out waiting for the condition`이 예상 결과입니다. API 객체 저장은 성공했지만 새 Pod가 Ready가 되지 않았습니다.
{{< /alert >}}

EndpointSlice controller가 새 Pod 상태를 반영할 때까지 기다린 뒤 증거를 세 곳에서 확인합니다.

```bash
READY_ENDPOINTS=-1
for attempt in {1..30}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=probe-web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq 0 ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s\n' "$READY_ENDPOINTS"
test "$READY_ENDPOINTS" -eq 0
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=probe-web
kubectl --context kind-k8s-masterclass describe pods \
  -n k8s-labs \
  -l app=probe-web
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=probe-web \
  -o yaml
```

관찰해야 할 내용:

- Pod phase는 `Running`이지만 READY는 `0/1`입니다.
- Events에는 `/not-ready`가 HTTP 404를 반환했다는 readiness 실패가 보입니다.
- liveness path `/`는 성공하므로 RESTARTS가 증가하지 않습니다.
- EndpointSlice에 ready endpoint가 없거나 endpoint의 `conditions.ready`가 `false`입니다.

이 네 가지가 readiness 실패의 범위를 보여줍니다. 프로세스를 죽이지 않고 트래픽만 차단한 것입니다.

## 반드시 live patch를 되돌리고 검증하기

readiness path를 원래 `/ready`로 되돌립니다. 로컬 파일도 계속 `/ready`였으므로 source와 live가 다시 일치합니다.

```bash
kubectl --context kind-k8s-masterclass patch deployment probe-web \
  -n k8s-labs \
  --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/ready"}]'
kubectl --context kind-k8s-masterclass rollout status \
  deployment/probe-web \
  -n k8s-labs \
  --timeout=2m
READY_ENDPOINTS=0
for attempt in {1..45}; do
  READY_ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice \
    -n k8s-labs \
    -l kubernetes.io/service-name=probe-web \
    -o jsonpath='{range .items[*].endpoints[?(@.conditions.ready==true)]}{.addresses[0]}{"\n"}{end}' \
    | awk 'NF { count++ } END { print count+0 }')
  if [ "$READY_ENDPOINTS" -eq 2 ]; then
    break
  fi
  sleep 2
done
printf 'ready endpoints=%s/2\n' "$READY_ENDPOINTS"
test "$READY_ENDPOINTS" -eq 2
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=probe-web
```

두 Pod가 `1/1`, RESTARTS 0이고 ready endpoint가 다시 보일 때만 다음 실습으로 갑니다.

## 실습 2 — memory limit과 OOMKilled 확인

다음 내용을 `08-memory-hog.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: memory-hog
  namespace: k8s-labs
spec:
  restartPolicy: Never
  containers:
    - name: app
      image: python:3.12-alpine
      command: ["python", "-c"]
      args:
        - "import time; data=bytearray(128*1024*1024); time.sleep(3600)"
      resources:
        requests:
          cpu: 10m
          memory: 32Mi
        limits:
          memory: 64Mi
```

프로세스는 약 128Mi를 할당하려 하지만 limit은 64Mi입니다. 적용하고 Pod phase가 `Failed`가 될 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 08-memory-hog.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.phase}'=Failed \
  pod/memory-hog \
  -n k8s-labs \
  --timeout=2m
```

종료 이유와 exit code를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass describe pod memory-hog \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get pod memory-hog \
  -n k8s-labs \
  -o jsonpath='{.status.containerStatuses[0].state.terminated.reason}{" exit="}{.status.containerStatuses[0].state.terminated.exitCode}{"\n"}'
```

예상 결과는 `OOMKilled exit=137`입니다. 137만 보고 메모리 문제라고 단정하지 말고 `reason`, limit, Events를 함께 확인합니다.

증거를 확인했으면 실패 Pod를 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod memory-hog \
  -n k8s-labs \
  --wait=true
```

## 스스로 해보기 — Probe가 실패를 확정하는 시간

manifest만 보고 다음 질문에 답하세요.

1. startup probe가 계속 실패하면 약 몇 초 뒤 재시작 판단에 도달하나요?
2. startup probe가 성공한 뒤 readiness가 연속 실패하면 약 몇 초 뒤 NotReady가 되나요?
3. readiness 실패가 liveness restart count를 올리나요?

<details class="course-hint">
<summary>정답과 계산</summary>

1. `periodSeconds: 2 × failureThreshold: 30`이므로 대략 60초입니다. 실제 시점에는 요청 시간과 스케줄링 지연이 더해질 수 있습니다.
2. `periodSeconds: 3 × failureThreshold: 2`이므로 대략 6초입니다.
3. 올리지 않습니다. readiness는 Service endpoint 포함 여부만 제어합니다. 재시작은 liveness 또는 startup 실패가 담당합니다.

</details>

## 3문장 정리

1. startup은 초기화, readiness는 트래픽, liveness는 재시작 여부를 각각 판단합니다.
2. requests는 스케줄링과 사용률 계산의 기준이고 limits는 런타임 상한입니다.
3. readiness 장애 실습은 Pod·Events·EndpointSlice로 증명한 뒤 live patch와 source가 같은 정상 상태인지 확인해야 끝납니다.

## 다음 강의로 가져가는 상태

- `probe-web` Deployment: 2/2 Ready
- readiness path: `/ready`
- `probe-web` EndpointSlice: ready endpoint 존재
- `memory-hog`: 삭제됨
- 로컬 `08-probe-web.yaml`: live 상태와 일치

```bash
kubectl --context kind-k8s-masterclass get deployment probe-web \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=probe-web
```

Deployment가 2/2이고 endpoint가 있으면 9강으로 이동합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/07-storage/">← 이전: Volume과 StatefulSet</a><a href="/kubernetes/09-ingress-gateway/">다음: Ingress와 Gateway API →</a></nav>

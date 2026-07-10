---
title: "09. Gateway API — 외부 HTTP와 HTTPS 요청 연결하기"
summary: "Envoy Gateway를 호환 버전에 설치하고 GatewayClass→Gateway→HTTPRoute→Service→Pod 경로를 HTTP와 TLS로 완주합니다."
description: "Kubernetes 1.35와 Envoy Gateway 1.8.2 조합에서 listener, route, backend와 인증서 Secret을 만들고 장애를 source 변경 없이 복구합니다."
weight: 90
categories: ["Kubernetes"]
tags: ["Gateway API", "TLS", "HTTPRoute", "Networking"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 09 · Beginner · North-South Traffic</p>

## 이번 시간에 해결할 문제

Service는 클러스터 내부에 안정적인 주소를 만들지만 인터넷의 HTTP 요청을 host와 path에 따라 나누거나 TLS 인증서를 선택하지는 않습니다. 외부 요청을 받으려면 L7 진입점과 실제로 트래픽을 처리하는 controller가 필요합니다.

이번 강의에서는 Gateway API 객체만 작성하고 끝내지 않습니다. 로컬 포트에서 들어온 요청이 Envoy, Gateway listener, HTTPRoute, Service, EndpointSlice, Pod까지 도달하는 경로를 HTTP와 HTTPS로 모두 확인합니다.

기존 Ingress API가 제거된 것은 아니지만 기능이 동결된 stable API입니다. 새 역할 모델을 한 가지 경로로 깊게 익히기 위해 이 실습은 Gateway API에 집중하며, Ingress controller를 동시에 설치하지 않습니다.

> Gateway API 객체는 트래픽 규칙이고, controller와 Envoy data plane이 그 규칙을 실제 네트워크 동작으로 만듭니다.

## 이 강의를 마치면

- GatewayClass, Gateway, HTTPRoute와 Envoy Gateway controller의 역할을 구분할 수 있습니다.
- HTTP 요청이 listener에서 Service backend까지 이동하는 경로를 status와 요청으로 확인할 수 있습니다.
- 같은 Namespace의 TLS Secret을 HTTPS listener에 연결하고 인증서를 검증할 수 있습니다.
- 원본 파일을 바꾸지 않고 backend 장애를 주입한 뒤 `ResolvedRefs` 증거로 복구할 수 있습니다.

## 시작 전 확인 — 호환 버전을 먼저 맞추기

이 강의는 macOS·Linux Bash/Zsh 또는 Windows WSL2 Bash를 기준으로 합니다. 또한 다음 조합으로 검증합니다.

| 구성요소 | 과정 기준 |
|---|---:|
| Kubernetes | 1.35.x |
| kind | 0.32.x |
| Helm | 4.2.x |
| Envoy Gateway | 1.8.2 |

[Envoy Gateway 공식 호환 표](https://gateway.envoyproxy.io/news/releases/matrix/)에서 v1.8의 Kubernetes 지원 범위는 1.32–1.35입니다. 이 강의에서는 재현 가능한 stable 조합을 위해 Kubernetes 1.35를 사용합니다. Kubernetes 1.36 클러스터라면 “아마 동작할 것”이라고 가정하지 말고 지원되는 과정 클러스터를 다시 준비하세요.

버전을 확인합니다.

```bash
kubectl --context kind-k8s-masterclass version
helm version
kind version
```

<div class="expected-result"><strong>성공 기준</strong><span>Server Version이 <code>v1.35.x</code>이고 Helm은 <code>v4.2.x</code>입니다.</span></div>

5강의 `web` Service와 ready endpoint도 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get deployment web \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get service web \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get endpointslice \
  -n k8s-labs \
  -l kubernetes.io/service-name=web \
  -o wide
```

### 5강을 건너뛰었다면

`web` Deployment 또는 Service가 없다면 다음 내용을 `09-backend.yaml`로 저장합니다. 앞 강의를 순서대로 들었다면 만들 필요가 없습니다.

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
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: k8s-labs
spec:
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: http
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 09-backend.yaml
kubectl --context kind-k8s-masterclass rollout status \
  deployment/web \
  -n k8s-labs \
  --timeout=2m
```

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 이번 강의의 이름 |
|---|---|---|
| GatewayClass | 어떤 controller가 Gateway를 구현할지 정한 종류 | `eg` |
| Gateway | 트래픽을 받을 주소와 port의 묶음 | `course-gateway` |
| listener | Gateway 안에서 protocol, port, hostname을 받는 입구 | `http`, `https` |
| HTTPRoute | host·path 요청을 backend로 보내는 규칙 | `web-http`, `web-https` |
| controller | API 객체를 보고 Envoy 리소스를 실제로 만드는 프로그램 | Envoy Gateway |

## 요청 경로를 그림으로 보기

```text
브라우저 또는 curl
    │ localhost:8889 / localhost:8443
    ▼
kubectl port-forward
    ▼
Envoy Service와 Envoy Pod       ← controller가 생성
    ▼
course-gateway listener         ← Gateway
    ▼
web-http 또는 web-https 규칙    ← HTTPRoute
    ▼
web Service :80
    ▼
EndpointSlice의 Ready 주소
    ▼
web Pod :80
```

Gateway API 객체를 만들었는데 Envoy controller가 없다면 이 경로는 만들어지지 않습니다. 반대로 controller가 있어도 Route가 수락되지 않았다면 요청은 backend에 도달하지 않습니다.

## 실습 1 — Envoy Gateway controller 설치

[공식 Helm 설치 방식](https://gateway.envoyproxy.io/docs/install/install-helm/)에 따라 OCI chart의 v1.8.2를 고정해 설치합니다.

```bash
helm upgrade --install eg \
  oci://docker.io/envoyproxy/gateway-helm \
  --version v1.8.2 \
  --kube-context kind-k8s-masterclass \
  --namespace envoy-gateway-system \
  --create-namespace \
  --wait=watcher \
  --timeout 5m
```

Deployment와 Gateway API 리소스 타입을 확인합니다.

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Available \
  deployment/envoy-gateway \
  -n envoy-gateway-system \
  --timeout=5m
kubectl --context kind-k8s-masterclass get pods \
  -n envoy-gateway-system
kubectl --context kind-k8s-masterclass api-resources \
  --api-group=gateway.networking.k8s.io
```

controller Pod가 Ready이고 `gatewayclasses`, `gateways`, `httproutes`가 보여야 다음 단계로 갑니다.

## 실습 2 — HTTP Gateway와 Route 만들기

다음 내용을 `09-gateway-http.yaml`로 저장합니다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: course-gateway
  namespace: k8s-labs
spec:
  gatewayClassName: eg
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Same
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-http
  namespace: k8s-labs
spec:
  parentRefs:
    - name: course-gateway
      sectionName: http
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web
          port: 80
```

적용하고 세 객체의 status를 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 09-gateway-http.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Accepted \
  gatewayclass/eg \
  --timeout=2m
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Programmed \
  gateway/course-gateway \
  -n k8s-labs \
  --timeout=5m
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="Accepted")].status}'=True \
  httproute/web-http \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'=True \
  httproute/web-http \
  -n k8s-labs \
  --timeout=2m
```

`GatewayClass accepted`, `Gateway programmed`, `Route accepted`, `backend reference resolved`가 모두 다른 검증 단계입니다.

```bash
kubectl --context kind-k8s-masterclass get \
  gatewayclass,gateway,httproute \
  -n k8s-labs
kubectl --context kind-k8s-masterclass describe httproute web-http \
  -n k8s-labs
```

## HTTP 요청을 끝까지 보내기

kind에는 public LoadBalancer가 없으므로 Envoy Service로 port-forward합니다.

### 터미널 A — port-forward 유지

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=create \
  service \
  -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  --timeout=2m
COURSE_ENVOY_SERVICE=$(kubectl --context kind-k8s-masterclass get service \
  -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  -o jsonpath='{.items[0].metadata.name}')
test -n "$COURSE_ENVOY_SERVICE"
printf 'Envoy Service=%s\n' "$COURSE_ENVOY_SERVICE"
kubectl --context kind-k8s-masterclass port-forward \
  -n envoy-gateway-system \
  service/"$COURSE_ENVOY_SERVICE" \
  8889:80
```

`Forwarding from 127.0.0.1:8889 -> ...`가 보이면 이 터미널을 그대로 둡니다.

### 터미널 B — 요청 확인

```bash
curl --fail --show-error --silent \
  --noproxy '*' \
  --retry 10 \
  --retry-delay 1 \
  --retry-connrefused \
  http://localhost:8889/
```

nginx HTML이 출력되고 curl 종료 코드가 0이면 HTTP 경로를 완주한 것입니다. 확인 후 터미널 A에서 `Ctrl-C`를 눌러 port-forward를 종료합니다.

## 실습 3 — TLS Secret과 HTTPS listener 연결

먼저 로컬 학습용 인증서 설정 파일 `09-openssl.cnf`를 만듭니다. 이 인증서는 운영에 사용하지 않습니다.

```ini
[req]
distinguished_name = subject
x509_extensions = extensions
prompt = no

[subject]
CN = course.local

[extensions]
subjectAltName = @alt_names
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = course.local
```

인증서와 개인키를 만듭니다.

```bash
openssl version
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout 09-course-local.key \
  -out 09-course-local.crt \
  -days 7 \
  -config 09-openssl.cnf
```

`09-course-local.key`는 개인키입니다. 학습용이라도 Git에 commit하지 말고 실제 서비스의 인증서와 키는 승인된 발급·보관 시스템으로 관리하세요.

Secret 생성 명령을 dry-run YAML과 apply로 연결하면 재실행해도 같은 이름을 갱신할 수 있습니다.

```bash
kubectl --context kind-k8s-masterclass create secret tls course-local-tls \
  --cert=09-course-local.crt \
  --key=09-course-local.key \
  -n k8s-labs \
  --dry-run=client \
  -o yaml \
  | kubectl --context kind-k8s-masterclass apply -f -
kubectl --context kind-k8s-masterclass get secret course-local-tls \
  -n k8s-labs
```

다음 `09-gateway-tls.yaml`은 HTTP와 HTTPS listener, 두 Route를 모두 포함한 완전한 manifest입니다.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: course-gateway
  namespace: k8s-labs
spec:
  gatewayClassName: eg
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Same
    - name: https
      protocol: HTTPS
      port: 443
      hostname: course.local
      tls:
        mode: Terminate
        certificateRefs:
          - kind: Secret
            name: course-local-tls
      allowedRoutes:
        namespaces:
          from: Same
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-http
  namespace: k8s-labs
spec:
  parentRefs:
    - name: course-gateway
      sectionName: http
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web
          port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-https
  namespace: k8s-labs
spec:
  parentRefs:
    - name: course-gateway
      sectionName: https
  hostnames:
    - course.local
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web
          port: 80
```

이 파일을 적용한 뒤부터는 `09-gateway-tls.yaml`을 현재 기준 source로 사용합니다. 앞의 `09-gateway-http.yaml`은 HTTP 단계의 학습 기록으로만 남기고 다시 적용하지 않습니다.

적용하고 HTTPS Route가 수락될 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 09-gateway-tls.yaml
GATEWAY_GENERATION=""
PROGRAMMED_STATUS=""
PROGRAMMED_GENERATION=""
HTTPS_REFS_STATUS=""
HTTPS_REFS_GENERATION=""
for attempt in {1..150}; do
  GATEWAY_GENERATION=$(kubectl --context kind-k8s-masterclass get gateway course-gateway \
    -n k8s-labs \
    -o jsonpath='{.metadata.generation}')
  PROGRAMMED_STATUS=$(kubectl --context kind-k8s-masterclass get gateway course-gateway \
    -n k8s-labs \
    -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}')
  PROGRAMMED_GENERATION=$(kubectl --context kind-k8s-masterclass get gateway course-gateway \
    -n k8s-labs \
    -o jsonpath='{.status.conditions[?(@.type=="Programmed")].observedGeneration}')
  HTTPS_REFS_STATUS=$(kubectl --context kind-k8s-masterclass get gateway course-gateway \
    -n k8s-labs \
    -o jsonpath='{.status.listeners[?(@.name=="https")].conditions[?(@.type=="ResolvedRefs")].status}')
  HTTPS_REFS_GENERATION=$(kubectl --context kind-k8s-masterclass get gateway course-gateway \
    -n k8s-labs \
    -o jsonpath='{.status.listeners[?(@.name=="https")].conditions[?(@.type=="ResolvedRefs")].observedGeneration}')
  if [ "$PROGRAMMED_STATUS" = "True" ] \
    && [ "$PROGRAMMED_GENERATION" = "$GATEWAY_GENERATION" ] \
    && [ "$HTTPS_REFS_STATUS" = "True" ] \
    && [ "$HTTPS_REFS_GENERATION" = "$GATEWAY_GENERATION" ]; then
    break
  fi
  sleep 2
done
printf 'Gateway generation=%s, Programmed=%s/%s, HTTPS ResolvedRefs=%s/%s\n' \
  "$GATEWAY_GENERATION" \
  "$PROGRAMMED_STATUS" "$PROGRAMMED_GENERATION" \
  "$HTTPS_REFS_STATUS" "$HTTPS_REFS_GENERATION"
test "$PROGRAMMED_STATUS" = "True"
test "$PROGRAMMED_GENERATION" = "$GATEWAY_GENERATION"
test "$HTTPS_REFS_STATUS" = "True"
test "$HTTPS_REFS_GENERATION" = "$GATEWAY_GENERATION"
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="Accepted")].status}'=True \
  httproute/web-https \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'=True \
  httproute/web-https \
  -n k8s-labs \
  --timeout=2m
```

`status=True`만 보면 이전 Gateway generation의 결과를 잘못 읽을 수 있습니다. 위 확인은 `observedGeneration`이 현재 `metadata.generation`과 같은지도 비교하므로 새 HTTPS listener와 Secret 참조가 실제로 처리된 뒤에만 통과합니다.

Envoy Service에 443 port가 반영될 때까지 기다립니다.

```bash
COURSE_ENVOY_SERVICE=$(kubectl --context kind-k8s-masterclass get service \
  -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.spec.ports[?(@.port==443)].port}'=443 \
  service/"$COURSE_ENVOY_SERVICE" \
  -n envoy-gateway-system \
  --timeout=2m
```

### 터미널 A — HTTPS port-forward 유지

```bash
COURSE_ENVOY_SERVICE=$(kubectl --context kind-k8s-masterclass get service \
  -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass port-forward \
  -n envoy-gateway-system \
  service/"$COURSE_ENVOY_SERVICE" \
  8443:443
```

### 터미널 B — 인증서와 HTTPS 요청 검증

```bash
HTTPS_OK=0
for attempt in {1..20}; do
  if curl --fail --show-error --silent \
    --noproxy '*' \
    --resolve course.local:8443:127.0.0.1 \
    --cacert 09-course-local.crt \
    https://course.local:8443/; then
    HTTPS_OK=1
    break
  fi
  sleep 1
done
test "$HTTPS_OK" -eq 1
```

`--resolve`는 로컬 테스트에서 `course.local`을 127.0.0.1로 보냅니다. `--cacert`는 방금 만든 인증서를 신뢰 대상으로 사용합니다. nginx HTML이 보이면 TLS handshake, hostname 검증, Route와 backend가 모두 성공한 것입니다. 확인 후 터미널 A에서 `Ctrl-C`를 누릅니다.

## 예상 실패 실습 — 존재하지 않는 backend

원본 `09-gateway-tls.yaml`을 수정하지 않습니다. live `web-http` Route의 backend 이름 하나만 JSON patch로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass patch httproute web-http \
  -n k8s-labs \
  --type=json \
  -p='[{"op":"replace","path":"/spec/rules/0/backendRefs/0/name","value":"missing-service"}]'
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'=False \
  httproute/web-http \
  -n k8s-labs \
  --timeout=2m
```

Route status에서 원인을 확인합니다.

```bash
kubectl --context kind-k8s-masterclass describe httproute web-http \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get httproute web-http \
  -n k8s-labs \
  -o yaml
```

`ResolvedRefs=False`, `BackendNotFound` 또는 유사한 이유가 증거입니다.

HTTP 요청도 실패하는지 확인합니다.

### 터미널 A — HTTP port-forward 유지

```bash
COURSE_ENVOY_SERVICE=$(kubectl --context kind-k8s-masterclass get service \
  -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass port-forward \
  -n envoy-gateway-system \
  service/"$COURSE_ENVOY_SERVICE" \
  8889:80
```

### 터미널 B — 실패 요청

다음 curl은 HTTP 5xx 때문에 종료 코드 0이 아니어야 정상입니다.

```bash
curl --fail --show-error \
  --noproxy '*' \
  http://localhost:8889/
```

{{< alert "triangle-exclamation" >}}
`The requested URL returned error: 500`이 예상 결과입니다. 존재하지 않는 Service 참조는 Gateway API에서 500으로 처리합니다. Service는 존재하지만 ready endpoint가 없을 때의 503과 구분하세요. controller 로그보다 먼저 HTTPRoute의 `ResolvedRefs`를 읽습니다.
{{< /alert >}}

## 반드시 backend를 복구하고 요청까지 재검증하기

live Route의 값을 원래 `web`으로 되돌립니다. 로컬 파일은 처음부터 `web`이었으므로 source와 live가 다시 일치합니다.

```bash
kubectl --context kind-k8s-masterclass patch httproute web-http \
  -n k8s-labs \
  --type=json \
  -p='[{"op":"replace","path":"/spec/rules/0/backendRefs/0/name","value":"web"}]'
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'=True \
  httproute/web-http \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass describe httproute web-http \
  -n k8s-labs
```

터미널 A의 port-forward를 유지한 상태에서 터미널 B에서 다시 요청합니다.

```bash
curl --fail --show-error --silent \
  --noproxy '*' \
  --retry 10 \
  --retry-delay 1 \
  --retry-connrefused \
  http://localhost:8889/
```

HTML이 출력되고 `ResolvedRefs=True`여야 복구가 끝난 것입니다. 그 뒤 터미널 A에서 `Ctrl-C`로 port-forward를 종료합니다.

## 스스로 해보기 — 요청 실패 지점을 분류하기

다음 증상마다 가장 먼저 볼 객체를 고르세요.

1. `course.local` 인증서 hostname 오류
2. Gateway의 `Programmed=False`
3. Route의 `ResolvedRefs=False`
4. Route는 정상인데 Service의 endpoint가 0개

<details class="course-hint">
<summary>정답과 확인 명령</summary>

1. HTTPS listener의 certificateRefs와 Secret 인증서 SAN을 확인합니다.
2. GatewayClass, Envoy Gateway controller, Gateway Events를 확인합니다.
3. HTTPRoute의 backendRefs와 status conditions를 확인합니다.
4. Service selector, Pod label, readiness와 EndpointSlice를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass describe gateway course-gateway -n k8s-labs
kubectl --context kind-k8s-masterclass describe httproute web-http -n k8s-labs
kubectl --context kind-k8s-masterclass describe service web -n k8s-labs
kubectl --context kind-k8s-masterclass get endpointslice -n k8s-labs \
  -l kubernetes.io/service-name=web -o yaml
```

</details>

## 3문장 정리

1. GatewayClass는 구현 controller를 고르고, Gateway listener는 입구를 열며, HTTPRoute는 요청을 Service backend에 연결합니다.
2. TLS 종료에는 HTTPS listener, 같은 Namespace의 인증서 Secret, hostname이 맞는 Route가 함께 필요합니다.
3. 외부 요청 장애는 Gateway와 Route status → Service → EndpointSlice → Pod 순서로 좁히고, 장애 patch는 반드시 source와 같은 값으로 복구합니다.

## 다음 강의로 가져가는 상태

10강과 캡스톤까지 다음 클러스터 범위 add-on을 유지합니다.

- Envoy Gateway v1.8.2 controller: Ready
- GatewayClass `eg`: Accepted
- Gateway `course-gateway`: HTTP·HTTPS listener Programmed
- HTTPRoute `web-http`, `web-https`: Accepted, ResolvedRefs=True
- Secret `course-local-tls`
- backend `web` Service: ready endpoint 존재

```bash
kubectl --context kind-k8s-masterclass get gatewayclass eg
kubectl --context kind-k8s-masterclass get gateway,httproute \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get deployment \
  -n envoy-gateway-system
```

이 과정의 kind 클러스터에서는 controller와 CRD를 지금 삭제하지 않습니다. 마지막 강의에서 클러스터를 삭제하면 함께 정리됩니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/08-probes-resources/">← 이전: Probe와 리소스</a><a href="/kubernetes/10-scheduling/">다음: 스케줄링 →</a></nav>

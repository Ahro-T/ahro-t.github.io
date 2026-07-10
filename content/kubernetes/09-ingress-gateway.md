---
title: "09. Ingress와 Gateway API — 외부 요청의 여행"
summary: "Client에서 Gateway·Ingress, Service, Pod까지 이어지는 경로와 TLS 종료 지점을 그립니다."
description: "Ingress와 Gateway API의 역할, controller 전제, host·path routing과 TLS를 다룹니다."
weight: 90
categories: ["Kubernetes"]
tags: ["Ingress", "Gateway API", "TLS", "Networking"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 09 · 3H · North-South Traffic</p>

Service는 안정적인 내부 주소를 만듭니다. 외부 HTTP 요청을 host와 path로 나누고 TLS를 종료하려면 L7 진입점이 필요합니다. 여기서 가장 중요한 사실은 **API 객체만 만들면 트래픽이 흐르는 것이 아니라는 것**입니다.

## 이 강의를 마치면

- LoadBalancer Service, Ingress, Gateway API의 역할을 구분할 수 있습니다.
- Ingress·Gateway 객체와 실제 controller가 별개임을 설명할 수 있습니다.
- Client → Listener → Route → Service → EndpointSlice → Pod 경로를 추적할 수 있습니다.
- TLS가 어디에서 종료되고 인증서 Secret이 어떻게 연결되는지 설명할 수 있습니다.

## Ingress와 Gateway API 비교

| 관점 | Ingress | Gateway API |
|---|---|---|
| 상태 | stable이지만 API는 기능 동결 | 새 기능이 확장되는 권장 모델 |
| 역할 모델 | 하나의 객체에 규칙 집중 | 인프라 담당 Gateway와 앱 담당 Route 분리 |
| 프로토콜 | 주로 HTTP(S) | HTTP, gRPC, TCP 등 확장 |
| 구현 | Ingress controller 필요 | Gateway controller와 GatewayClass 필요 |

Ingress가 사라진 것은 아닙니다. 기존 환경은 계속 존재합니다. 새 플랫폼이라면 Gateway API를 우선 검토하고, 컨트롤러의 유지보수 상태와 지원 기능을 확인합니다.

## 실습 1 — Envoy Gateway 설치와 Ready 확인

재현 가능한 실습을 위해 [Envoy Gateway 공식 quickstart](https://gateway.envoyproxy.io/docs/tasks/quickstart/)의 `v1.8.2`를 사용합니다. 이 설치가 Gateway API CRD와 controller를 함께 준비합니다.

```bash
helm upgrade --install eg \
  oci://docker.io/envoyproxy/gateway-helm \
  --version v1.8.2 \
  --namespace envoy-gateway-system \
  --create-namespace

kubectl wait --timeout=5m \
  --namespace envoy-gateway-system \
  deployment/envoy-gateway \
  --for=condition=Available

kubectl api-resources --api-group=gateway.networking.k8s.io
```

Gateway API 리소스가 조회되고 controller Deployment가 Available이어야 다음 단계로 갑니다. `GatewayClass eg`는 quickstart manifest가 만듭니다.

먼저 공식 예제를 그대로 통과시켜 설치 자체를 검증합니다.

```bash
kubectl apply -f \
  https://github.com/envoyproxy/gateway/releases/download/v1.8.2/quickstart.yaml \
  --namespace default

kubectl get gatewayclass eg
kubectl wait --timeout=5m --namespace default \
  gateway/eg --for=condition=Programmed

ENVOY_SERVICE=$(kubectl get service \
  --namespace envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=default,gateway.envoyproxy.io/owning-gateway-name=eg \
  -o jsonpath='{.items[0].metadata.name}')

kubectl port-forward \
  --namespace envoy-gateway-system \
  service/${ENVOY_SERVICE} 8888:80
```

다른 터미널에서 다음 요청이 `200`을 반환하는지 확인합니다.

```bash
curl --verbose --header 'Host: www.example.com' \
  http://localhost:8888/get
```

## 실습 2 — 우리 Service로 Gateway와 HTTPRoute 연결

```yaml
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
  name: web
  namespace: k8s-labs
spec:
  parentRefs:
    - name: course-gateway
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: web
          port: 80
```

```bash
kubectl apply -f gateway.yaml
kubectl wait --timeout=5m -n k8s-labs \
  gateway/course-gateway --for=condition=Programmed
kubectl get gateway,httproute -n k8s-labs
kubectl describe httproute web -n k8s-labs
```

`status.parents[].conditions`에서 `Accepted`, `ResolvedRefs`를 확인합니다. YAML이 저장됐다는 사실보다 Route가 controller에 수락되었는지가 중요합니다.

```bash
COURSE_ENVOY_SERVICE=$(kubectl get service \
  --namespace envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=k8s-labs,gateway.envoyproxy.io/owning-gateway-name=course-gateway \
  -o jsonpath='{.items[0].metadata.name}')

kubectl port-forward \
  --namespace envoy-gateway-system \
  service/${COURSE_ENVOY_SERVICE} 8889:80
```

다른 터미널에서 `curl http://localhost:8889/`로 5강의 `web` Service 응답을 확인합니다.

## TLS 종료 지점

```yaml
listeners:
  - name: https
    protocol: HTTPS
    port: 443
    hostname: course.local
    tls:
      mode: Terminate
      certificateRefs:
        - kind: Secret
          name: course-local-tls
```

TLS Secret은 같은 Namespace에 두고 `kubernetes.io/tls` 타입을 사용합니다. 운영에서는 수동 인증서보다 신뢰할 수 있는 발급·갱신 자동화와 만료 알림을 둡니다.

로컬 학습용 인증서는 다음처럼 만들 수 있습니다. 운영 인증서에 이 방식을 사용하지 않습니다.

```bash
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout course-local.key \
  -out course-local.crt \
  -days 7 \
  -subj '/CN=course.local' \
  -addext 'subjectAltName=DNS:course.local'

kubectl create secret tls course-local-tls \
  --cert=course-local.crt \
  --key=course-local.key \
  -n k8s-labs
```

## 일부러 망가뜨리기 — 존재하지 않는 backend

HTTPRoute의 `backendRefs.name`을 `missing-service`로 바꿉니다.

```bash
kubectl apply -f gateway.yaml
kubectl describe httproute web -n k8s-labs
```

`ResolvedRefs=False`와 함께 참조 실패 이유가 나타나야 합니다. controller 로그부터 보기 전에 Route status를 읽습니다.

장애 원인을 확인했으면 다음 강의에서 같은 Route를 사용할 수 있도록 backend를 복구합니다.

```bash
kubectl patch httproute web -n k8s-labs --type=json \
  -p='[{"op":"replace","path":"/spec/rules/0/backendRefs/0/name","value":"web"}]'

kubectl wait --for=jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'=True \
  httproute/web -n k8s-labs --timeout=2m
kubectl get httproute web -n k8s-labs -o yaml
```

`ResolvedRefs=True`를 확인해야 장애 실습이 끝난 것입니다.

## 과정 중에는 controller 유지하기

강의용 kind에서는 Envoy Gateway와 `GatewayClass eg`를 14강 캡스톤까지 유지합니다. 마지막에 kind 클러스터를 삭제하면 관련 CRD와 controller도 함께 정리됩니다.

공유 클러스터에서 이 강의만 따로 진행했다면 **캡스톤이 끝난 뒤** 다음처럼 정리합니다. 먼저 course Gateway와 Route를 삭제하고, 공식 예제와 controller를 제거합니다.

```bash
kubectl delete gateway course-gateway -n k8s-labs --ignore-not-found
kubectl delete httproute web -n k8s-labs --ignore-not-found
kubectl delete -f \
  https://github.com/envoyproxy/gateway/releases/download/v1.8.2/quickstart.yaml \
  --namespace default \
  --ignore-not-found=true
helm uninstall eg -n envoy-gateway-system
```

CRD까지 완전히 제거해야 하는 공유 클러스터라면 Envoy Gateway의 해당 버전 uninstall 문서를 따릅니다. 이 과정의 kind 클러스터는 마지막 강의에서 통째로 삭제합니다.

## 외부 트래픽 장애 순서

1. DNS가 진입점 주소를 가리키는가
2. LoadBalancer 또는 listener가 연결 가능한가
3. Gateway·Ingress status가 수락 상태인가
4. Route의 hostname과 path가 요청과 맞는가
5. backendRef가 실제 Service와 port를 가리키는가
6. EndpointSlice에 ready Pod가 있는가
7. NetworkPolicy와 애플리케이션 로그에 증거가 있는가

## 체크포인트

<div class="success-check">Gateway manifest가 apply됐지만 주소가 없을 때 controller·GatewayClass·status condition을 확인하고, missing backend를 `ResolvedRefs`에서 찾아내면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/08-probes-resources/">← 이전: Probe와 리소스</a><a href="/kubernetes/10-scheduling/">다음: 스케줄링 →</a></nav>

---
title: "05. Service와 DNS — 사라지는 Pod에 고정 주소 주기"
summary: "selector와 EndpointSlice를 추적하며 ClusterIP와 클러스터 DNS가 Pod까지 연결되는 경로를 익힙니다."
description: "Pod IP 대신 Service를 사용하는 이유와 네트워크 장애를 진단하는 순서를 배웁니다."
weight: 50
categories: ["Kubernetes"]
tags: ["Service", "DNS", "EndpointSlice", "Networking"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 05 · 3H · Networking</p>

Pod는 교체되고 IP도 바뀝니다. 호출자가 매번 새 IP를 알아내게 만들 수는 없습니다. Service는 labels로 대상 Pod를 찾아 **변하지 않는 이름과 가상 IP**를 제공합니다.

## 이 강의를 마치면

- Pod → Service → EndpointSlice의 연결을 추적할 수 있습니다.
- `port`, `targetPort`, `containerPort`의 차이를 설명할 수 있습니다.
- ClusterIP, NodePort, LoadBalancer의 용도를 구분할 수 있습니다.
- selector 불일치로 endpoint가 비는 장애를 진단할 수 있습니다.

## 요청이 이동하는 경로

```text
클라이언트 → web.k8s-labs.svc.cluster.local → ClusterIP → EndpointSlice → Pod IP:80
```

Service가 Pod를 “소유”하는 것은 아닙니다. selector와 일치하는 Pod를 동적으로 찾아 EndpointSlice에 반영합니다.

## 실습 1 — Service 만들기

4강의 `web` Deployment가 실행 중인지 확인하고 Service를 적용합니다.

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

`targetPort: http`는 Pod 컨테이너의 이름 붙은 port를 가리킵니다. 숫자를 중복하는 것보다 변경에 강합니다.

```bash
kubectl apply -f service.yaml
kubectl get service,endpointslice -n k8s-labs
kubectl describe service web -n k8s-labs
```

## 실습 2 — 클러스터 안에서 DNS 확인

```bash
kubectl run netcheck \
  --image=busybox:1.36 \
  --restart=Never \
  -n k8s-labs \
  -- sleep 3600

kubectl wait --for=condition=Ready pod/netcheck -n k8s-labs --timeout=2m
kubectl exec -n k8s-labs netcheck -- nslookup web
kubectl exec -n k8s-labs netcheck -- wget -qO- http://web
kubectl exec -n k8s-labs netcheck -- nslookup web.k8s-labs.svc.cluster.local
```

같은 Namespace에서는 `web`, 다른 Namespace에서는 `web.k8s-labs`처럼 호출합니다. 완전한 이름은 `web.k8s-labs.svc.cluster.local`입니다.

## 일부러 망가뜨리기 — selector mismatch

```bash
kubectl patch service web -n k8s-labs \
  -p '{"spec":{"selector":{"app":"does-not-exist"}}}'

kubectl get endpointslice -n k8s-labs \
  -l kubernetes.io/service-name=web -o yaml

kubectl exec -n k8s-labs netcheck -- wget -T 2 -qO- http://web
```

DNS는 풀리고 Service도 존재하지만 요청은 실패합니다. 이때 CoreDNS를 먼저 의심하면 순서가 틀렸습니다. Service의 selector와 EndpointSlice가 비었는지부터 확인합니다.

```bash
kubectl patch service web -n k8s-labs \
  -p '{"spec":{"selector":{"app":"web"}}}'
```

## Service 타입 선택

| 타입 | 사용 위치 | 주의점 |
|---|---|---|
| ClusterIP | 클러스터 내부 기본값 | 외부에서 직접 접근 불가 |
| NodePort | 노드 포트로 임시 노출 | 운영 진입점으로 남용하지 않음 |
| LoadBalancer | 클라우드·LB 연동 | kind가 자동으로 public IP를 만들지 않음 |
| ExternalName | 외부 DNS 별칭 | proxy가 아니라 DNS CNAME |

## 장애를 읽는 순서

1. 호출자가 DNS 이름을 해석하는가
2. Service selector가 Pod labels와 일치하는가
3. EndpointSlice에 ready endpoint가 있는가
4. `port`가 올바른 `targetPort`로 연결되는가
5. Pod가 그 포트에서 실제로 listen하는가
6. NetworkPolicy가 경로를 막는가

## 체크포인트

<div class="success-check">Service 이름은 풀리지만 timeout이 날 때 selector → EndpointSlice → targetPort → Pod listen 순서로 증거를 보여주면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/04-workloads/">← 이전: Deployment</a><a href="/kubernetes/06-config-secret/">다음: ConfigMap과 Secret →</a></nav>

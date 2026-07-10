---
title: "08. Probe와 리소스 — 살아 있음과 준비됨은 다르다"
summary: "startup·readiness·liveness probe와 requests·limits를 구분하고 OOMKilled를 직접 재현합니다."
description: "트래픽 진입, 재시작, 스케줄링, HPA의 기준이 되는 건강 상태와 리소스 선언을 배웁니다."
weight: 80
categories: ["Kubernetes"]
tags: ["Probes", "Resources", "OOMKilled"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 08 · 3H · Reliability</p>

프로세스가 실행 중이라고 요청을 받을 준비가 된 것은 아닙니다. 요청을 받을 준비가 되지 않았다는 이유로 프로세스를 죽여서도 안 됩니다. Probe 세 개는 서로 다른 질문을 합니다.

## 이 강의를 마치면

- startup, readiness, liveness probe의 역할을 구분할 수 있습니다.
- 외부 DB 상태를 liveness에 넣으면 왜 연쇄 장애가 나는지 설명할 수 있습니다.
- requests가 스케줄링과 HPA에, limits가 런타임 제한에 미치는 영향을 이해합니다.
- `OOMKilled`를 status와 Events에서 확인할 수 있습니다.

## Probe가 답하는 세 질문

| Probe | 질문 | 실패하면 |
|---|---|---|
| startup | 초기화가 끝났나 | 성공 전 readiness·liveness를 보류하고, 연속 실패 시 컨테이너 재시작 |
| readiness | 지금 트래픽을 받아도 되나 | Service endpoint에서 제외 |
| liveness | 프로세스가 회복 불가능하게 멈췄나 | 컨테이너 재시작 |

readiness는 트래픽, liveness는 재시작입니다. 이 둘을 같은 URL로 대충 처리하면 장애 때 가장 아픈 차이가 드러납니다.

## 실습 1 — 세 Probe 설정

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: probe-web
  namespace: k8s-labs
spec:
  replicas: 2
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
            httpGet: { path: /, port: http }
            periodSeconds: 2
            failureThreshold: 30
          readinessProbe:
            httpGet: { path: /, port: http }
            periodSeconds: 5
            failureThreshold: 2
          livenessProbe:
            httpGet: { path: /, port: http }
            periodSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
            limits:
              cpu: 250m
              memory: 128Mi
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

```bash
kubectl apply -f probe-web.yaml
kubectl rollout status deployment/probe-web -n k8s-labs
kubectl get pod -n k8s-labs -l app=probe-web
```

## 일부러 망가뜨리기 — readiness만 실패

readiness path를 `/not-ready`로 바꿔 적용합니다. liveness는 `/`로 유지합니다.

```bash
kubectl apply -f probe-web.yaml
kubectl get pod -n k8s-labs -l app=probe-web
kubectl describe pod -n k8s-labs -l app=probe-web
kubectl get endpointslice -n k8s-labs \
  -l kubernetes.io/service-name=probe-web -o yaml
```

새 ReplicaSet의 Pod는 `Running`이지만 `READY 0/1`이고 EndpointSlice에 들어가지 않습니다. RollingUpdate 중에는 기존 ready Pod가 endpoint로 남아 rollout이 멈출 수 있습니다. readiness 실패만으로 새 Pod의 restart count가 올라가면 안 됩니다.

## 실습 2 — OOMKilled 재현

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
      args: ["import time; data=bytearray(128*1024*1024); time.sleep(3600)"]
      resources:
        requests:
          memory: 32Mi
        limits:
          memory: 64Mi
```

```bash
kubectl apply -f memory-hog.yaml
kubectl wait -n k8s-labs pod/memory-hog \
  --for=jsonpath='{.status.phase}'=Failed \
  --timeout=90s
kubectl describe pod memory-hog -n k8s-labs
kubectl get pod memory-hog -n k8s-labs \
  -o jsonpath='{.status.containerStatuses[0].state.terminated.reason}{" exit="}{.status.containerStatuses[0].state.terminated.exitCode}{"\n"}'
```

memory limit 초과는 throttle이 아니라 종료로 이어집니다. CPU limit 초과는 보통 CPU throttling으로 나타납니다.

## 리소스 오해 바로잡기

- request는 예약금이 아니라 Scheduler가 배치 판단에 사용하는 기준입니다.
- limit을 크게 주면 성능이 자동으로 좋아지는 것이 아닙니다.
- HPA가 CPU utilization을 계산하려면 CPU request가 필요합니다.
- HPA는 Pod 수를 늘리지만 Node 수는 늘리지 않습니다.
- liveness가 DB 같은 외부 의존성을 검사하면 DB 장애 때 모든 Pod가 재시작할 수 있습니다.

## 체크포인트

<div class="success-check">readiness 실패 Pod가 재시작되지 않으면서 Service endpoint에서 빠지는 것을 보여주고, memory-hog의 종료 reason과 exit code를 설명하면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/07-storage/">← 이전: Volume과 StatefulSet</a><a href="/kubernetes/09-ingress-gateway/">다음: Ingress와 Gateway API →</a></nav>

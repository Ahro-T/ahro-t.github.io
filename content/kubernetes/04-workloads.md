---
title: "04. Deployment와 Workload — 복제·배포·롤백"
summary: "Deployment→ReplicaSet→Pod의 소유 관계를 읽고 scale, rolling update, rollback을 수행합니다."
description: "상태 없는 애플리케이션을 안전하게 배포하고 실패한 rollout을 복구합니다."
weight: 40
categories: ["Kubernetes"]
tags: ["Deployment", "ReplicaSet", "Rollout"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 04 · 3H · Deployments</p>

실무에서 Pod를 직접 배포하지 않습니다. 원하는 복제 수와 업데이트 전략을 Deployment에 선언하고, Deployment가 ReplicaSet을 통해 Pod를 관리하게 합니다.

## 이 강의를 마치면

- Deployment → ReplicaSet → Pod의 소유 관계를 추적할 수 있습니다.
- scale과 self-healing을 관찰할 수 있습니다.
- rolling update의 `maxSurge`, `maxUnavailable`을 설명할 수 있습니다.
- 실패한 배포를 멈추고 이전 revision으로 rollback할 수 있습니다.

## 어떤 Workload를 고를까

| 목적 | 객체 |
|---|---|
| 상태 없는 장기 실행 서비스 | Deployment |
| 모든 Node에 하나씩 실행 | DaemonSet |
| 안정적인 이름·순서가 필요한 상태 저장 앱 | StatefulSet |
| 완료되면 끝나는 작업 | Job |
| 일정에 따라 반복하는 작업 | CronJob |

## 실습 1 — Deployment 만들기

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: k8s-labs
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
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
```

```bash
kubectl apply -f deployment.yaml
kubectl rollout status deployment/web -n k8s-labs
kubectl get deployment,replicaset,pod -n k8s-labs -l app=web
```

`selector.matchLabels`와 `template.metadata.labels`가 맞아야 합니다. 이 연결이 끊기면 Deployment는 자기 Pod를 찾지 못합니다.

## 실습 2 — Self-healing은 새로 만드는 것

```bash
kubectl get pods -n k8s-labs -l app=web \
  -o custom-columns=NAME:.metadata.name,UID:.metadata.uid

kubectl delete pod -n k8s-labs -l app=web --wait=false

kubectl get pods -n k8s-labs -l app=web -w
```

새 Pod의 UID가 달라졌는지 확인합니다. self-healing은 손상된 Pod를 수리하는 기능이 아니라, 원하는 수를 맞추기 위해 **대체 객체를 생성하는 기능**입니다.

## 실습 3 — Rolling Update

```bash
kubectl set image deployment/web \
  web=nginx:1.28-alpine \
  -n k8s-labs

kubectl rollout status deployment/web -n k8s-labs
kubectl rollout history deployment/web -n k8s-labs
```

학습용으로 `set image`를 사용했지만 운영에서는 Git에 저장된 manifest나 Helm values를 변경하고 검증된 파이프라인으로 적용합니다.

## 일부러 망가뜨리기 — 실패한 Rollout

```bash
kubectl set image deployment/web \
  web=nginx:not-a-real-version \
  -n k8s-labs

kubectl rollout status deployment/web -n k8s-labs --timeout=45s
kubectl get rs,pod -n k8s-labs -l app=web
kubectl describe deployment web -n k8s-labs
```

기존 Pod가 남아 서비스가 유지되는지, 새 ReplicaSet의 Pod가 왜 준비되지 않는지 확인합니다.

```bash
kubectl rollout undo deployment/web -n k8s-labs
kubectl rollout status deployment/web -n k8s-labs
```

<details class="course-hint">
<summary>왜 apply 성공과 rollout 성공은 다른가?</summary>

`apply` 성공은 API Server가 객체를 받아 저장했다는 뜻입니다. 이미지 pull, 컨테이너 시작, readiness 통과까지는 각 컨트롤러와 kubelet이 이후에 수행합니다.

</details>

## 운영 체크리스트

- 이미지에 `latest`를 쓰지 않습니다. 가능하면 digest로 승격합니다.
- readiness probe 없이 `maxUnavailable: 0`만 믿지 않습니다.
- `progressDeadlineSeconds`와 파이프라인 timeout을 정합니다.
- rollback 전에 실패 원인과 영향 범위를 기록합니다.
- Job에 Deployment를, 장기 서비스에 Job을 쓰지 않습니다.

## 체크포인트

<div class="success-check">Pod 하나를 삭제한 뒤 새 Pod의 ownerReferences를 따라 ReplicaSet과 Deployment까지 추적하고, 실패한 image rollout을 이전 revision으로 복구하면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/03-pod/">← 이전: Pod</a><a href="/kubernetes/05-service-dns/">다음: Service와 DNS →</a></nav>

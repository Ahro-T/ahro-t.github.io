---
title: "10. 스케줄링 — 어떤 Pod를 어느 Node에 둘 것인가"
summary: "nodeSelector, affinity, taint·toleration, topology spread를 선택하고 Pending Pod를 진단합니다."
description: "Scheduler가 requests와 배치 제약을 평가하는 방식을 다중 노드 kind에서 확인합니다."
weight: 100
categories: ["Kubernetes"]
tags: ["Scheduler", "Affinity", "Taints", "Topology Spread"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 10 · 3H · Scheduling</p>

Scheduler는 “CPU가 가장 한가한 Node” 하나만 보고 결정하지 않습니다. 리소스 request, Node 상태, affinity, taint, topology 제약을 모두 통과하는 후보 중에서 점수를 계산합니다.

## 이 강의를 마치면

- hard constraint와 soft preference를 구분할 수 있습니다.
- nodeSelector, node affinity, pod anti-affinity의 용도를 설명할 수 있습니다.
- taint가 밀어내고 toleration이 허용하는 관계를 이해합니다.
- `FailedScheduling` Events에서 충돌한 제약을 찾을 수 있습니다.

## 배치 도구 선택

| 요구사항 | 도구 |
|---|---|
| 특정 label Node에만 배치 | nodeSelector 또는 required node affinity |
| 가능하면 특정 Node 선호 | preferred node affinity |
| 같은 앱 Pod를 서로 떨어뜨림 | pod anti-affinity 또는 topology spread |
| 전용 Node에 다른 Pod 진입 차단 | taint + 필요한 workload의 toleration |
| zone·node 간 균등 분산 | topologySpreadConstraints |

## 실습 1 — Node label로 배치

kind Node 이름을 확인하고 worker 하나에 label을 붙입니다.

```bash
kubectl get nodes
kubectl label node k8s-masterclass-worker workload=course
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: scheduled-pod
  namespace: k8s-labs
spec:
  nodeSelector:
    workload: course
  containers:
    - name: app
      image: nginx:1.27-alpine
      resources:
        requests:
          cpu: 50m
          memory: 32Mi
```

```bash
kubectl apply -f scheduled-pod.yaml
kubectl get pod scheduled-pod -n k8s-labs -o wide
```

## 실습 2 — Taint와 Toleration

```bash
kubectl taint node k8s-masterclass-worker dedicated=course:NoSchedule
```

기존 Pod가 즉시 사라지지는 않습니다. `NoSchedule`은 새 배치를 막습니다. 다음 toleration을 Pod spec에 추가하면 전용 Node 배치가 허용됩니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: tolerated-pod
  namespace: k8s-labs
spec:
  nodeSelector:
    workload: course
  tolerations:
    - key: dedicated
      operator: Equal
      value: course
      effect: NoSchedule
  containers:
    - name: app
      image: nginx:1.27-alpine
```

```bash
kubectl apply -f tolerated-pod.yaml
kubectl get pod tolerated-pod -n k8s-labs -o wide
```

Toleration은 그 Node로 강제 배치하지 않습니다. taint를 “견딜 자격”만 줍니다. 실제 선택은 nodeSelector나 affinity와 함께 지정합니다.

## 실습 3 — Replica를 Node에 분산

분산 실습에서는 worker 두 대가 모두 후보가 되도록 앞에서 만든 taint를 먼저 제거합니다.

```bash
kubectl taint node k8s-masterclass-worker dedicated=course:NoSchedule-
```

Deployment의 Pod template에 추가합니다.

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app: web
```

```bash
kubectl patch deployment web -n k8s-labs --type=merge -p '
{"spec":{"template":{"spec":{"topologySpreadConstraints":[{
  "maxSkew":1,
  "topologyKey":"kubernetes.io/hostname",
  "whenUnsatisfiable":"DoNotSchedule",
  "labelSelector":{"matchLabels":{"app":"web"}}
}]}}}}'

kubectl scale deployment/web -n k8s-labs --replicas=4
kubectl get pod -n k8s-labs -l app=web -o wide
```

control-plane은 기본 taint 때문에 제외되고 worker 두 대가 후보입니다. 두 worker에 replica가 최대 1 차이로 분산되는지 확인하세요.

## 일부러 망가뜨리기 — 충돌하는 제약

기존 Pod의 immutable spec을 덮어쓰지 않고, 존재하지 않는 label을 요구하는 새 Pod를 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: impossible-pod
  namespace: k8s-labs
spec:
  nodeSelector:
    impossible: "true"
  containers:
    - name: app
      image: nginx:1.27-alpine
```

```bash
kubectl apply -f impossible-pod.yaml
kubectl get pod impossible-pod -n k8s-labs
kubectl describe pod impossible-pod -n k8s-labs
```

`Pending`은 원인이 아닙니다. Events의 `FailedScheduling` 메시지에서 label 불일치, taint, 리소스 부족 중 어떤 필터에서 후보가 사라졌는지 읽습니다.

## 정리

```bash
kubectl delete pod scheduled-pod tolerated-pod impossible-pod \
  -n k8s-labs --ignore-not-found
kubectl label node k8s-masterclass-worker workload-
```

## 체크포인트

<div class="success-check">Pending Pod의 Events 한 줄을 배치 제약·taint·리소스 중 하나로 분류하고, 최소한의 수정으로 후보 Node를 만들면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/09-ingress-gateway/">← 이전: Ingress와 Gateway</a><a href="/kubernetes/11-security/">다음: 최소 권한 보안 →</a></nav>

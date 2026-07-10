---
title: "12. 확장성과 고가용성 — 트래픽과 장애를 견디기"
summary: "HPA, PDB, topology spread, graceful shutdown을 연결하고 각각의 보호 범위를 구분합니다."
description: "Pod 자동 확장과 자발적 중단 보호, 안전한 종료를 운영 관점에서 실습합니다."
weight: 120
categories: ["Kubernetes"]
tags: ["HPA", "PDB", "Autoscaling", "High Availability"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 12 · 3H · Availability</p>

Replica를 늘리는 것만으로 고가용성이 완성되지는 않습니다. 같은 Node에 몰려 있으면 Node 하나의 장애로 모두 사라지고, 종료 신호를 무시하면 rolling update 때 요청이 끊깁니다.

## 이 강의를 마치면

- HPA가 무엇을 늘리고 무엇을 늘리지 않는지 설명할 수 있습니다.
- CPU 기반 HPA에 request와 metrics pipeline이 필요한 이유를 이해합니다.
- PDB가 voluntary disruption만 제한한다는 것을 설명할 수 있습니다.
- graceful termination과 readiness 전환을 배포 전략에 연결할 수 있습니다.

## 실습 준비 — Metrics 확인

```bash
kubectl top nodes
kubectl top pods -n k8s-labs
```

Metrics API가 없다면 공식 metrics-server 설치 지침에 따라 add-on을 설치합니다. kind에서는 kubelet 인증서 때문에 별도 개발용 옵션이 필요할 수 있습니다. 이 옵션을 운영 클러스터의 기본값으로 복사하지 마세요.

강의용 kind에는 Metrics Server `v0.8.1`을 고정해 설치하고, 로컬 인증서에 한해 insecure TLS 옵션을 추가합니다.

```bash
kubectl apply -f \
  https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.1/components.yaml

kubectl patch deployment metrics-server -n kube-system \
  --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

kubectl rollout status deployment/metrics-server \
  -n kube-system --timeout=120s
kubectl top nodes
```

## 실습 1 — HPA 적용

공식 Kubernetes HPA 실습의 CPU 부하용 애플리케이션을 사용합니다. manifest에는 CPU request가 이미 포함되어 있습니다.

```bash
kubectl apply -n k8s-labs -f \
  https://k8s.io/examples/application/php-apache.yaml
kubectl rollout status deployment/php-apache -n k8s-labs
```

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: php-apache
  namespace: k8s-labs
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: php-apache
  minReplicas: 1
  maxReplicas: 10
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 120
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

```bash
kubectl apply -f hpa.yaml
kubectl get hpa php-apache -n k8s-labs
```

별도 터미널에서 부하를 생성합니다.

```bash
kubectl run loadgen \
  --image=busybox:1.36 \
  --restart=Never \
  -n k8s-labs -- \
  sh -c 'while sleep 0.01; do wget -q -O- http://php-apache >/dev/null; done'
```

다른 터미널에서 `kubectl get hpa php-apache -n k8s-labs --watch`를 실행하고 replica가 늘어나는 것을 확인한 뒤 `Ctrl-C`로 watch를 끝냅니다. 최종 replica 수는 환경마다 다를 수 있으므로 `currentMetrics`와 HPA Events를 증거로 확인합니다.

## 실습 2 — PDB와 Drain

이전 강의에서 만든 controller 없는 단일 Pod는 drain을 막을 수 있습니다. 데이터가 필요 없는 학습용 Pod만 명시적으로 정리합니다.

```bash
kubectl delete pod \
  pod-lab toolbox netcheck data-writer data-writer-missing \
  memory-hog secret-consumer secret-consumer-broken restricted-web loadgen \
  -n k8s-labs --ignore-not-found
```

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
  namespace: k8s-labs
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: web
```

```bash
kubectl apply -f pdb.yaml
kubectl get pdb -n k8s-labs
kubectl drain k8s-masterclass-worker \
  --ignore-daemonsets \
  --delete-emptydir-data
kubectl uncordon k8s-masterclass-worker
```

PDB는 drain 같은 **자발적 중단**에서 가용 Pod 수를 지키려 합니다. Node 전원 장애, 커널 패닉, Pod 자체 장애를 막아주지 않습니다.

## Graceful Termination의 시간순서

1. Pod에 deletion timestamp가 생김
2. Endpoint에서 제외되기 시작함
3. preStop hook이 실행되고 프로세스에 SIGTERM 전달
4. 애플리케이션이 새 요청을 거부하고 진행 중 요청을 마침
5. `terminationGracePeriodSeconds` 안에 종료
6. 시간이 끝나면 SIGKILL

애플리케이션이 SIGTERM을 처리하지 않으면 Kubernetes YAML만으로 graceful shutdown이 완성되지 않습니다.

## 고가용성 체크리스트

- replicas가 장애 도메인에 분산되어 있는가
- readiness가 실제 트래픽 가능 상태를 나타내는가
- requests가 현실적인가
- HPA scale-up과 scale-down 정책이 급격한 진동을 막는가
- PDB가 유지보수를 불가능하게 만들 정도로 엄격하지 않은가
- 종료 시간과 Load Balancer 연결 종료 시간이 맞는가

## 체크포인트

<div class="success-check">HPA가 Pod는 늘리지만 Node는 늘리지 않는다는 점, PDB가 비자발적 장애를 막지 못한다는 점을 각각 실제 상태와 Events로 설명하면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/11-security/">← 이전: 보안</a><a href="/kubernetes/13-helm-kustomize/">다음: Helm과 Kustomize →</a></nav>

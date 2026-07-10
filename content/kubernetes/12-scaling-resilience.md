---
title: "12. 확장성과 고가용성 — 트래픽과 장애를 견디기"
summary: "Metrics API를 준비하고 HPA 계산, scale-down, PDB가 막고 허용하는 drain을 끝까지 복구합니다."
description: "자동 확장과 자발적 중단 보호를 독립된 실습으로 분리해 각 기능의 보호 범위를 증거로 확인합니다."
weight: 120
categories: ["Kubernetes"]
tags: ["HPA", "PDB", "Autoscaling", "High Availability"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 12 · 3.5H · Availability</p>

## 이번에 해결할 문제

트래픽이 늘면 Pod를 늘리고, Node를 점검할 때는 서비스 가능한 Pod 수를 지켜야 합니다. 둘 다 “가용성”에 관한 기능이지만 HPA와 PDB는 전혀 다른 질문에 답합니다.

- HPA: 관측한 부하를 기준으로 **원하는 replica 수를 몇 개로 바꿀까?**
- PDB: 관리자가 Pod를 자발적으로 중단할 때 **지금 몇 개까지 내보내도 될까?**

이번 강의에서는 HPA가 실제로 scale-up과 scale-down하는 과정, PDB가 drain을 차단했다가 한 가지 변경으로 허용하는 과정을 각각 완주합니다.

## 시작 전 확인 — 독립된 실습 환경 만들기

```bash
kubectl --context kind-k8s-masterclass cluster-info
kubectl --context kind-k8s-masterclass wait --for=condition=Ready node --all --timeout=120s

kubectl --context kind-k8s-masterclass create namespace k8s-labs \
  --dry-run=client -o yaml | kubectl --context kind-k8s-masterclass apply -f -

WORKER_A=$(kubectl --context kind-k8s-masterclass get nodes \
  -l '!node-role.kubernetes.io/control-plane' \
  -o jsonpath='{.items[0].metadata.name}')
WORKER_B=$(kubectl --context kind-k8s-masterclass get nodes \
  -l '!node-role.kubernetes.io/control-plane' \
  -o jsonpath='{.items[1].metadata.name}')

if [ -z "$WORKER_A" ] || [ -z "$WORKER_B" ]; then
  printf 'PDB drain 실습에는 worker 두 대가 필요합니다.\n' >&2
else
  printf 'WORKER_A=%s\nWORKER_B=%s\n' "$WORKER_A" "$WORKER_B"
fi
```

HPA만 확인할 때는 worker 한 대도 가능하지만, drain 뒤 다른 Node에서 대체 Pod가 실행되는 것까지 보려면 worker 두 대가 필요합니다. Bash, macOS Zsh 또는 WSL2 Bash에서 진행하세요.

## 용어 다섯 개만 먼저 잡기

- **Metrics API**: HPA가 CPU·memory 같은 현재 사용량을 읽는 Kubernetes API
- **request**: Scheduler가 예약에 사용하고, CPU utilization HPA가 분모로 사용하는 기준값
- **HPA**: metrics를 보고 Deployment 같은 대상의 replica 수를 조정하는 controller
- **PDB**: 자발적 중단에서 동시에 unavailable이 될 수 있는 Pod 수를 제한하는 객체
- **voluntary disruption**: drain처럼 운영자가 Eviction API를 통해 계획적으로 일으키는 중단

## 두 controller가 보는 흐름

```text
Metrics Server → Metrics API → HPA → Deployment replicas 변경

kubectl drain → Eviction 요청 → PDB 허용 여부 → Pod 종료·재배치
```

HPA는 Node를 추가하지 않습니다. PDB는 Node 전원 장애나 애플리케이션 crash를 막지 않습니다. 각 기능이 바꾸는 객체와 바꾸지 못하는 범위를 함께 기억하세요.

## 1단계 — Metrics API가 Available이 될 때까지 기다립니다

먼저 현재 상태를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get apiservice v1beta1.metrics.k8s.io 2>/dev/null || :
kubectl --context kind-k8s-masterclass top node 2>/dev/null || :
```

이미 `kubectl top`이 정상 출력된다면 설치 명령은 건너뛰고 다음 절로 이동하세요. 그렇지 않다면 강의용 kind 클러스터에 Metrics Server `v0.8.1`을 설치합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f \
  https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.1/components.yaml

if ! kubectl --context kind-k8s-masterclass get deployment metrics-server -n kube-system \
  -o jsonpath='{.spec.template.spec.containers[0].args}' \
  | grep -q -- '--kubelet-insecure-tls'; then
  kubectl --context kind-k8s-masterclass patch deployment metrics-server -n kube-system \
    --type=json \
    -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
fi

kubectl --context kind-k8s-masterclass rollout status deployment/metrics-server \
  -n kube-system --timeout=180s
```

`--kubelet-insecure-tls`는 로컬 kind Node 인증서 때문에 사용하는 **학습 환경 전용 우회**입니다. 운영 클러스터 설정으로 복사하지 마세요.

Deployment가 Available이어도 aggregated API 등록에는 시간이 더 걸릴 수 있습니다.

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Available \
  apiservice/v1beta1.metrics.k8s.io \
  --timeout=180s
```

이제 `kubectl top`을 최대 12번, 5초 간격으로 재시도합니다. 첫 수집 주기가 끝나기 전의 `Metrics not available yet`은 잠시 기다릴 수 있는 상태입니다.

```bash
attempt=1
while ! kubectl --context kind-k8s-masterclass top node; do
  if [ "$attempt" -ge 12 ]; then
    printf 'Metrics API가 60초 안에 데이터를 반환하지 않았습니다.\n' >&2
    kubectl --context kind-k8s-masterclass get apiservice v1beta1.metrics.k8s.io
    kubectl --context kind-k8s-masterclass logs deployment/metrics-server -n kube-system --tail=80
    break
  fi
  printf 'metrics 대기 중: %s/12\n' "$attempt"
  attempt=$((attempt + 1))
  sleep 5
done
```

정상 출력에는 Node별 `CPU(cores)`, `CPU%`, `MEMORY(bytes)`, `MEMORY%`가 보입니다. timeout이 나면 HPA 실습을 계속하지 말고 APIService 상태와 Metrics Server 로그부터 고치세요.

## 2단계 — CPU request가 있는 애플리케이션 만들기

`hpa-app.yaml` 파일을 만듭니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hpa-demo
  namespace: k8s-labs
  labels:
    app: hpa-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hpa-demo
  template:
    metadata:
      labels:
        app: hpa-demo
    spec:
      containers:
        - name: app
          image: registry.k8s.io/hpa-example:1.0
          ports:
            - name: http
              containerPort: 80
          resources:
            requests:
              cpu: 100m
              memory: 32Mi
            limits:
              cpu: 500m
              memory: 128Mi
---
apiVersion: v1
kind: Service
metadata:
  name: hpa-demo
  namespace: k8s-labs
  labels:
    app: hpa-demo
spec:
  selector:
    app: hpa-demo
  ports:
    - name: http
      port: 80
      targetPort: http
```

```bash
kubectl --context kind-k8s-masterclass apply -f hpa-app.yaml
kubectl --context kind-k8s-masterclass rollout status deployment/hpa-demo \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get deployment,service -n k8s-labs -l app=hpa-demo
```

HPA가 CPU utilization을 계산하려면 `requests.cpu`가 필요합니다.

```text
CPU utilization = 현재 CPU 사용량 ÷ CPU request × 100
```

예를 들어 request가 `100m`이고 실제 사용량이 `120m`라면 utilization은 `120%`입니다.

## 3단계 — HPA 계산을 눈으로 따라갑니다

`hpa.yaml` 파일을 만듭니다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: hpa-demo
  namespace: k8s-labs
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: hpa-demo
  minReplicas: 1
  maxReplicas: 5
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 60
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

```bash
kubectl --context kind-k8s-masterclass apply -f hpa.yaml
kubectl --context kind-k8s-masterclass get hpa hpa-demo -n k8s-labs
kubectl --context kind-k8s-masterclass describe hpa hpa-demo -n k8s-labs
```

처음에는 `TARGETS`가 `<unknown>/50%`일 수 있습니다. Metrics API가 값을 제공할 때까지 최대 60초 기다린 뒤 다시 확인합니다.

HPA의 핵심 계산을 단순화하면 다음과 같습니다.

```text
desiredReplicas = ceil(currentReplicas × currentUtilization ÷ targetUtilization)

예: ceil(1 × 120 ÷ 50) = ceil(2.4) = 3
```

controller는 tolerance, 준비되지 않은 Pod, stabilization window 같은 조건도 함께 고려하므로 실제 값이 예시와 정확히 같지 않을 수 있습니다. 계산식은 방향을 이해하는 도구이고, 최종 증거는 HPA 상태와 Events입니다.

## 4단계 — 부하를 넣어 scale-up을 관찰합니다

`loadgen.yaml` 파일을 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: loadgen
  namespace: k8s-labs
spec:
  containers:
    - name: load
      image: busybox:1.36.1
      command:
        - sh
        - -c
        - while sleep 0.01; do wget -q -O- http://hpa-demo >/dev/null; done
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          memory: 32Mi
  restartPolicy: Never
```

```bash
kubectl --context kind-k8s-masterclass apply -f loadgen.yaml
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/loadgen --timeout=90s
```

다른 터미널에서 watch를 시작합니다.

```bash
kubectl --context kind-k8s-masterclass get hpa hpa-demo -n k8s-labs --watch
```

`REPLICAS`가 2 이상으로 늘어나면 `Ctrl-C`로 watch만 종료합니다. `Ctrl-C`는 HPA나 부하 Pod를 삭제하지 않습니다.

```bash
kubectl --context kind-k8s-masterclass get hpa hpa-demo -n k8s-labs
kubectl --context kind-k8s-masterclass get deployment hpa-demo -n k8s-labs
kubectl --context kind-k8s-masterclass get events -n k8s-labs \
  --field-selector involvedObject.name=hpa-demo \
  --sort-by=.lastTimestamp
```

예상 증거는 `SuccessfulRescale` Event와 2개 이상의 desired replica입니다. 환경이 느리면 몇 분 걸릴 수 있으며, `maxReplicas: 5`를 넘으면 안 됩니다.

<details class="course-hint"><summary>replica가 늘지 않는다면</summary><p><code>kubectl --context kind-k8s-masterclass describe hpa hpa-demo -n k8s-labs</code>에서 AbleToScale, ScalingActive 조건과 Events를 확인하세요. <code>kubectl --context kind-k8s-masterclass top pod -n k8s-labs -l app=hpa-demo</code>가 값을 보여주는지, Deployment에 CPU request가 있는지, loadgen이 Running인지 순서대로 확인합니다.</p></details>

## 5단계 — 부하를 없애고 scale-down까지 기다립니다

부하 Pod 하나만 삭제합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod loadgen -n k8s-labs --wait=true
```

`stabilizationWindowSeconds: 60`과 HPA 동기화 주기 때문에 replica가 즉시 1로 줄지 않습니다. 아래 bounded loop는 최대 약 6분 동안 상태를 확인합니다.

```bash
attempt=1
while [ "$attempt" -le 36 ]; do
  REPLICAS=$(kubectl --context kind-k8s-masterclass get deployment hpa-demo -n k8s-labs \
    -o jsonpath='{.spec.replicas}')
  TARGET=$(kubectl --context kind-k8s-masterclass get hpa hpa-demo -n k8s-labs \
    -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}' 2>/dev/null)
  printf 'attempt=%s replicas=%s cpu=%s%%\n' \
    "$attempt" "$REPLICAS" "${TARGET:-unknown}"
  [ "$REPLICAS" = "1" ] && break
  attempt=$((attempt + 1))
  sleep 10
done
```

예상 최종 상태는 Deployment replica `1`입니다. 6분 뒤에도 줄지 않으면 `kubectl describe hpa`의 조건과 남은 부하를 확인합니다.

### HPA 실습 정리

```bash
kubectl --context kind-k8s-masterclass delete -f hpa.yaml --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass delete -f hpa-app.yaml --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass delete pod loadgen -n k8s-labs --ignore-not-found --wait=true
```

Metrics Server는 14강에서도 사용할 수 있으므로 클러스터에 유지합니다.

## 6단계 — PDB 전용 Deployment 만들기

HPA와 섞지 않기 위해 새 애플리케이션을 사용합니다. `pdb-demo.yaml` 파일을 만듭니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pdb-demo
  namespace: k8s-labs
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pdb-demo
  template:
    metadata:
      labels:
        app: pdb-demo
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          readinessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 3
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
```

```bash
kubectl --context kind-k8s-masterclass apply -f pdb-demo.yaml
kubectl --context kind-k8s-masterclass rollout status deployment/pdb-demo \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=pdb-demo -o wide
```

이 실습은 다른 강의의 Pod를 삭제하지 않습니다. `kubectl drain`에는 `--pod-selector=app=pdb-demo`를 사용해 대상 범위를 이 Deployment로 제한합니다.

## 7단계 — 엄격한 PDB가 drain을 막는 증거를 봅니다

`pdb.yaml` 파일을 만듭니다.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: pdb-demo
  namespace: k8s-labs
spec:
  maxUnavailable: 0
  selector:
    matchLabels:
      app: pdb-demo
```

```bash
kubectl --context kind-k8s-masterclass apply -f pdb.yaml
kubectl --context kind-k8s-masterclass get pdb pdb-demo -n k8s-labs

DRAIN_NODE=$(kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=pdb-demo \
  -o jsonpath='{.items[0].spec.nodeName}')
printf 'drain 대상: %s\n' "$DRAIN_NODE"
```

`maxUnavailable: 0`은 정상 Pod를 한 개도 자발적으로 중단하지 못하게 합니다. 다음 함수와 trap은 timeout 또는 `Ctrl-C` 뒤에도 Node를 schedulable 상태로 돌리기 위한 안전장치입니다.

```bash
cleanup_drain_node() {
  kubectl --context kind-k8s-masterclass uncordon "$DRAIN_NODE" >/dev/null 2>&1 || true
}
trap 'cleanup_drain_node' INT TERM

if kubectl --context kind-k8s-masterclass drain "$DRAIN_NODE" \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --pod-selector=app=pdb-demo \
  --timeout=30s; then
  printf '예상과 다름: maxUnavailable=0인데 drain이 완료되었습니다.\n' >&2
else
  printf '예상한 실패: PDB가 eviction을 막았습니다.\n'
fi

cleanup_drain_node
trap - INT TERM
```

예상 실패에는 `Cannot evict pod as it would violate the pod's disruption budget` 또는 timeout이 포함됩니다. 증거를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get node "$DRAIN_NODE"
kubectl --context kind-k8s-masterclass get pdb pdb-demo -n k8s-labs \
  -o custom-columns=NAME:.metadata.name,ALLOWED:.status.disruptionsAllowed,CURRENT:.status.currentHealthy,DESIRED:.status.desiredHealthy
```

`ALLOWED`가 `0`이고 Node의 `SchedulingDisabled` 표시가 사라져야 첫 실험의 복구가 끝난 것입니다.

## 8단계 — 한 값만 완화하고 drain을 완료합니다

PDB의 `maxUnavailable`만 `0`에서 `1`로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass patch pdb pdb-demo -n k8s-labs \
  --type=merge -p '{"spec":{"maxUnavailable":1}}'

attempt=1
while [ "$attempt" -le 12 ]; do
  ALLOWED=$(kubectl --context kind-k8s-masterclass get pdb pdb-demo -n k8s-labs \
    -o jsonpath='{.status.disruptionsAllowed}')
  printf 'disruptionsAllowed=%s\n' "$ALLOWED"
  [ "$ALLOWED" -ge 1 ] 2>/dev/null && break
  attempt=$((attempt + 1))
  sleep 5
done
```

이번 drain에도 같은 안전장치를 둡니다.

```bash
cleanup_drain_node() {
  kubectl --context kind-k8s-masterclass uncordon "$DRAIN_NODE" >/dev/null 2>&1 || true
}
trap 'cleanup_drain_node' INT TERM

kubectl --context kind-k8s-masterclass drain "$DRAIN_NODE" \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --pod-selector=app=pdb-demo \
  --timeout=120s
DRAIN_RESULT=$?

cleanup_drain_node
trap - INT TERM

if [ "$DRAIN_RESULT" -ne 0 ]; then
  printf 'drain이 완료되지 않았습니다. Events와 PDB 상태를 확인하세요.\n' >&2
else
  printf 'drain 완료, Node uncordon 완료\n'
fi
```

마지막으로 Deployment가 다시 두 개의 Ready replica를 확보하는지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass rollout status deployment/pdb-demo \
  -n k8s-labs --timeout=180s
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=pdb-demo -o wide
kubectl --context kind-k8s-masterclass get node "$DRAIN_NODE"
```

`maxUnavailable: 1`은 항상 한 개를 죽인다는 뜻이 아닙니다. Eviction이 한 번에 한 개 unavailable을 만들 수 있도록 허용하고, controller가 대체 Pod를 준비하면 다음 중단을 진행할 수 있게 합니다.

## 연습 — replicas가 1인데 minAvailable도 1이면?

`pdb-demo` Deployment를 replica 1로 줄이고 PDB를 `minAvailable: 1`로 바꾸면 drain은 어떻게 될지 먼저 예측하세요. 실제로 확인한 뒤 반드시 replica 2, `maxUnavailable: 1` 상태로 복구합니다.

<details class="course-hint"><summary>힌트</summary><p>정상 Pod가 한 개뿐이고 그 한 개를 유지해야 한다면 <code>disruptionsAllowed</code>는 얼마여야 할까요? drain 전 <code>kubectl --context kind-k8s-masterclass get pdb pdb-demo -n k8s-labs</code>로 숫자를 먼저 확인하세요.</p></details>

<details class="course-hint"><summary>정답과 복구</summary><p><code>disruptionsAllowed=0</code>이므로 drain은 차단됩니다. 테스트가 끝나면 drain 대상 Node를 반드시 <code>kubectl --context kind-k8s-masterclass uncordon "$DRAIN_NODE"</code>하고, Deployment를 replica 2로 되돌린 뒤 PDB를 <code>maxUnavailable: 1</code>로 복구합니다. <code>kubectl --context kind-k8s-masterclass rollout status deployment/pdb-demo -n k8s-labs --timeout=180s</code>가 완료되어야 합니다.</p></details>

## 실습 환경 정리

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass delete -f pdb.yaml --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass delete -f pdb-demo.yaml --ignore-not-found --wait=true
```

`kubectl --context kind-k8s-masterclass get nodes`에서 어떤 Node도 `SchedulingDisabled`이면 안 됩니다. 남아 있다면 `kubectl --context kind-k8s-masterclass uncordon "$DRAIN_NODE"`을 실행한 뒤 강의를 끝냅니다.

## 세 문장 정리

HPA는 현재 사용량을 request와 비교해 workload의 desired replica 수를 바꾸며 Node 수는 바꾸지 않습니다. PDB는 drain 같은 자발적 eviction만 제한하고 비자발적 장애를 예방하지 않습니다. Timeout이나 Ctrl-C가 발생한 drain 실습에서는 결과보다 먼저 Node를 uncordon해 운영 가능한 상태로 복구해야 합니다.

## 다음 강의로 가져갈 상태

- `hpa-demo`, `loadgen`, `pdb-demo`와 관련 Service·HPA·PDB가 없어야 합니다.
- 모든 Node가 Ready이고 `SchedulingDisabled`가 없어야 합니다.
- Metrics Server와 `v1beta1.metrics.k8s.io` APIService는 14강을 위해 유지해도 됩니다.
- `k8s-labs` Namespace는 유지합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/11-security/">← 이전: 보안</a><a href="/kubernetes/13-helm-kustomize/">다음: Helm과 Kustomize →</a></nav>

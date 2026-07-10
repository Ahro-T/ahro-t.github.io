---
title: "10. 스케줄링 — 어떤 Pod를 어느 Node에 둘 것인가"
summary: "동적으로 찾은 두 worker에서 label, taint·toleration, topology spread를 한 단계씩 실험합니다."
description: "Pending을 실패로만 보지 않고 Scheduler Events로 후보 Node가 사라진 이유를 찾는 초보자 실습입니다."
weight: 100
categories: ["Kubernetes"]
tags: ["Scheduler", "Affinity", "Taints", "Topology Spread"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 10 · 3H · Scheduling</p>

## 이번에 해결할 문제

Pod를 만들었다고 아무 Node에서나 실행되는 것은 아닙니다. Scheduler는 **실행 가능한 Node를 먼저 걸러낸 뒤**, 남은 후보의 점수를 비교해 한 곳을 고릅니다.

이번 강의에서는 Node 이름을 외워 적지 않습니다. 현재 클러스터에서 worker 두 대를 동적으로 찾고, 아래 질문을 차례로 해결합니다.

1. 특정 worker에만 Pod를 놓으려면 무엇을 표시해야 할까요?
2. 전용 Node에 허가받지 않은 Pod가 들어오지 못하게 하려면 어떻게 할까요?
3. replica 여러 개를 두 worker에 고르게 나누려면 어떤 숫자를 확인해야 할까요?

## 시작 전 확인 — worker 두 대가 반드시 필요합니다

이 실습은 1강에서 만든 다중 노드 kind 클러스터를 기준으로 하지만, 앞 강의의 리소스에는 의존하지 않습니다. Bash, macOS Zsh 또는 WSL2의 Bash에서 **같은 터미널 창**을 계속 사용하세요. 아래에서 만든 환경 변수는 새 터미널로 자동 전달되지 않습니다.

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
  printf 'worker가 두 대 이상 필요합니다.\n' >&2
  printf '1강의 kind 설정으로 다중 노드 클러스터를 다시 만드세요.\n' >&2
else
  printf 'WORKER_A=%s\nWORKER_B=%s\n' "$WORKER_A" "$WORKER_B"
fi
```

예상 결과는 서로 다른 두 Node 이름입니다.

```text
WORKER_A=k8s-masterclass-worker
WORKER_B=k8s-masterclass-worker2
```

이름이 예시와 달라도 정상입니다. 중요한 것은 `WORKER_A`와 `WORKER_B`가 비어 있지 않고 서로 다르다는 점입니다.

<details class="course-hint"><summary>worker가 한 대뿐이라면</summary><p>이 강의에서는 계속 진행하지 마세요. topology spread의 결과를 한 Node에서는 관찰할 수 없습니다. 현재 실습 리소스를 정리한 뒤 1강의 kind 설정에서 worker 항목을 두 개로 만들고 클러스터를 다시 생성하세요.</p></details>

## 용어 다섯 개만 먼저 잡기

- **Scheduler**: 아직 Node가 정해지지 않은 Pod에 실행 위치를 정하는 control plane 구성요소
- **label과 nodeSelector**: Node에 붙인 표식과, 그 표식을 반드시 요구하는 가장 단순한 배치 조건
- **taint와 toleration**: Node가 Pod를 밀어내는 조건과, 그 조건을 견딜 수 있다는 Pod의 허가증
- **topology domain**: `hostname`, zone처럼 Pod 수를 따로 세는 구역
- **maxSkew**: 가장 많은 domain과 가장 적은 domain의 Pod 수 차이에 허용하는 최댓값

`nodeSelector`와 `required` affinity는 반드시 지켜야 하는 **hard constraint**입니다. `preferred` affinity는 가능하면 따르는 **soft preference**입니다. 초보 실습에서는 먼저 결과가 명확한 hard constraint부터 사용합니다.

## Scheduler가 보는 흐름

```text
새 Pod
  ↓
Ready Node인가?
  ↓
request를 수용할 수 있는가?
  ↓
nodeSelector와 taint 조건을 통과하는가?
  ↓
topology spread를 지킬 수 있는가?
  ↓
남은 후보의 점수를 비교해 Node 결정
```

후보가 하나도 남지 않으면 Pod는 `Pending`에 머뭅니다. 이때 정답은 Pod를 반복해서 삭제하는 것이 아니라 Events의 `FailedScheduling`을 읽는 것입니다.

## 1단계 — Node에 이름표를 붙이고 Pod 하나 배치하기

두 worker만 실습 후보가 되도록 공통 label을 붙이고, 서로 구분할 label도 붙입니다.

```bash
kubectl --context kind-k8s-masterclass label node "$WORKER_A" course-worker=true lab-node=dedicated --overwrite
kubectl --context kind-k8s-masterclass label node "$WORKER_B" course-worker=true lab-node=general --overwrite

kubectl --context kind-k8s-masterclass get node "$WORKER_A" "$WORKER_B" \
  -L course-worker,lab-node
```

예상 결과:

```text
NAME                         STATUS   COURSE-WORKER   LAB-NODE
k8s-masterclass-worker       Ready    true            dedicated
k8s-masterclass-worker2      Ready    true            general
```

이제 `scheduled-pod.yaml` 파일을 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: scheduled-pod
  namespace: k8s-labs
spec:
  nodeSelector:
    lab-node: general
  containers:
    - name: web
      image: nginx:1.27-alpine
      resources:
        requests:
          cpu: 50m
          memory: 32Mi
```

적용한 뒤 Ready를 기다리고 실제 Node를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f scheduled-pod.yaml
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/scheduled-pod --timeout=90s
kubectl --context kind-k8s-masterclass get pod scheduled-pod -n k8s-labs -o wide
```

`NODE` 열에는 `$WORKER_B`의 값이 나와야 합니다. `lab-node=general`인 Node가 한 대뿐이기 때문입니다.

**왜 이 단계를 하나요?** Scheduler는 YAML에 Node 이름을 저장한 것이 아닙니다. label 조건을 만족하는 후보를 찾아 그중 하나를 선택했습니다. 나중에 Node가 교체되어도 같은 label을 붙이면 동일한 규칙을 사용할 수 있습니다.

## 2단계 — taint는 막고 toleration은 통과시킵니다

전용 worker인 `$WORKER_A`에 taint 하나를 붙입니다.

```bash
kubectl --context kind-k8s-masterclass taint node "$WORKER_A" dedicated=course:NoSchedule --overwrite
kubectl --context kind-k8s-masterclass describe node "$WORKER_A" | grep -A2 '^Taints:'
```

`NoSchedule`은 **앞으로 배치할 Pod**를 막습니다. 이미 실행 중인 Pod를 즉시 쫓아내는 효과가 아닙니다.

### 먼저 허가증이 없는 Pod를 만들어 실패를 확인합니다

`taint-pod.yaml`을 다음 내용으로 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: taint-pod
  namespace: k8s-labs
spec:
  nodeSelector:
    lab-node: dedicated
  containers:
    - name: web
      image: nginx:1.27-alpine
      resources:
        requests:
          cpu: 50m
          memory: 32Mi
```

```bash
kubectl --context kind-k8s-masterclass apply -f taint-pod.yaml

if kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/taint-pod --timeout=20s; then
  printf '예상과 다름: Pod가 Ready가 되었습니다.\n' >&2
else
  printf '예상한 실패: taint 때문에 Pending입니다.\n'
fi
```

예상 실패는 `timed out waiting for the condition`입니다. 이제 추측하지 말고 증거를 읽습니다.

```bash
kubectl --context kind-k8s-masterclass get pod taint-pod -n k8s-labs
kubectl --context kind-k8s-masterclass get events -n k8s-labs \
  --field-selector involvedObject.name=taint-pod \
  --sort-by=.lastTimestamp
```

Events에는 다음 뜻의 `FailedScheduling` 메시지가 있어야 합니다.

```text
node(s) had untolerated taint {dedicated: course}
```

### 하나만 변경합니다 — toleration 추가

`taint-pod.yaml`의 `nodeSelector` 아래에 다음 블록만 추가합니다.

```yaml
  tolerations:
    - key: dedicated
      operator: Equal
      value: course
      effect: NoSchedule
```

실행 중인 Pod의 배치 조건을 바꾸려 하지 말고 기존 Pod를 지운 뒤 같은 파일로 다시 만듭니다.

```bash
kubectl --context kind-k8s-masterclass delete pod taint-pod -n k8s-labs --wait=true
kubectl --context kind-k8s-masterclass apply -f taint-pod.yaml
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/taint-pod --timeout=90s
kubectl --context kind-k8s-masterclass get pod taint-pod -n k8s-labs -o wide
```

이번에는 `$WORKER_A`에서 `Running`이어야 합니다. `nodeSelector`가 전용 Node를 선택했고, toleration이 그 Node의 taint를 통과시켰습니다.

> toleration만으로는 특정 Node에 가라고 지시하지 않습니다. “이 taint를 견딜 수 있다”는 허가만 제공하므로, 전용 배치에는 label 조건을 함께 사용합니다.

### 반드시 복구 — taint를 남기지 않습니다

다음 분산 실습 전에 taint와 단일 Pod를 제거합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod taint-pod scheduled-pod \
  -n k8s-labs --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass taint node "$WORKER_A" dedicated=course:NoSchedule-
```

마지막 명령이 `taint ... not found`를 출력한다면 이미 제거된 상태입니다. 그 외 오류라면 다음 단계로 넘어가지 말고 `kubectl --context kind-k8s-masterclass describe node "$WORKER_A"`로 확인하세요.

## 3단계 — topology spread의 숫자를 직접 계산합니다

`spread-demo.yaml` 파일을 만듭니다. control-plane이 아니라 앞에서 표시한 worker 두 대만 후보가 됩니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spread-demo
  namespace: k8s-labs
spec:
  replicas: 4
  selector:
    matchLabels:
      app: spread-demo
  template:
    metadata:
      labels:
        app: spread-demo
    spec:
      nodeSelector:
        course-worker: "true"
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: spread-demo
      containers:
        - name: web
          image: nginx:1.27-alpine
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
```

```bash
kubectl --context kind-k8s-masterclass apply -f spread-demo.yaml
kubectl --context kind-k8s-masterclass rollout status deployment/spread-demo \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=spread-demo \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName
```

replica가 네 개라면 일반적으로 두 worker에 `2 대 2`로 나뉩니다. 이때 skew는 다음과 같습니다.

```text
maxSkew 계산 = 가장 많은 Node의 Pod 수 - 가장 적은 Node의 Pod 수
              = 2 - 2
              = 0
```

실제 수를 셉니다.

```bash
A_COUNT=$(kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=spread-demo \
  --field-selector spec.nodeName="$WORKER_A" --no-headers | wc -l | tr -d ' ')
B_COUNT=$(kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=spread-demo \
  --field-selector spec.nodeName="$WORKER_B" --no-headers | wc -l | tr -d ' ')

printf '%s=%s, %s=%s\n' \
  "$WORKER_A" "$A_COUNT" "$WORKER_B" "$B_COUNT"
```

이제 **replica 수만** 5로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass scale deployment/spread-demo -n k8s-labs --replicas=5
kubectl --context kind-k8s-masterclass rollout status deployment/spread-demo \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=spread-demo \
  -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName
```

정상 결과는 `3 대 2` 또는 `2 대 3`이며 skew는 `1`입니다. `maxSkew: 1`은 각 Node에 같은 수를 보장하는 설정이 아니라, 가장 큰 차이를 1 이하로 제한하는 설정입니다.

<details class="course-hint"><summary>한 Node에만 몰렸다면</summary><p><code>kubectl --context kind-k8s-masterclass get node "$WORKER_A" "$WORKER_B" -L course-worker</code>로 두 Node 모두 값이 <code>true</code>인지 확인하세요. 이어서 Pending Pod의 Events에서 taint, request 부족, topology 조건 중 어떤 이유가 표시되는지 읽습니다.</p></details>

## 연습 — Pending을 고치는 최소 변경 찾기

`spread-demo.yaml`의 `nodeSelector.course-worker` 값을 `missing`으로 한 번만 바꿔 적용하세요. 새 ReplicaSet의 Pod가 Pending이면 다음 순서로 증거를 모으고, 원래 값 `"true"`로 복구합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f spread-demo.yaml
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=spread-demo
kubectl --context kind-k8s-masterclass get events -n k8s-labs --sort-by=.lastTimestamp
```

<details class="course-hint"><summary>힌트</summary><p>Deployment가 존재하는 것과 새 rollout이 성공하는 것은 다릅니다. <code>kubectl --context kind-k8s-masterclass rollout status deployment/spread-demo -n k8s-labs --timeout=30s</code>의 timeout과 새 Pod의 <code>FailedScheduling</code>을 함께 보세요.</p></details>

<details class="course-hint"><summary>정답과 복구</summary><p><code>course-worker=missing</code>을 요구하는 Node가 없어서 모든 후보가 label 단계에서 제거됩니다. 값을 <code>"true"</code>로 되돌리고 <code>kubectl --context kind-k8s-masterclass apply -f spread-demo.yaml</code>, <code>kubectl --context kind-k8s-masterclass rollout status deployment/spread-demo -n k8s-labs --timeout=120s</code>를 실행합니다. rollout 완료가 복구 기준입니다.</p></details>

## 실습 환경 정리

```bash
kubectl --context kind-k8s-masterclass delete deployment spread-demo \
  -n k8s-labs --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass delete pod scheduled-pod taint-pod \
  -n k8s-labs --ignore-not-found --wait=true

TAINTS=$(kubectl --context kind-k8s-masterclass get node "$WORKER_A" \
  -o jsonpath='{range .spec.taints[*]}{.key}={.value}:{.effect}{"\n"}{end}')
if printf '%s\n' "$TAINTS" | grep -q '^dedicated=course:NoSchedule$'; then
  kubectl --context kind-k8s-masterclass taint node \
    "$WORKER_A" dedicated=course:NoSchedule-
fi
kubectl --context kind-k8s-masterclass label node "$WORKER_A" course-worker- lab-node-
kubectl --context kind-k8s-masterclass label node "$WORKER_B" course-worker- lab-node-
```

마지막 두 label 명령은 다음 강의가 특정 배치 조건에 묶이지 않도록 원래 상태로 돌리는 과정입니다. `not labeled`는 이미 정리되었다는 뜻이므로 괜찮습니다.

## 세 문장 정리

Scheduler는 먼저 조건을 통과하지 못한 Node를 제거하고, 남은 후보 중에서 실행 위치를 고릅니다. Taint는 Node가 거부하는 조건이고 toleration은 그 조건을 통과할 허가일 뿐, 배치 지시가 아닙니다. Topology spread에서는 replica 수가 아니라 domain별 Pod 수의 최댓값과 최솟값 차이를 계산해야 합니다.

## 다음 강의로 가져갈 상태

- `spread-demo`, `scheduled-pod`, `taint-pod`가 없어야 합니다.
- 두 worker에 실습용 taint와 `course-worker`, `lab-node` label이 없어야 합니다.
- `k8s-labs` Namespace와 다중 노드 클러스터는 유지합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/09-ingress-gateway/">← 이전: Ingress와 Gateway</a><a href="/kubernetes/11-security/">다음: 최소 권한 보안 →</a></nav>

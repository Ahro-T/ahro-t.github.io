---
title: "01. 쿠버네티스는 왜 존재하는가 — 선언과 조정 루프"
summary: "원하는 상태와 현재 상태의 차이를 줄이는 조정 루프를 첫 kind 클러스터에서 천천히 관찰합니다."
description: "control-plane 1대와 worker 2대인 kind 클러스터를 만들고 spec, status, API Server, controller의 관계를 초보자 눈높이에서 익힙니다."
weight: 10
categories: ["Kubernetes"]
tags: ["Kubernetes", "kind", "Control Plane"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 01 · Beginner · Mental Model</p>

## 이번 시간에 해결할 문제

웹 서버 두 개를 실행해야 한다고 가정해봅시다. 직접 실행한 프로세스 하나가 꺼지면 사람이 다시 켜야 합니다. 서버를 세 개로 늘리려면 명령을 또 실행하고, 어느 서버에서 실행 중인지도 따로 기록해야 합니다.

쿠버네티스는 이 일을 “명령을 몇 번 실행했는가”가 아니라 **지금 어떤 상태여야 하는가**라는 문제로 바꿉니다.

> 사용자가 원하는 상태를 저장하면, 쿠버네티스가 현재 상태를 계속 관찰하고 둘의 차이를 줄입니다.

이번 강의에서는 작은 로컬 클러스터를 만든 뒤 웹 서버 두 개를 선언합니다. 복제 수를 바꾸고 Pod 하나를 삭제하면서 쿠버네티스가 차이를 발견하고 복구하는 모습을 직접 확인합니다.

## 이 강의를 마치면

- 클러스터와 Node의 관계를 말할 수 있습니다.
- `spec`과 `status`를 각각 “원하는 상태”와 “관찰된 상태”로 설명할 수 있습니다.
- API Server와 controller가 어떤 순서로 일하는지 설명할 수 있습니다.
- Pod가 삭제된 뒤 새 Pod가 생기는 현상을 재시작과 구분할 수 있습니다.

## 시작 전 확인

이 강의는 터미널과 Docker의 기본 사용법만 알고 있다고 가정합니다. 클라우드 계정은 필요하지 않습니다.

다음 세 명령이 모두 버전을 출력해야 합니다.

```bash
docker version
kind version
kubectl version --client
```

예상 결과:

- `docker version`에 Client와 Server 정보가 함께 보입니다.
- `kind version`에 `kind v...`가 보입니다.
- `kubectl version --client`에 Client Version이 보입니다.

Docker Server 연결 오류가 보이면 Docker Desktop 또는 Docker Engine을 먼저 실행하세요. `command not found`가 보이면 해당 도구를 설치한 뒤 다시 확인합니다.

{{< alert "triangle-exclamation" >}}
이미 `k8s-masterclass`라는 kind 클러스터를 사용 중이라면 바로 삭제하지 마세요. 아래 실습은 이 이름을 강의 전용으로 사용합니다. 기존 클러스터가 강의용인지 먼저 `kind get clusters`로 확인하세요.
{{< /alert >}}

```bash
kind get clusters
```

목록에 `k8s-masterclass`가 없다면 그대로 진행합니다. 이미 있고 처음부터 다시 만들고 싶다면 보존할 리소스가 없는지 확인한 뒤 `kind delete cluster --name k8s-masterclass`로 초기화할 수 있습니다.

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 오늘 확인할 곳 |
|---|---|---|
| Cluster | 쿠버네티스가 관리하는 전체 환경 | kind로 만들 환경 |
| Node | 컨테이너가 실제로 실행되는 한 대의 작업 공간 | `kubectl get nodes` |
| API Server | 요청과 상태가 드나드는 쿠버네티스의 정문 | 모든 `kubectl` 요청의 도착점 |
| `spec` / `status` | 원하는 상태 / 실제로 관찰된 상태 | Deployment YAML |
| 조정 루프 | 둘의 차이를 발견하고 줄이는 반복 작업 | 복제 수 변경과 Pod 삭제 |

## 먼저 그림으로 이해하기

```text
우리의 선언
"nginx Pod가 2개 필요해"
        │ kubectl apply
        ▼
┌────────────────── Cluster ──────────────────┐
│ API Server                                  │
│   원하는 상태(spec)를 저장                  │
│        │                                     │
│        ▼                                     │
│ Controller: 원하는 수와 현재 수를 반복 비교 │
│        │ 부족하면 새 Pod 생성 요청           │
│        ▼                                     │
│ Scheduler: Pod를 실행할 Node 선택            │
│        │                                     │
│        ▼                                     │
│ Node의 kubelet: 컨테이너 실행                 │
│        │                                     │
│        └──── 실제 상태(status) 보고 ────────┘│
└──────────────────────────────────────────────┘
```

오늘은 구성요소 이름을 모두 외울 필요가 없습니다. 핵심은 **API Server에 선언이 저장되고, controller가 차이를 줄이는 일을 반복한다**는 흐름입니다.

## 실습 1 — 역할이 나뉜 세 Node 클러스터 만들기

이 과정의 후반부에서는 Pod를 여러 Node에 분산하고 한 Node를 점검 상태로 전환합니다. 같은 환경을 계속 사용하기 위해 처음부터 control-plane 1대와 worker 2대를 만듭니다.

- `control-plane`: API Server와 controller처럼 클러스터를 관리하는 구성요소가 실행됩니다.
- `worker`: 우리가 만드는 애플리케이션 Pod가 주로 실행됩니다.

지금은 두 역할 이름만 구분하면 충분합니다. “왜 특정 worker에 배치됐는가”와 “어떻게 두 worker에 고르게 나누는가”는 10강에서 배웁니다.

다음 내용을 `01-kind-course.yaml`이라는 이름으로 저장합니다.

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

파일이 있는 디렉터리에서 클러스터를 만듭니다.

```bash
kind create cluster \
  --name k8s-masterclass \
  --image kindest/node:v1.35.5@sha256:ce977ae6d65918d0b58a5f8b5e940429c2ce42fa3a5619ec2bbc60b949c0ac95 \
  --config 01-kind-course.yaml \
  --wait 5m
```

kind가 만드는 kubeconfig context 이름은 `kind-`와 클러스터 이름을 합친 `kind-k8s-masterclass`입니다. 이후 명령은 현재 context 설정에 기대지 않고 이 이름을 항상 적습니다.

```bash
kubectl --context kind-k8s-masterclass cluster-info
kubectl --context kind-k8s-masterclass get nodes -o wide
kubectl --context kind-k8s-masterclass get pods -n kube-system
```

예상 결과는 세 Node가 모두 `Ready`인 것입니다. 이름 뒤의 숫자나 표시 폭은 환경에 따라 조금 다를 수 있습니다.

```text
NAME                            STATUS   ROLES           AGE   VERSION
k8s-masterclass-control-plane   Ready    control-plane   ...   v1.35.5
k8s-masterclass-worker          Ready    <none>          ...   v1.35.5
k8s-masterclass-worker2         Ready    <none>          ...   v1.35.5
```

Node가 `Ready`이면 API Server와 각 Node가 서로 통신하며 workload를 받을 준비가 된 것입니다. worker의 `ROLES`가 `<none>`으로 보이는 것은 오류가 아닙니다. kind가 worker 역할 label을 별도로 표시하지 않았을 뿐입니다. `kube-system`에는 DNS, API Server, scheduler처럼 클러스터를 운영하는 Pod가 보입니다.

### 잘 안 된다면

- Node가 없으면 `kind get clusters`에 이름이 있는지 확인합니다.
- Node가 `NotReady`이면 `kubectl --context kind-k8s-masterclass describe nodes`의 Conditions와 마지막 Events를 읽습니다.
- Docker 연결 오류라면 Kubernetes보다 Docker 실행 상태를 먼저 해결합니다.

## 실습 2 — 원하는 상태를 파일로 선언하기

먼저 강의 리소스를 모아 둘 Namespace를 만듭니다. Namespace는 같은 클러스터 안에서 리소스를 이름별로 정리하는 공간입니다.

```bash
kubectl --context kind-k8s-masterclass create namespace k8s-labs
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

예상 결과는 `k8s-labs   Active`입니다. 이미 존재한다는 오류가 나오면 삭제할 필요 없이 다음 단계로 진행합니다.

다음 내용을 `01-reconcile-demo.yaml`로 저장합니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reconcile-demo
  namespace: k8s-labs
  labels:
    app: reconcile-demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: reconcile-demo
  template:
    metadata:
      labels:
        app: reconcile-demo
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - name: http
              containerPort: 80
```

처음에는 다음 다섯 줄만 읽으면 됩니다.

| YAML 위치 | 의미 |
|---|---|
| `kind: Deployment` | Pod를 직접 하나 만드는 대신 복제 수를 관리하는 객체 |
| `metadata.name` | 객체 이름 |
| `metadata.namespace` | 객체가 놓일 공간 |
| `spec.replicas: 2` | 원하는 Pod 수 |
| `template` | 새 Pod를 만들 때 사용할 설계도 |

적용하기 전에 결과를 예상해보세요. `replicas: 2`이므로 최종적으로 nginx Pod 두 개가 준비되어야 합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment,replicaset,pod -n k8s-labs -l app=reconcile-demo
```

예상 결과의 핵심은 다음과 같습니다.

```text
deployment.apps/reconcile-demo   2/2 ...
replicaset.apps/reconcile-demo-...   2 ...
pod/reconcile-demo-...           1/1 Running ...
pod/reconcile-demo-...           1/1 Running ...
```

Deployment가 직접 컨테이너를 실행한 것이 아닙니다. Deployment가 ReplicaSet을 만들고, ReplicaSet이 Pod 두 개를 유지합니다. 이 소유 관계는 4강에서 자세히 다룹니다.

## 실습 3 — `spec`과 `status`를 따로 보기

다음 명령은 긴 YAML에서 원하는 수와 실제 준비된 수만 뽑아냅니다.

```bash
kubectl --context kind-k8s-masterclass get deployment reconcile-demo \
  -n k8s-labs \
  -o jsonpath='{.spec.replicas}{" desired / "}{.status.availableReplicas}{" available\n"}'
```

정상이라면 다음처럼 보입니다.

```text
2 desired / 2 available
```

- 앞의 `2`는 우리가 파일에 적은 `spec.replicas`입니다.
- 뒤의 `2`는 controller가 관찰해 `status.availableReplicas`에 기록한 값입니다.
- 적용 직후에는 잠시 `2 desired / 1 available`처럼 차이가 보일 수 있습니다. 조정 루프가 아직 일하는 중이라는 뜻입니다.

## 하나만 바꿔 관찰하기 — 복제 수 2 → 3

학습을 위해 클러스터의 복제 수만 3으로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass scale deployment/reconcile-demo \
  -n k8s-labs \
  --replicas=3
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=reconcile-demo
```

Pod가 세 개가 되면 controller가 새 `spec.replicas`를 보고 부족한 하나를 만들었다는 뜻입니다. 하지만 원본 파일에는 여전히 `replicas: 2`라고 적혀 있습니다. 파일을 다시 적용해 선언과 클러스터를 같은 상태로 복구합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment reconcile-demo -n k8s-labs
```

정상이라면 `READY 2/2`가 됩니다. 이 과정이 “Git이나 파일에 저장된 선언을 기준으로 운영한다”는 습관의 시작입니다.

## 장애 주입과 복구 — Pod 하나 삭제하기

이번에는 원하는 수를 바꾸지 않고 현재 Pod 하나만 삭제합니다. 삭제 전 이름과 UID를 기록합니다.

```bash
POD_NAME=$(kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=reconcile-demo -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass get pod "$POD_NAME" -n k8s-labs -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
kubectl --context kind-k8s-masterclass delete pod "$POD_NAME" -n k8s-labs --wait=false
```

바로 두 번 조회해보세요.

```bash
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=reconcile-demo
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=reconcile-demo -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
```

예상 관찰:

1. 잠시 `Terminating`인 기존 Pod와 `ContainerCreating`인 새 Pod가 함께 보일 수 있습니다.
2. 최종적으로 Ready Pod는 다시 두 개가 됩니다.
3. 새 Pod는 삭제한 Pod와 이름 또는 UID가 다릅니다.

삭제된 Pod가 되살아난 것이 아닙니다. ReplicaSet이 “원하는 수 2, 현재 수 1”이라는 차이를 보고 **새 Pod를 생성**했습니다. 이 실습의 복구 완료 기준은 다음 명령이 `2 desired / 2 available`을 출력하는 것입니다.

```bash
kubectl --context kind-k8s-masterclass get deployment reconcile-demo \
  -n k8s-labs \
  -o jsonpath='{.spec.replicas}{" desired / "}{.status.availableReplicas}{" available\n"}'
```

## 스스로 해보기

`01-reconcile-demo.yaml`의 `replicas`를 4로 바꾸고 적용하세요. 다음 세 질문에 답한 뒤 다시 2로 복구합니다.

1. `spec.replicas`는 언제 4가 되었나요?
2. `status.availableReplicas`도 즉시 4였나요?
3. Pod 네 개의 UID는 서로 같은가요?

<details class="course-hint">
<summary>힌트와 정답</summary>

파일을 적용하면 API Server에 저장된 `spec.replicas`가 먼저 4가 됩니다. Pod 생성과 이미지 준비에는 시간이 걸리므로 `status.availableReplicas`는 2, 3, 4처럼 뒤따라갈 수 있습니다. 각 Pod는 별개의 객체이므로 UID도 모두 다릅니다.

복구할 때는 파일의 `replicas`를 다시 2로 저장한 뒤 다음을 실행합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
```

</details>

## 3문장 정리

1. 쿠버네티스는 실행한 명령의 횟수가 아니라 API Server에 저장된 원하는 상태를 기준으로 일합니다.
2. controller는 `spec`과 실제 상태의 차이를 반복해서 줄이고, 관찰 결과는 `status`에 나타납니다.
3. Pod 삭제 뒤 생긴 Pod는 기존 Pod의 부활이 아니라 원하는 복제 수를 맞추기 위해 생성된 새 객체입니다.

## 다음 강의로 가져가는 상태

다음 상태를 남겨둡니다.

- kind 클러스터: `k8s-masterclass`
- Node: control-plane 1대, worker 2대, 모두 `Ready`
- 사용할 context: `kind-k8s-masterclass`
- Namespace: `k8s-labs`
- Deployment: `reconcile-demo`, Ready replica 2개
- 로컬 파일: `01-kind-course.yaml`, `01-reconcile-demo.yaml`

확인 명령:

```bash
kubectl --context kind-k8s-masterclass get deployment reconcile-demo -n k8s-labs
```

`READY 2/2`이면 2강으로 이동합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/00-start-here/">← 이전: 시작하기 전에</a><a href="/kubernetes/02-kubectl/">다음: kubectl로 클러스터 읽기 →</a></nav>

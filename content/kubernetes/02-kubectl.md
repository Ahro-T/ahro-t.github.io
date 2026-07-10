---
title: "02. kubectl로 클러스터를 읽는 법"
summary: "명령을 외우기보다 질문에 맞는 증거를 고르고 context와 Namespace 실수를 막는 순서를 익힙니다."
description: "get, describe, logs, events, explain, diff를 실제 출력과 함께 연습하고 안전한 변경·복구 루프를 만듭니다."
weight: 20
categories: ["Kubernetes"]
tags: ["kubectl", "Debugging", "YAML"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 02 · Beginner · Tooling</p>

## 이번 시간에 해결할 문제

운영자가 “웹 서버가 안 보여요”라는 말을 들었습니다. 곧바로 새 서버를 만들면 안 됩니다. 서버가 정말 없는지, 다른 Namespace에 있는지, 아직 시작 중인지부터 구분해야 합니다.

`kubectl`은 단순히 리소스를 만드는 명령이 아닙니다. API Server에 질문을 보내 **현재 상태와 원인을 수집하는 도구**입니다. 이번 강의에서는 질문에 맞는 명령을 고르고, 변경 전후를 확인하고, 잘못된 대상을 수정하는 습관을 만듭니다.

## 이 강의를 마치면

- context와 Namespace가 가리키는 범위를 설명할 수 있습니다.
- `get`, `describe`, `logs`, `events`, `explain`이 답하는 질문을 구분할 수 있습니다.
- YAML 초안을 만들고 `diff → apply → verify` 순서로 변경할 수 있습니다.
- 다른 Namespace 조회와 immutable field 오류를 원인에 맞게 복구할 수 있습니다.

## 시작 전 확인

1강의 클러스터와 Deployment를 그대로 사용합니다. 현재 context 설정에 의존하지 않고 모든 요청에 `--context`와 Namespace를 직접 적습니다.

```bash
kind get clusters
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get namespace k8s-labs
kubectl --context kind-k8s-masterclass get deployment reconcile-demo -n k8s-labs
```

예상 결과:

- kind 목록에 `k8s-masterclass`가 있습니다.
- Node는 `Ready`입니다.
- Namespace는 `Active`입니다.
- `reconcile-demo`는 `READY 2/2`입니다.

Namespace만 없다면 다음 명령으로 만듭니다.

```bash
kubectl --context kind-k8s-masterclass create namespace k8s-labs
```

`reconcile-demo`가 없다면 1강의 `01-reconcile-demo.yaml`을 다시 적용합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
```

이 강의를 다시 실행해도 결과가 같도록 이전 `toolbox` Pod만 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod toolbox -n k8s-labs --ignore-not-found
```

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 예시 |
|---|---|---|
| kubeconfig | 클러스터 주소와 인증 정보가 저장된 설정 | 보통 `~/.kube/config` |
| Context | kubeconfig 안의 클러스터·사용자 조합에 붙인 이름 | `kind-k8s-masterclass` |
| Namespace | 한 클러스터 안에서 리소스를 구분하는 논리적 공간 | `k8s-labs` |
| Resource | API Server에 저장되는 Kubernetes 객체 | Pod, Deployment |
| Event | 리소스에 최근 어떤 일이 일어났는지 남긴 기록 | 배치 실패, 이미지 pull 실패 |

## 먼저 그림으로 이해하기

```text
터미널
  │ kubectl --context kind-k8s-masterclass ... -n k8s-labs
  ▼
kubeconfig에서 연결 정보 선택
  ▼
kind-k8s-masterclass의 API Server
  ▼
k8s-labs Namespace 안의 리소스 조회 또는 변경
```

Context는 **어느 클러스터와 어떤 자격으로 연결할지**를 고릅니다. Namespace는 **그 클러스터 안의 어느 공간을 볼지**를 고릅니다. 이름이 같은 Pod도 Namespace가 다르면 서로 다른 객체입니다.

## 실습 1 — 질문에 맞는 명령 고르기

명령부터 외우지 말고 먼저 질문을 고릅니다.

| 질문 | 첫 명령 | 다음 증거 |
|---|---|---|
| 무엇이 존재하는가? | `get` | 이름, 상태, 개수 |
| 왜 이 상태인가? | `describe` | Conditions와 Events |
| 프로세스가 무슨 말을 했나? | `logs` | 애플리케이션 출력 |
| 최근 클러스터에서 무슨 일이 있었나? | `events` | 시간순 사건 |
| 이 필드는 무엇인가? | `explain` | API 스키마 설명 |

### 1-1. 넓게 보고 하나로 좁히기

```bash
kubectl --context kind-k8s-masterclass get deployments -n k8s-labs
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=reconcile-demo -o wide
kubectl --context kind-k8s-masterclass describe deployment reconcile-demo -n k8s-labs
```

예상 결과와 읽는 법:

- `get deployments`의 `READY 2/2`는 원하는 replica 두 개가 준비됐다는 뜻입니다.
- Pod의 `STATUS Running`은 컨테이너 프로세스가 실행 중이라는 뜻입니다.
- `describe` 아래쪽 Events에는 생성과 배치 과정의 최근 기록이 보입니다. 정상 상태라면 Events가 비어 있을 수도 있습니다.

### 1-2. 로그와 Event를 구분하기

```bash
kubectl --context kind-k8s-masterclass logs deployment/reconcile-demo -n k8s-labs --tail=20
kubectl --context kind-k8s-masterclass events -n k8s-labs --for deployment/reconcile-demo
```

nginx가 아직 요청을 받지 않았다면 로그가 비어 있을 수 있습니다. 이것은 오류가 아닙니다. 로그는 컨테이너 프로세스의 출력이고, Event는 scheduler·kubelet·controller 같은 클러스터 구성요소가 남긴 사건입니다.

### 1-3. 필드 뜻을 API에서 확인하기

```bash
kubectl --context kind-k8s-masterclass explain deployment.spec.replicas --api-version=apps/v1
```

출력에는 `replicas`의 타입과 의미가 나옵니다. 인터넷 검색 결과 대신 현재 클러스터가 이해하는 API 필드를 확인할 때 유용합니다.

## 실습 2 — YAML 초안 만들기

한 시간 동안 대기하는 학습용 Pod의 초안을 만듭니다. 다음 명령은 클러스터에 Pod를 만들지 않고 결과를 `02-toolbox.yaml`에 저장합니다.

```bash
kubectl --context kind-k8s-masterclass run toolbox \
  --image=busybox:1.36 \
  --restart=Never \
  --namespace=k8s-labs \
  --dry-run=client \
  -o yaml \
  --command -- sh -c 'sleep 86400' \
  > 02-toolbox.yaml
```

`--dry-run=client`는 API Server에 저장하지 않는다는 뜻이고, `-o yaml`은 생성됐을 객체를 YAML로 보여달라는 뜻입니다. 파일을 열어 최소한 다음 구조인지 확인하세요.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: toolbox
  namespace: k8s-labs
spec:
  containers:
    - name: toolbox
      image: busybox:1.36
      command:
        - sh
        - -c
        - sleep 86400
  restartPolicy: Never
```

클라이언트 버전에 따라 `creationTimestamp: null` 같은 값이 포함될 수 있습니다. 학습용 Git 파일에서는 서버가 채우는 일회성 필드를 제거해도 됩니다.

아직 클러스터에 Pod가 없는지 확인한 뒤 적용합니다.

```bash
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs
kubectl --context kind-k8s-masterclass apply -f 02-toolbox.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/toolbox -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs -o wide
```

첫 번째 `get`은 `NotFound`가 정상입니다. 적용과 대기 후에는 다음 핵심 값이 보여야 합니다.

```text
NAME      READY   STATUS    RESTARTS
toolbox   1/1     Running   0
```

컨테이너 안의 운영체제 정보를 읽어 실제 실행 여부를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass exec pod/toolbox -n k8s-labs -- cat /etc/os-release
```

BusyBox 관련 정보가 출력되면 API 객체 생성뿐 아니라 컨테이너 실행까지 성공한 것입니다.

## 하나만 바꿔 관찰하기 — label 추가와 제거

label은 리소스를 분류하는 key-value 메타데이터입니다. Pod의 실행 명령은 그대로 두고 label 하나만 추가합니다.

```bash
kubectl --context kind-k8s-masterclass label pod toolbox -n k8s-labs stage=practice
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs --show-labels
```

출력의 `LABELS` 열에 `stage=practice`가 추가됩니다. Pod가 재생성되지 않았는지 UID를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,LABELS:.metadata.labels
```

label만 바꿨으므로 컨테이너는 그대로입니다. 원본 YAML과 상태를 맞추기 위해 label을 제거합니다.

```bash
kubectl --context kind-k8s-masterclass label pod toolbox -n k8s-labs stage-
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs --show-labels
```

## 장애 주입과 복구 — 바꿀 수 없는 Pod 필드

실행 중인 Pod의 `command`를 `sleep 86400`에서 `sleep 172800`으로 바꾸려고 해봅시다. 다음 내용을 `02-toolbox-immutable.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: toolbox
  namespace: k8s-labs
spec:
  containers:
    - name: toolbox
      image: busybox:1.36
      command:
        - sh
        - -c
        - sleep 172800
  restartPolicy: Never
```

변경 전에 diff를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass diff -f 02-toolbox-immutable.yaml -n k8s-labs
```

`- sleep 86400`, `+ sleep 172800`과 비슷한 차이가 보입니다. `kubectl diff`는 차이가 있으면 종료 코드 1을 반환할 수 있습니다. diff가 보였다는 사실 자체는 실행 오류가 아닙니다.

이제 적용해봅니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 02-toolbox-immutable.yaml -n k8s-labs
```

예상 결과는 성공이 아니라 다음과 비슷한 오류입니다.

```text
The Pod "toolbox" is invalid: spec: Forbidden: pod updates may not change fields other than ...
```

Pod의 실행 명세 대부분은 생성 후 바꿀 수 없습니다. 쿠버네티스가 고장 난 것이 아니라 **직접 만든 Pod를 장기 실행 workload처럼 수정하려 한 객체 선택이 문제**입니다. 운영 서비스는 4강의 Deployment로 관리합니다.

학습 리소스를 안전하게 복구하기 위해 기존 Pod를 삭제하고 원래 파일로 다시 만듭니다.

```bash
kubectl --context kind-k8s-masterclass delete pod toolbox -n k8s-labs --wait=true
kubectl --context kind-k8s-masterclass apply -f 02-toolbox.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/toolbox -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs
```

`Running`, `READY 1/1`이면 복구가 끝났습니다.

### 범위를 잘못 본 경우도 구분하기

같은 Pod를 `default` Namespace에서 조회해봅니다.

```bash
kubectl --context kind-k8s-masterclass get pod toolbox -n default
```

`NotFound`가 나와도 클러스터 전체에서 사라졌다는 뜻은 아닙니다. 정확한 Namespace에서 다시 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get pod toolbox -n k8s-labs
```

“없다”라는 결론을 내리기 전에 context와 Namespace를 함께 기록해야 하는 이유입니다.

## 운영자가 지키는 변경 루프

```text
대상 명시 → 현재 상태 확인 → diff → apply → 준비 상태 확인 → 실제 기능 확인
```

Deployment를 변경할 때는 다음 형태가 기본입니다.

```bash
kubectl --context kind-k8s-masterclass diff -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass apply -f 01-reconcile-demo.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/reconcile-demo -n k8s-labs --timeout=90s
kubectl --context kind-k8s-masterclass events -n k8s-labs --for deployment/reconcile-demo
```

`apply` 성공은 API Server가 선언을 받아들였다는 뜻입니다. 애플리케이션이 요청을 받을 준비까지 끝났다는 뜻은 아닙니다.

## 스스로 해보기

다음 상황에서 첫 명령을 하나씩 고르세요.

1. Pod 이름과 상태를 모른다.
2. Pod가 `Pending`이다.
3. Pod는 `Running`이지만 앱 오류 메시지를 보고 싶다.
4. `spec.containers` 필드 구조를 확인하고 싶다.

<details class="course-hint">
<summary>힌트와 정답</summary>

1. `get`: `kubectl --context kind-k8s-masterclass get pods -n k8s-labs`
2. `describe`: `kubectl --context kind-k8s-masterclass describe pod toolbox -n k8s-labs`
3. `logs`: `kubectl --context kind-k8s-masterclass logs deployment/reconcile-demo -n k8s-labs --tail=20`
4. `explain`: `kubectl --context kind-k8s-masterclass explain pod.spec.containers`

실제 장애에서는 첫 번째 명령에서 확인한 문제 Pod 이름을 `toolbox` 자리에 넣습니다. 여기서는 지금 존재하는 이름을 사용해 모든 예제를 그대로 실행할 수 있게 했습니다.

</details>

## 3문장 정리

1. Context는 연결할 클러스터와 자격을, Namespace는 그 안에서 조회할 공간을 정합니다.
2. `get`은 현상, `describe`와 Events는 과정, `logs`는 컨테이너 프로세스의 말을 보여줍니다.
3. 변경은 `diff → apply → 준비 상태 → 실제 기능` 순서로 확인해야 합니다.

## 다음 강의로 가져가는 상태

Pod 자체를 배우기 전에 이번 강의의 임시 `toolbox`는 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod toolbox -n k8s-labs --ignore-not-found
kubectl --context kind-k8s-masterclass get deployment reconcile-demo -n k8s-labs
```

다음 상태를 남겨둡니다.

- context: `kind-k8s-masterclass`
- Namespace: `k8s-labs`
- Deployment: `reconcile-demo`, Ready replica 2개
- `toolbox` Pod: 삭제됨

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/01-control-loop/">← 이전: 조정 루프</a><a href="/kubernetes/03-pod/">다음: Pod 제대로 이해하기 →</a></nav>

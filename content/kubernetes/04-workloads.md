---
title: "04. Deployment와 Workload — 복제·배포·롤백"
summary: "Deployment가 ReplicaSet과 Pod를 관리하는 관계를 따라가며 복제, 교체, rolling update, rollback을 단계별로 익힙니다."
description: "상태 없는 애플리케이션을 선언으로 관리하고 한 Pod 장애와 실패한 이미지 배포를 안전하게 복구합니다."
weight: 40
categories: ["Kubernetes"]
tags: ["Deployment", "ReplicaSet", "Rollout"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 04 · Beginner · Deployments</p>

## 이번 시간에 해결할 문제

3강에서 직접 만든 `pod-lab`은 삭제하면 그대로 사라졌습니다. 같은 Pod를 세 개 운영하거나 새 버전으로 하나씩 교체하려면 누군가가 계속 개수와 버전을 확인해야 합니다.

상태 없는 장기 실행 서비스는 Pod를 직접 만들지 않고 Deployment에 선언합니다. Deployment는 “Pod 세 개가 항상 필요하다”, “새 이미지로 한 번에 하나씩 바꾼다” 같은 요구사항을 관리합니다.

이번 강의에서는 다음 상황을 해결합니다.

1. 웹 Pod 세 개를 계속 유지합니다.
2. Pod 하나가 사라져도 새 Pod로 보충합니다.
3. 새 이미지로 점진적으로 교체합니다.
4. 잘못된 이미지 때문에 배포가 멈추면 직전 정상 버전으로 돌아갑니다.

## 이 강의를 마치면

- Deployment → ReplicaSet → Pod의 소유 관계를 실제 이름으로 추적할 수 있습니다.
- replica 수 변경과 self-healing을 구분할 수 있습니다.
- `maxSurge`와 `maxUnavailable`을 실제 Pod 수로 설명할 수 있습니다.
- 실패한 rollout에서 Events를 확인하고 정상 revision으로 rollback할 수 있습니다.

## 시작 전 확인

클러스터와 Namespace가 준비됐는지 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

세 Node가 모두 `Ready`, Namespace가 `Active`여야 합니다. 이전에 같은 이름으로 진행한 4강 실습이 있다면 `web` Deployment만 초기화합니다. `reconcile-demo`와 `pod-lab`은 건드리지 않습니다.

```bash
kubectl --context kind-k8s-masterclass delete deployment web -n k8s-labs --ignore-not-found
```

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 오늘의 예 |
|---|---|---|
| Workload | 클러스터에서 실행할 애플리케이션 또는 작업 | nginx 웹 서비스 |
| Deployment | replica 수와 업데이트 방식을 선언하는 상위 객체 | `web` |
| ReplicaSet | 같은 Pod가 원하는 개수만큼 있도록 관리하는 객체 | `web-문자열` |
| Rollout | 새 Pod template을 점진적으로 배포하는 과정 | nginx 1.27 → 1.28 |
| Revision | Deployment의 Pod template 변경 이력 번호 | rollback 대상 |

## 먼저 그림으로 이해하기

```text
Deployment/web
"이 Pod 설계도로 3개를 유지해"
        │ 소유
        ▼
ReplicaSet/web-aaaaa
"현재 설계도에 맞는 Pod가 3개 필요해"
        │ 소유
        ├──────────┬──────────┐
        ▼          ▼          ▼
   Pod/web-1   Pod/web-2   Pod/web-3
```

Pod 하나가 없어지면 ReplicaSet이 새 Pod를 만듭니다. Pod template이 바뀌면 Deployment는 새 ReplicaSet을 만들고, 새쪽은 늘리고 이전 쪽은 줄입니다.

## 어떤 Workload를 고를까

오늘은 Deployment만 직접 사용합니다. 다른 종류는 목적만 구분해두세요.

| 실행할 것 | 보통 선택하는 객체 |
|---|---|
| 상태 없는 장기 실행 API·웹 서버 | Deployment |
| 모든 Node에 하나씩 필요한 agent | DaemonSet |
| 안정적인 이름·저장소가 필요한 상태 저장 앱 | StatefulSet |
| 성공하면 끝나는 일회성 작업 | Job |
| 일정마다 반복하는 작업 | CronJob |

“컨테이너를 실행한다”는 공통점만 보고 아무 객체나 선택하면 안 됩니다. 종료돼야 정상인 작업과 계속 살아 있어야 정상인 서비스는 관리 방식이 다릅니다.

## 실습 1 — Deployment로 Pod 세 개 유지하기

다음 내용을 `04-web-deployment.yaml`로 저장합니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: k8s-labs
  labels:
    app: web
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
          readinessProbe:
            httpGet:
              path: /
              port: http
            initialDelaySeconds: 2
            periodSeconds: 5
```

### selector와 template label은 한 쌍이다

```text
spec.selector.matchLabels.app: web
                 │ 같은 label을 가진 Pod를 관리
                 ▼
spec.template.metadata.labels.app: web
```

두 값이 다르면 Deployment가 자기가 만들 Pod를 올바르게 관리할 수 없습니다. `apps/v1` Deployment에서는 selector를 만든 뒤 바꿀 수도 없으므로 처음부터 맞춰야 합니다.

### RollingUpdate 숫자를 먼저 계산한다

원하는 replica가 3일 때:

- `maxSurge: 1`: 업데이트 중 기존 수보다 최대 하나 많은 **총 4개**까지 만들 수 있습니다.
- `maxUnavailable: 0`: 준비된 Pod가 **3개 아래로 내려가면 안 됩니다**.

즉, 새 Pod 하나가 Ready가 된 뒤 이전 Pod 하나를 줄이는 방식입니다. readiness probe가 없다면 “컨테이너가 시작됨”과 “요청을 받을 준비가 됨”을 구분할 수 없으므로 이 계산을 믿기 어렵습니다.

적용하고 준비 완료까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 04-web-deployment.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment,replicaset,pod -n k8s-labs -l app=web
```

예상 결과의 핵심:

```text
deployment.apps/web   3/3 ...
replicaset.apps/web-...   3 ...
pod/web-...           1/1 Running ...
pod/web-...           1/1 Running ...
pod/web-...           1/1 Running ...
```

`apply`는 API Server가 객체를 저장했다는 뜻이고, `rollout status` 성공은 새 Pod들이 준비됐다는 뜻입니다. 둘은 같은 성공이 아닙니다.

## 실습 2 — 실제 소유 관계 따라가기

먼저 Pod 하나의 실제 이름을 변수에 저장합니다.

```bash
POD_NAME=$(kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass get pod "$POD_NAME" -n k8s-labs \
  -o 'custom-columns=NAME:.metadata.name,OWNER_KIND:.metadata.ownerReferences[0].kind,OWNER_NAME:.metadata.ownerReferences[0].name'
```

Pod의 owner kind는 `ReplicaSet`입니다. 그 ReplicaSet 이름을 저장하고 다시 상위 owner를 봅니다.

```bash
RS_NAME=$(kubectl --context kind-k8s-masterclass get pod "$POD_NAME" -n k8s-labs -o jsonpath='{.metadata.ownerReferences[0].name}')
kubectl --context kind-k8s-masterclass get replicaset "$RS_NAME" -n k8s-labs \
  -o 'custom-columns=NAME:.metadata.name,OWNER_KIND:.metadata.ownerReferences[0].kind,OWNER_NAME:.metadata.ownerReferences[0].name'
```

예상 관계:

```text
Pod web-...  →  ReplicaSet web-...  →  Deployment web
```

따라서 운영 중 replica 수나 이미지를 바꿀 때 Pod나 ReplicaSet을 직접 수정하지 않고 가장 위의 Deployment 선언을 바꿉니다.

## 하나만 바꿔 관찰하기 — replica 3 → 4

학습을 위해 클러스터의 replica 수만 4로 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass scale deployment/web -n k8s-labs --replicas=4
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web
```

Pod가 하나 더 생기고 Deployment가 `READY 4/4`가 됩니다. 기존 Pod를 복제한 것이 아니라 같은 template으로 새 UID의 Pod를 만든 것입니다.

그러나 `04-web-deployment.yaml`에는 여전히 `replicas: 3`이므로 파일과 클러스터가 다릅니다. 파일을 기준으로 3개에 복구합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 04-web-deployment.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs
```

`READY 3/3`이면 선언과 현재 상태가 다시 같습니다.

## 실습 3 — self-healing은 수리가 아니라 교체다

Pod 하나의 이름과 UID를 기록하고 그 Pod만 삭제합니다.

```bash
POD_NAME=$(kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass get pod "$POD_NAME" -n k8s-labs -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
kubectl --context kind-k8s-masterclass delete pod "$POD_NAME" -n k8s-labs --wait=false
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web
```

잠시 `Terminating`과 `ContainerCreating`이 함께 보일 수 있습니다. 다시 준비 완료를 기다립니다.

```bash
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web -o custom-columns=NAME:.metadata.name,UID:.metadata.uid
```

최종 Pod 수는 다시 3개지만 삭제한 UID는 돌아오지 않습니다. self-healing은 손상된 Pod 내부를 수리하는 기능이 아니라 **원하는 개수를 맞추기 위해 대체 객체를 생성하는 동작**입니다.

## 실습 4 — 새 이미지로 Rolling Update

원본 파일을 복사해 새 버전의 선언을 만듭니다.

```bash
cp 04-web-deployment.yaml 04-web-deployment-v2.yaml
```

`04-web-deployment-v2.yaml`에서 image 한 줄만 다음처럼 바꿔 저장합니다.

```diff
-          image: nginx:1.27-alpine
+          image: nginx:1.28-alpine
```

적용 전 diff에서 image 변경만 있는지 확인합니다.

```bash
kubectl --context kind-k8s-masterclass diff -f 04-web-deployment-v2.yaml -n k8s-labs
```

의도한 한 줄만 달라졌다면 적용합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 04-web-deployment-v2.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get replicasets -n k8s-labs -l app=web
kubectl --context kind-k8s-masterclass rollout history deployment/web -n k8s-labs
```

예상 관찰:

- 이전 ReplicaSet은 `DESIRED 0`으로 남고 새 ReplicaSet이 `DESIRED 3`이 됩니다.
- rollout history에 새 revision이 생깁니다.
- Deployment의 현재 이미지는 `nginx:1.28-alpine`입니다.

```bash
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

## 장애 주입과 복구 — 존재하지 않는 이미지 배포

이번에는 의도적으로 존재하지 않는 tag를 배포합니다. 학습용 명령으로 image 한 필드만 변경합니다.

```bash
kubectl --context kind-k8s-masterclass set image deployment/web -n k8s-labs web=nginx:not-a-real-version
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=45s
```

예상 결과는 timeout입니다. `apply`나 `set image` 요청은 API Server에 저장됐지만 새 Pod가 Ready가 되지 못했습니다. 증거를 순서대로 모읍니다.

```bash
kubectl --context kind-k8s-masterclass get deployment,replicaset,pod -n k8s-labs -l app=web
kubectl --context kind-k8s-masterclass describe deployment web -n k8s-labs
kubectl --context kind-k8s-masterclass describe pods -n k8s-labs -l app=web
kubectl --context kind-k8s-masterclass events -n k8s-labs --types=Warning
```

새 ReplicaSet의 Pod에는 `ImagePullBackOff`가 보이고, Events에는 잘못된 image tag가 나타납니다. `maxUnavailable: 0`이므로 이전 버전의 Ready Pod 세 개가 남아 있는지도 확인하세요. 이것이 준비되지 않은 새 Pod를 곧바로 서비스에 투입하지 않는 이유입니다.

원인을 확인했으면 직전 정상 revision으로 rollback합니다.

```bash
kubectl --context kind-k8s-masterclass rollout undo deployment/web -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

복구 완료 기준:

- `READY 3/3`
- image가 `nginx:1.28-alpine`
- `ImagePullBackOff`인 새 Pod가 최종적으로 사라짐

운영에서는 rollback 전에 실패한 revision, 증상 시작 시각, Events의 원인을 기록합니다. 복구가 끝난 뒤에도 잘못된 tag가 들어간 원본 배포 소스를 수정해야 같은 장애가 반복되지 않습니다. 이 실습의 정상 소스는 `04-web-deployment-v2.yaml`입니다.

## 스스로 해보기

replica가 4개인 Deployment에 다음 전략을 사용한다고 가정하세요.

```yaml
maxSurge: 1
maxUnavailable: 1
```

업데이트 중 허용되는 전체 Pod의 최대 개수와 Ready Pod의 최소 개수는 각각 몇 개일까요?

<details class="course-hint">
<summary>힌트와 정답</summary>

- 전체 Pod 최대 개수: `replicas 4 + maxSurge 1 = 5개`
- Ready Pod 최소 개수: `replicas 4 - maxUnavailable 1 = 3개`

비율을 사용하면 Kubernetes가 replica 수를 기준으로 반올림 규칙을 적용합니다. 처음에는 숫자로 직접 계산한 뒤 8강에서 readiness의 의미와 함께 다시 연결하세요.

</details>

## 3문장 정리

1. Deployment는 ReplicaSet을 만들고, ReplicaSet은 같은 template의 Pod를 원하는 개수만큼 유지합니다.
2. self-healing은 기존 Pod를 수리하는 것이 아니라 새 UID의 대체 Pod를 만드는 동작입니다.
3. `apply` 성공과 rollout 성공은 다르며, 실패한 rollout은 증거를 확인한 뒤 직전 정상 revision으로 복구합니다.

## 다음 강의로 가져가는 상태

다음 강의의 Service가 이 Deployment를 찾으므로 `web`을 삭제하지 않습니다.

```bash
kubectl --context kind-k8s-masterclass rollout status deployment/web -n k8s-labs --timeout=2m
kubectl --context kind-k8s-masterclass get pods -n k8s-labs -l app=web
kubectl --context kind-k8s-masterclass get deployment web -n k8s-labs -o jsonpath='{.spec.replicas}{" replicas, image="}{.spec.template.spec.containers[0].image}{"\n"}'
```

다음 상태를 남겨둡니다.

- `web` Deployment: Ready replica 3개
- image: `nginx:1.28-alpine`
- Pod label: `app=web`
- named container port: `http`, 80
- 정상 선언 파일: `04-web-deployment-v2.yaml`

이 상태가 5강 Service 실습의 시작점입니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/03-pod/">← 이전: Pod</a><a href="/kubernetes/05-service-dns/">다음: Service와 DNS →</a></nav>

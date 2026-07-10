---
title: "14. 운영과 장애 대응 — tiny-shop 캡스톤"
summary: "starter를 검증한 뒤 Secret·PVC, 가용성, RBAC, 패키징과 실제 장애 복구를 5개 마일스톤으로 완성합니다."
description: "초보자가 정상 상태를 먼저 기록하고 한 번에 하나만 바꾸며 증거로 복구하는 tiny-shop 최종 프로젝트입니다."
weight: 140
categories: ["Kubernetes"]
tags: ["Troubleshooting", "Observability", "Capstone", "Runbook"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 14 · 6H · Operations & Capstone</p>

## 이번에 해결할 문제

지금까지는 기능을 하나씩 분리해서 배웠습니다. 마지막 강의에서는 `web → api` 요청 경로를 가진 tiny-shop을 배포하고, 설정·Secret·데이터·가용성·RBAC을 추가한 뒤 실제 장애 하나를 증거로 복구합니다.

운영에서 가장 위험한 습관은 증상을 보자마자 여러 값을 동시에 바꾸는 것입니다. 이 강의에서는 매 마일스톤마다 다음 순서를 고정합니다.

```text
시작 상태 확인 → 파일 하나 작성 → 적용 → wait/rollout
→ 예상 결과 비교 → 증거 저장 → 다음 변경
```

## 시작 전 확인 — 깨끗한 전용 Namespace가 필요합니다

{{< alert "triangle-exclamation" >}}
아래 초기화는 `k8s-labs` Namespace의 PVC와 데이터를 포함한 모든 리소스를 삭제합니다. 공유 클러스터나 보존할 데이터가 있는 환경에서는 실행하지 말고 이 과정 전용 kind 클러스터를 사용하세요.
{{< /alert >}}

Bash, macOS Zsh 또는 WSL2 Bash에서 실행합니다.

```bash
kubectl --context kind-k8s-masterclass cluster-info
kubectl --context kind-k8s-masterclass wait --for=condition=Ready node --all --timeout=120s

kubectl --context kind-k8s-masterclass delete namespace k8s-labs \
  --ignore-not-found --wait=true --timeout=120s
kubectl --context kind-k8s-masterclass create namespace k8s-labs

mkdir -p "$HOME/k8s-course/lesson14"/{base,resources,patches}
cd "$HOME/k8s-course/lesson14"
pwd

curl -fsSLo base/tiny-shop-starter.yaml \
  https://ahro-t.github.io/kubernetes-labs/tiny-shop-starter.yaml

kubectl --context kind-k8s-masterclass apply --dry-run=server -f base/tiny-shop-starter.yaml
kubeconform -strict -summary \
  -kubernetes-version 1.35.0 \
  base/tiny-shop-starter.yaml
```

예상 결과는 Kubernetes 객체 7개가 server dry-run을 통과하고, kubeconform의 `Invalid: 0, Errors: 0`입니다. 다운로드나 검증이 실패하면 적용하지 마세요.

## starter가 제공하는 것과 제공하지 않는 것

요구사항을 중복 구현하지 않도록 먼저 경계를 확정합니다.

| 항목 | starter 상태 | 캡스톤에서 할 일 |
|---|---|---|
| web·api Deployment | 각각 replica 2 | 정상 rollout과 요청 경로 검증 |
| startup·readiness·liveness probe | web·api 모두 포함 | 새로 추가하지 않고 실제 Ready 상태 검증 |
| requests·memory limits | web·api 모두 포함 | 유지하고 HPA 계산의 기준으로 사용 |
| image | `nginx:1.27-alpine` 고정 tag | `latest`로 바꾸지 않음 |
| ConfigMap | API content와 web 설정 포함 | Secret과 용도를 구분 |
| Secret·PVC | 없음 | 마일스톤 2에서 추가 |
| topology spread·PDB·HPA | 없음 | 마일스톤 3에서 추가 |
| ServiceAccount·RBAC | 없음 | 마일스톤 4에서 의미 있는 reader로 추가 |
| Helm/Kustomize package·Runbook | 없음 | 마일스톤 5에서 완성 |

starter의 nginx는 port 80에서 동작하는 기본 이미지입니다. 따라서 “이미 restricted non-root로 구성되어 있다”고 평가하지 않습니다. 이번 필수 범위는 web·api의 불필요한 API 토큰을 끄고, API가 필요한 별도 점검 Pod에만 최소 RBAC을 주는 것입니다. rootless nginx로 이미지·port·설정을 함께 옮기는 작업은 마지막의 확장 과제로 분리합니다.

## 용어 다섯 개만 먼저 잡기

- **baseline**: 장애 전 정상임을 증명해 둔 상태와 출력
- **smoke test**: 핵심 요청 경로가 동작하는지 빠르게 확인하는 최소 테스트
- **evidence**: status, Events, logs, metrics처럼 가설을 지지하거나 반박하는 관찰 결과
- **rollback**: 마지막 변경을 되돌려 검증된 상태로 복구하는 조치
- **Runbook**: 다른 사람이 같은 순서로 설치·검증·복구·정리할 수 있는 절차

## 완성할 구조

```text
curl
  ↓ localhost:8080
web Service → web Deployment
                   ↓ /api/
              api Service → api Deployment
                                  ├─ ConfigMap: 공개 설정·정적 content
                                  ├─ Secret: API_TOKEN
                                  └─ PVC: /data/state.json

runbook-reader ServiceAccount → Kubernetes API의 읽기 전용 RBAC
```

## 마일스톤 1 — starter를 배포하고 baseline 기록하기

### 문제

장애 복구를 시작하기 전에 정상 상태가 무엇인지 알아야 합니다. starter를 그대로 배포하고 controller 상태, EndpointSlice, 실제 HTTP 응답을 baseline으로 기록합니다.

### 적용과 wait

```bash
kubectl --context kind-k8s-masterclass apply -f base/tiny-shop-starter.yaml

kubectl --context kind-k8s-masterclass rollout status deployment/api \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass rollout status deployment/web \
  -n k8s-labs --timeout=120s

kubectl --context kind-k8s-masterclass get deployment,pod,service -n k8s-labs -o wide
kubectl --context kind-k8s-masterclass get endpointslice -n k8s-labs \
  -l kubernetes.io/service-name=api
```

예상 상태:

```text
deployment/api   READY 2/2
deployment/web   READY 2/2
service/api      ClusterIP
service/web      ClusterIP
api EndpointSlice에 주소 2개
```

Ready가 되지 않으면 timeout 뒤 다음 증거를 순서대로 봅니다.

```bash
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -o wide
kubectl --context kind-k8s-masterclass get events -n k8s-labs --sort-by=.lastTimestamp
kubectl --context kind-k8s-masterclass describe deployment api -n k8s-labs
kubectl --context kind-k8s-masterclass logs deployment/api -n k8s-labs --all-containers --tail=80
```

### 실제 요청 확인

첫 터미널에서 실행합니다.

```bash
kubectl --context kind-k8s-masterclass port-forward service/web -n k8s-labs 8080:80
```

다른 터미널에서 실행합니다.

```bash
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/api/
```

예상 핵심 응답:

```text
tiny-shop web
{"service":"tiny-shop-api","status":"ok"}
```

확인 뒤 port-forward 터미널에서 `Ctrl-C`를 누릅니다. 이는 Service나 Pod를 삭제하지 않고 로컬 터널만 종료합니다.

### 검증·힌트·정답 상태

<details class="course-hint"><summary>마일스톤 1 힌트</summary><p><code>/</code>는 web ConfigMap의 HTML이고 <code>/api/</code>는 web nginx가 api Service로 proxy한 결과입니다. web은 정상인데 <code>/api/</code>만 실패하면 api Pod, api Service selector, EndpointSlice 순서로 범위를 좁히세요.</p></details>

<details class="course-hint"><summary>마일스톤 1 정답 상태</summary><p>web·api Deployment가 모두 Available 2, 두 Service에 endpoint가 존재하고 두 curl이 성공해야 합니다. 이 세 종류의 증거를 <code>baseline.txt</code> 같은 개인 기록에 남긴 뒤 다음으로 이동합니다.</p></details>

## 마일스톤 2 — Secret과 영속 데이터를 역할에 맞게 추가하기

### 문제

starter의 ConfigMap은 공개 가능한 nginx 설정과 정적 content에 적합합니다. API 토큰은 Secret으로 분리하고, Pod가 교체되어도 남아야 하는 상태 파일은 PVC에 둡니다.

### Secret은 렌더링 파일에 저장하지 않습니다

토큰을 대화형으로 입력해 클러스터에만 만듭니다.

```bash
(
  printf '실습용 API_TOKEN 입력: '
  IFS= read -rs API_TOKEN
  printf '\n'

  if [ -z "$API_TOKEN" ]; then
    printf '토큰은 비울 수 없습니다.\n' >&2
    unset API_TOKEN
    exit 1
  fi

  kubectl --context kind-k8s-masterclass create secret generic api-runtime \
    -n k8s-labs \
    --from-literal=API_TOKEN="$API_TOKEN" \
    --dry-run=client -o yaml \
    | kubectl --context kind-k8s-masterclass apply -f -

  unset API_TOKEN
)
kubectl --context kind-k8s-masterclass get secret api-runtime -n k8s-labs \
  -o jsonpath='{.data.API_TOKEN}{" key exists\n"}' \
  | sed 's/.* key exists/API_TOKEN key exists/'
```

토큰의 base64 값을 출력·복사하지 않습니다. 최종 Kustomize source에도 Secret 값은 넣지 않고 Runbook에 생성 절차만 기록합니다.

### PVC 파일 만들기

`resources/milestone2-data.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: api-data
  namespace: k8s-labs
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 128Mi
```

```bash
kubectl --context kind-k8s-masterclass apply -f resources/milestone2-data.yaml
kubectl --context kind-k8s-masterclass get pvc api-data -n k8s-labs
```

kind의 기본 StorageClass는 consumer Pod가 생길 때까지 volume binding을 미룰 수 있습니다. 따라서 이 시점의 `Pending`과 `WaitForFirstConsumer` Event는 예상 가능한 상태이며, 아직 실패로 단정하지 않습니다.

### API Deployment patch 만들기

`patches/api-runtime-patch.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: k8s-labs
spec:
  template:
    spec:
      initContainers:
        - name: seed-data
          image: busybox:1.36.1
          command: ["sh", "-c"]
          args:
            - >-
              test -f /data/state.json ||
              printf '{"cart":"persistent","items":1}\n' > /data/state.json
          volumeMounts:
            - name: data
              mountPath: /data
      containers:
        - name: api
          env:
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: api-runtime
                  key: API_TOKEN
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: api-data
```

patch를 적용하고 새 Pod가 Ready가 될 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass patch deployment api -n k8s-labs \
  --type=strategic \
  --patch-file patches/api-runtime-patch.yaml

kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=jsonpath='{.status.phase}'=Bound \
  pvc/api-data --timeout=120s
kubectl --context kind-k8s-masterclass rollout status deployment/api \
  -n k8s-labs --timeout=180s

kubectl --context kind-k8s-masterclass exec deployment/api -n k8s-labs -- \
  sh -c 'test -n "$API_TOKEN" && printf "API_TOKEN is set\n"'
```

예상 출력은 `API_TOKEN is set`입니다. 값 자체를 출력하지 않습니다.

### Pod 교체 뒤에도 데이터가 남는지 확인

init container가 매번 같은 초기값을 다시 만들 수도 있으므로, seed 값 `items: 1`을 보는 것만으로는 영속성을 증명할 수 없습니다. 기존 API Pod들의 UID를 기록하고, 선택한 Pod에서 파일을 고유값 `items: 42`로 바꾼 뒤 **기존에 없던 UID의 새 Ready Pod**가 같은 값을 읽는지 확인합니다.

```bash
(
  BEFORE_UIDS=$(kubectl --context kind-k8s-masterclass get pod \
    -n k8s-labs -l app=api \
    -o jsonpath='{range .items[*]}{.metadata.uid}{" "}{end}')
  OLD_API_POD=$(kubectl --context kind-k8s-masterclass get pod \
    -n k8s-labs -l app=api \
    -o jsonpath='{.items[0].metadata.name}')
  OLD_API_UID=$(kubectl --context kind-k8s-masterclass get pod \
    "$OLD_API_POD" -n k8s-labs \
    -o jsonpath='{.metadata.uid}')

  printf '교체 전 Pod=%s UID=%s\n' "$OLD_API_POD" "$OLD_API_UID"
  kubectl --context kind-k8s-masterclass exec \
    "$OLD_API_POD" -n k8s-labs -c api -- \
    sh -c 'printf "%s\n" "$1" > /usr/share/nginx/html/data/state.json' \
    sh '{"cart":"persistent","items":42}'
  kubectl --context kind-k8s-masterclass exec \
    "$OLD_API_POD" -n k8s-labs -c api -- \
    cat /usr/share/nginx/html/data/state.json

  kubectl --context kind-k8s-masterclass delete pod \
    "$OLD_API_POD" -n k8s-labs --wait=true

  if kubectl --context kind-k8s-masterclass get pod \
    "$OLD_API_POD" -n k8s-labs >/dev/null 2>&1; then
    printf '기존 Pod 이름이 아직 남아 있습니다.\n' >&2
    exit 1
  fi

  NEW_API_POD=''
  attempt=1
  while [ "$attempt" -le 36 ]; do
    POD_ROWS=$(kubectl --context kind-k8s-masterclass get pod \
      -n k8s-labs -l app=api \
      -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{" "}{range .status.conditions[?(@.type=="Ready")]}{.status}{end}{"\n"}{end}')
    NEW_API_POD=$(printf '%s\n' "$POD_ROWS" \
      | awk -v before="$BEFORE_UIDS" \
        '$3 == "True" && index(" " before " ", " " $2 " ") == 0 { print $1; exit }')
    [ -n "$NEW_API_POD" ] && break
    printf '새 Ready Pod 대기 중: %s/36\n' "$attempt"
    attempt=$((attempt + 1))
    sleep 5
  done

  if [ -z "$NEW_API_POD" ]; then
    printf '180초 안에 새 UID의 Ready Pod를 찾지 못했습니다.\n' >&2
    kubectl --context kind-k8s-masterclass get pod \
      -n k8s-labs -l app=api -o wide
    kubectl --context kind-k8s-masterclass get events \
      -n k8s-labs --sort-by=.lastTimestamp
    exit 1
  fi

  if [ "$NEW_API_POD" = "$OLD_API_POD" ]; then
    printf '새 Pod 이름이 삭제 전 이름과 같습니다.\n' >&2
    exit 1
  fi

  NEW_API_UID=$(kubectl --context kind-k8s-masterclass get pod \
    "$NEW_API_POD" -n k8s-labs -o jsonpath='{.metadata.uid}')
  PERSISTED=$(kubectl --context kind-k8s-masterclass exec \
    "$NEW_API_POD" -n k8s-labs -c api -- \
    cat /usr/share/nginx/html/data/state.json | tr -d '\r\n')

  printf '교체 후 Pod=%s UID=%s\n' "$NEW_API_POD" "$NEW_API_UID"
  printf '교체 후 데이터=%s\n' "$PERSISTED"
  if [ "$PERSISTED" != '{"cart":"persistent","items":42}' ]; then
    printf '고유값이 유지되지 않았습니다. PVC mount를 확인하세요.\n' >&2
    exit 1
  fi
)
```

교체 전후 Pod 이름과 UID가 달라지고 새 Pod 내부에서 `items: 42`가 확인되어야 합니다. 기존 두 Pod의 UID 목록에 없던 새 Ready Pod를 직접 검사했으므로 Service load balancing이나 동일 seed 값에 의한 false positive를 피했습니다.

### 검증·힌트·정답 상태

<details class="course-hint"><summary>마일스톤 2 힌트</summary><p>PVC만 만들었을 때 <code>WaitForFirstConsumer</code>로 Pending인 것은 정상일 수 있습니다. API patch 뒤에도 rollout이 멈추면 PVC Events, 새 Pod의 scheduling Events, <code>seed-data</code> init container 로그 순서로 확인하세요.</p></details>

<details class="course-hint"><summary>마일스톤 2 정답 상태</summary><p><code>api-runtime</code> Secret의 key가 존재하고 PVC가 Bound이며, API Deployment에 init container·Secret env·PVC volume이 있어야 합니다. 선택 Pod에서 기록한 <code>items: 42</code>가 기존 UID 목록에 없던 새 Ready Pod의 volume에서도 보여야 통과입니다.</p></details>

## 마일스톤 3 — starter의 probe·request를 이용해 가용성 추가하기

### 문제

startup·readiness·liveness probe와 request는 starter에 이미 있습니다. 중복 작성하지 않고, 기존 label과 request를 이용해 topology spread, PDB, HPA를 추가합니다.

### 가용성 리소스 파일 만들기

`resources/milestone3-availability.yaml`:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api
  namespace: k8s-labs
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: api
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api
  namespace: k8s-labs
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

`patches/api-availability-patch.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: k8s-labs
spec:
  template:
    spec:
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: api
```

### 적용과 wait

```bash
kubectl --context kind-k8s-masterclass apply -f resources/milestone3-availability.yaml
kubectl --context kind-k8s-masterclass patch deployment api -n k8s-labs \
  --type=strategic \
  --patch-file patches/api-availability-patch.yaml

kubectl --context kind-k8s-masterclass rollout status deployment/api \
  -n k8s-labs --timeout=180s

kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=api \
  -o 'custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[0].ready,NODE:.spec.nodeName'
kubectl --context kind-k8s-masterclass get pdb,hpa -n k8s-labs
```

예상 상태는 API Pod 두 개가 Ready이고, Scheduler가 가능하면 서로 다른 worker를 선호하며, PDB `ALLOWED DISRUPTIONS`가 1인 것입니다. HPA TARGETS가 `<unknown>`이면 Metrics API가 준비되지 않은 상태이므로 12강의 APIService wait와 retry 절차를 먼저 수행합니다.

kind의 기본 local-path volume과 `ReadWriteOnce` PVC는 여러 Node에서 동시에 마운트할 수 있는 공유 데이터 계층이 아닙니다. API 두 Pod가 같은 PVC를 쓰므로 PV의 Node 제약 때문에 같은 worker에 배치될 수 있습니다. 그래서 이 캡스톤은 `ScheduleAnyway`로 가용한 배치를 우선하며, 실제 다중 Node 데이터 고가용성에는 RWX를 지원하는 storage나 외부 datastore가 필요합니다.

**왜 probe를 다시 쓰지 않나요?** 이미 starter의 Pod template에 세 probe가 있고 patch는 기존 container를 유지합니다. 캡스톤 평가는 “같은 설정을 한 번 더 적었는가”가 아니라 최종 렌더링 결과에 probe가 남아 있고 rollout이 Ready를 통과했는가를 봅니다.

### 검증·힌트·정답 상태

<details class="course-hint"><summary>마일스톤 3 힌트</summary><p>Pod가 한 Node에 있어도 먼저 PVC의 access mode와 PV node affinity를 확인하세요. 이 실습은 local-path RWO 데이터 가용성을 깨면서까지 분산을 강제하지 않습니다. Pod가 Pending이라면 taint, request, PVC affinity가 표시된 <code>FailedScheduling</code> Event를 읽습니다.</p></details>

<details class="course-hint"><summary>마일스톤 3 정답 상태</summary><p>최종 API Deployment에는 starter의 세 probe와 request·limit, 마일스톤 2의 Secret·PVC, 마일스톤 3의 <code>ScheduleAnyway</code> topology spread가 동시에 있어야 합니다. 두 Pod가 같은 Node여도 이 local RWO 실습에서는 실패가 아닙니다. PDB는 maxUnavailable 1, HPA는 min 2/max 5이고 <code>kubectl rollout status</code>가 완료되어야 합니다.</p></details>

## 마일스톤 4 — API가 필요한 주체에게만 RBAC 주기

### 문제

web과 api nginx는 Kubernetes API를 호출하지 않습니다. 이 두 workload에는 토큰을 주지 않고, 운영 점검을 수행할 `runbook-reader` Pod에만 Pod·Deployment·Event 읽기 권한을 줍니다.

### workload 토큰 끄기

`patches/api-token-off-patch.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: k8s-labs
spec:
  template:
    spec:
      automountServiceAccountToken: false
```

`patches/web-token-off-patch.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: k8s-labs
spec:
  template:
    spec:
      automountServiceAccountToken: false
```

### reader RBAC 파일 만들기

`resources/milestone4-rbac.yaml`:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: runbook-reader
  namespace: k8s-labs
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: runbook-reader
  namespace: k8s-labs
rules:
  - apiGroups: [""]
    resources: ["pods", "events"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: runbook-reader
  namespace: k8s-labs
subjects:
  - kind: ServiceAccount
    name: runbook-reader
    namespace: k8s-labs
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: runbook-reader
---
apiVersion: v1
kind: Pod
metadata:
  name: runbook-reader
  namespace: k8s-labs
spec:
  serviceAccountName: runbook-reader
  securityContext:
    runAsNonRoot: true
    runAsUser: 100
    runAsGroup: 101
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: client
      image: curlimages/curl:8.12.1
      command: ["sh", "-c", "sleep 86400"]
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
  restartPolicy: Never
```

### 적용과 실제 권한 검증

```bash
kubectl --context kind-k8s-masterclass patch deployment api -n k8s-labs \
  --type=strategic --patch-file patches/api-token-off-patch.yaml
kubectl --context kind-k8s-masterclass patch deployment web -n k8s-labs \
  --type=strategic --patch-file patches/web-token-off-patch.yaml
kubectl --context kind-k8s-masterclass apply -f resources/milestone4-rbac.yaml

kubectl --context kind-k8s-masterclass rollout status deployment/api \
  -n k8s-labs --timeout=180s
kubectl --context kind-k8s-masterclass rollout status deployment/web \
  -n k8s-labs --timeout=180s
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/runbook-reader --timeout=90s
```

web·api에 토큰 파일이 없는지 확인합니다.

```bash
kubectl --context kind-k8s-masterclass exec deployment/api -n k8s-labs -- \
  sh -c 'test ! -e /var/run/secrets/kubernetes.io/serviceaccount/token && echo "api: no API token"'
kubectl --context kind-k8s-masterclass exec deployment/web -n k8s-labs -- \
  sh -c 'test ! -e /var/run/secrets/kubernetes.io/serviceaccount/token && echo "web: no API token"'
```

reader는 list가 가능하고 delete는 불가능해야 합니다.

```bash
kubectl --context kind-k8s-masterclass auth can-i list pods \
  --as=system:serviceaccount:k8s-labs:runbook-reader \
  -n k8s-labs
kubectl --context kind-k8s-masterclass auth can-i delete pods \
  --as=system:serviceaccount:k8s-labs:runbook-reader \
  -n k8s-labs
```

예상 결과는 `yes`, `no`입니다. Pod 안의 실제 토큰으로 목록 요청도 확인합니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs runbook-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  curl -sS --cacert "$CA" \
    -H "Authorization: Bearer $TOKEN" \
    -o /dev/null -w "%{http_code}\n" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NS/pods"
'
```

예상 HTTP 코드는 `200`입니다.

### 검증·힌트·정답 상태

<details class="course-hint"><summary>마일스톤 4 힌트</summary><p>reader 요청이 403이면 ServiceAccount 이름, RoleBinding subject Namespace, Role의 apiGroups·resources·verbs를 차례로 비교하세요. workload에 토큰이 남았다면 Deployment가 새 revision으로 rollout되었는지 확인합니다.</p></details>

<details class="course-hint"><summary>마일스톤 4 정답 상태</summary><p>web·api는 <code>automountServiceAccountToken: false</code>이고 token 파일이 없어야 합니다. runbook-reader만 projected token을 가지며 list pods는 200/yes, delete pods는 no여야 합니다. reader Pod는 non-root, RuntimeDefault seccomp, privilege escalation 금지, read-only root filesystem, capability ALL drop을 만족해야 합니다.</p></details>

## 마일스톤 5 — 재현 가능한 package와 장애 Runbook 완성하기

### 문제

지금까지의 live patch만 남기면 새 클러스터에서 재현할 수 없습니다. 파일을 하나의 Kustomize package로 묶고 Kubernetes 1.35 schema를 검증한 뒤, Service selector 하나를 일부러 바꿔 실제 요청 실패를 증거로 복구합니다.

### 최상위 kustomization 만들기

`$HOME/k8s-course/lesson14/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - base/tiny-shop-starter.yaml
  - resources/milestone2-data.yaml
  - resources/milestone3-availability.yaml
  - resources/milestone4-rbac.yaml
patches:
  - path: patches/api-runtime-patch.yaml
    target:
      group: apps
      version: v1
      kind: Deployment
      name: api
  - path: patches/api-availability-patch.yaml
    target:
      group: apps
      version: v1
      kind: Deployment
      name: api
  - path: patches/api-token-off-patch.yaml
    target:
      group: apps
      version: v1
      kind: Deployment
      name: api
  - path: patches/web-token-off-patch.yaml
    target:
      group: apps
      version: v1
      kind: Deployment
      name: web
```

Secret은 source에 넣지 않았으므로 `api-runtime`이 존재하는지 먼저 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get secret api-runtime -n k8s-labs

kubectl --context kind-k8s-masterclass kustomize . > rendered-final.yaml
kubeconform -strict -summary \
  -kubernetes-version 1.35.0 \
  rendered-final.yaml
kubectl --context kind-k8s-masterclass apply --dry-run=server -f rendered-final.yaml
```

`Invalid: 0`, `Errors: 0`이고 server dry-run이 통과해야 합니다. 이어서 최종 source를 적용하고 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply -k .
kubectl --context kind-k8s-masterclass rollout status deployment/api \
  -n k8s-labs --timeout=180s
kubectl --context kind-k8s-masterclass rollout status deployment/web \
  -n k8s-labs --timeout=180s
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/runbook-reader --timeout=90s
```

### 정상 요청을 다시 baseline으로 확인

첫 터미널:

```bash
kubectl --context kind-k8s-masterclass port-forward service/web -n k8s-labs 8080:80
```

두 번째 터미널:

```bash
curl -fsS http://localhost:8080/api/
curl -fsS http://localhost:8080/api/data/state.json
```

두 요청이 성공해야 장애를 주입할 수 있습니다.

### 하나만 변경해 장애 주입 — api Service selector

```bash
kubectl --context kind-k8s-masterclass patch service api -n k8s-labs \
  --type=merge -p '{"spec":{"selector":{"app":"api-broken"}}}'
```

5초 정도 기다린 뒤 같은 요청의 HTTP 상태를 기록합니다.

```bash
sleep 5
curl -sS -o /tmp/tiny-shop-failure.txt \
  -w 'HTTP %{http_code}\n' \
  http://localhost:8080/api/
```

예상 실패는 nginx의 `502` 또는 `503`입니다. 환경에 따라 연결 실패가 먼저 보일 수도 있지만 성공 JSON이 나오면 안 됩니다.

### 증거를 순서대로 모읍니다

```bash
kubectl --context kind-k8s-masterclass get deployment api -n k8s-labs
kubectl --context kind-k8s-masterclass get pod -n k8s-labs -l app=api
kubectl --context kind-k8s-masterclass get service api -n k8s-labs -o yaml
kubectl --context kind-k8s-masterclass get endpointslice -n k8s-labs \
  -l kubernetes.io/service-name=api -o wide
kubectl --context kind-k8s-masterclass logs -n k8s-labs \
  -l app=web --all-containers --prefix --tail=80
kubectl --context kind-k8s-masterclass get events -n k8s-labs --sort-by=.lastTimestamp
```

정상 API Pod는 여전히 2개 이상 Ready인데 api EndpointSlice 주소가 비어 있어야 합니다. 따라서 “API 프로세스가 죽었다”보다 “Service가 Ready Pod를 선택하지 못한다”는 가설이 증거를 더 잘 설명합니다.

### 반드시 복구 — selector 한 값만 되돌립니다

```bash
kubectl --context kind-k8s-masterclass patch service api -n k8s-labs \
  --type=merge -p '{"spec":{"selector":{"app":"api"}}}'

attempt=1
while [ "$attempt" -le 12 ]; do
  ENDPOINTS=$(kubectl --context kind-k8s-masterclass get endpointslice -n k8s-labs \
    -l kubernetes.io/service-name=api \
    -o jsonpath='{range .items[*].endpoints[*].addresses[*]}{.}{" "}{end}')
  printf 'api endpoints: %s\n' "${ENDPOINTS:-none}"
  [ -n "$ENDPOINTS" ] && break
  attempt=$((attempt + 1))
  sleep 5
done

curl -fsS http://localhost:8080/api/
```

원래 JSON이 다시 나오면 복구 완료입니다. port-forward 터미널에서 `Ctrl-C`를 누릅니다.

### Runbook에 남길 장애 기록

```text
증상: /api/ 요청이 502 또는 503
범위: web 자체 / 는 정상, web → api 경로만 실패
변경: api Service selector app=api → app=api-broken
증거: API Pod Ready, api EndpointSlice address 없음, web upstream 오류 로그
가설: Service selector가 API Pod label과 불일치
조치: selector를 app=api로 복구
검증: EndpointSlice address 재생성, /api/ 200과 정상 JSON
예방: render 결과의 Service selector와 Pod label을 CI에서 비교하고 smoke test 실행
```

### 검증·힌트·정답 상태

<details class="course-hint"><summary>마일스톤 5 힌트</summary><p>Pod가 Ready라고 요청 경로가 정상인 것은 아닙니다. Service selector, Pod label, EndpointSlice address를 한 줄로 연결해서 비교하세요. 여러 리소스를 동시에 재시작하지 마세요.</p></details>

<details class="course-hint"><summary>마일스톤 5 정답 상태</summary><p>최종 source는 starter, PVC, PDB·HPA, RBAC과 네 patch를 최상위 <code>kustomization.yaml</code>로 렌더링해야 하며 Kubernetes 1.35 kubeconform과 server dry-run을 통과해야 합니다. 장애 중에는 API Pod가 Ready인 채 endpoint만 0이 되고, selector 복구 뒤 endpoint와 HTTP 200이 돌아와야 합니다. 위 일곱 항목을 Runbook에 기록하면 통과입니다.</p></details>

## 배포 파이프라인 최소 Gate

저장소에서 package 경로가 `tiny-shop-capstone`이라고 가정한 예시입니다.

```yaml
name: validate-kubernetes
on:
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-kubectl@v4
        with:
          version: v1.35.0
      - name: Render Kustomize package
        run: kubectl kustomize tiny-shop-capstone > rendered.yaml
      - name: Install kubeconform
        run: |
          curl -fsSLo kubeconform.tar.gz \
            https://github.com/yannh/kubeconform/releases/download/v0.8.0/kubeconform-linux-amd64.tar.gz
          tar -xzf kubeconform.tar.gz kubeconform
          sudo install kubeconform /usr/local/bin/kubeconform
      - name: Validate Kubernetes 1.35 schema
        run: >-
          kubeconform -strict -summary
          -kubernetes-version 1.35.0 rendered.yaml
```

실제 저장소에서는 다운로드 checksum도 고정합니다. offline schema 검증은 Secret 존재, admission, rollout, HTTP 경로를 확인하지 못하므로 ephemeral Kubernetes 1.35 kind 클러스터에서 Secret 생성 → apply → wait → smoke test를 별도 job으로 추가합니다.

## 선택 확장 — starter nginx를 non-root로 옮기기

이 작업은 단순히 `runAsNonRoot: true` 한 줄을 추가해서 끝나지 않습니다. `nginxinc/nginx-unprivileged`처럼 non-root를 지원하는 image로 바꾸고, web nginx의 listen port와 Deployment containerPort, Service targetPort, probe port, 쓰기 필요한 디렉터리 volume을 함께 바꿔야 합니다.

한 번에 전부 바꾸지 말고 별도 Kustomize package에서 렌더링 diff를 검토하세요. 전환 뒤에는 restricted Pod Security Admission을 적용한 별도 Namespace에서 실제 rollout과 smoke test를 통과시켜야 합니다.

## 최종 평가

- 20%: starter가 이미 제공하는 probe·resource와 새로 추가한 기능을 정확히 구분
- 20%: Secret 값이 source에 없고 PVC 데이터가 Pod 교체 뒤 유지됨
- 20%: topology spread·PDB·HPA의 최종 상태와 보호 범위 설명
- 20%: workload 토큰 제거와 runbook-reader 최소 권한 증명
- 20%: Kubernetes 1.35 render 검증, selector 장애의 증거 기반 복구, Runbook

<div class="success-check"><strong>최종 통과:</strong> 새 클러스터에서 Secret을 별도로 만들고 Kustomize package를 적용한 뒤, 모든 wait와 smoke test를 통과하고, selector 장애를 재현·설명·복구할 수 있어야 합니다.</div>

## 실습 환경 정리

정리 전 마지막으로 Node와 PVC 상태를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get pvc api-data -n k8s-labs
```

다음 명령은 캡스톤 데이터까지 삭제합니다.

```bash
kubectl --context kind-k8s-masterclass delete namespace k8s-labs \
  --ignore-not-found --wait=true --timeout=180s
```

출력 대기 중 `Ctrl-C`를 눌렀다면 삭제 요청이 취소되었다고 가정하지 말고 다시 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

`NotFound`가 최종 정리 상태입니다. 과정 전용 클러스터까지 지우려면 다음 정확한 이름을 사용합니다.

```bash
kind delete cluster --name k8s-masterclass
```

## 세 문장 정리

운영형 배포는 기능 목록이 아니라 baseline, 재현 가능한 source, bounded wait, 실제 요청 검증으로 증명합니다. 장애가 나면 정상 Pod 수만 보지 말고 요청 경로의 Service selector와 EndpointSlice처럼 증상을 직접 설명하는 증거를 찾아야 합니다. Secret 값과 데이터 수명, API 권한을 각각 분리하고 마지막 변경 하나를 되돌려 복구할 수 있어야 합니다.

## 과정 종료 상태

- `k8s-labs` Namespace와 PVC가 삭제되었습니다.
- `$HOME/k8s-course/lesson14`에는 재현 가능한 source와 `rendered-final.yaml`, 개인 Runbook을 남길 수 있습니다.
- 과정 전용 kind 클러스터를 삭제했다면 cluster 범위 add-on도 함께 정리됩니다.
- 공유 클러스터에서는 Namespace 삭제 여부와 cluster 범위 리소스를 별도로 확인해야 합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/13-helm-kustomize/">← 이전: Helm과 Kustomize</a><a href="/kubernetes/">전체 커리큘럼으로 돌아가기 ↑</a></nav>

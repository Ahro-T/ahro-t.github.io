---
title: "07. Volume과 StatefulSet — Pod가 바뀌어도 데이터 남기기"
summary: "StorageClass·PV·PVC의 범위를 구분하고, Pod와 StatefulSet Pod를 교체한 뒤 같은 Volume에서 데이터를 다시 읽습니다."
description: "kind의 동적 프로비저닝을 확인하고 emptyDir과 PVC의 수명 차이, StatefulSet의 안정적인 이름과 데이터 보존을 단계별로 검증합니다."
weight: 70
categories: ["Kubernetes"]
tags: ["PVC", "StatefulSet", "Storage"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 07 · Beginner · Stateful Workloads</p>

## 이번 시간에 해결할 문제

컨테이너 안에 주문 파일을 저장했다고 생각해봅시다. Pod가 교체되면 컨테이너의 writable layer도 함께 사라집니다. `emptyDir`를 붙여도 같은 Pod 안의 컨테이너끼리만 파일을 공유할 뿐, Pod 자체가 삭제되면 데이터도 사라집니다.

데이터의 수명을 Pod와 분리하려면 애플리케이션은 PVC로 저장소를 요청하고, 클러스터는 그 요청에 맞는 PV를 연결해야 합니다.

> Pod는 교체할 수 있게 만들고, 보존해야 할 데이터는 Pod 밖의 Volume에 둡니다.

## 이 강의를 마치면

- `emptyDir`, PVC, PV, StorageClass의 역할과 수명 차이를 설명할 수 있습니다.
- Namespace에 속하는 PVC와 클러스터 범위인 PV를 올바른 명령으로 조회할 수 있습니다.
- Pod를 삭제하고 다시 만든 뒤 같은 PVC에서 데이터를 읽을 수 있습니다.
- StatefulSet Pod의 이름은 같아도 UID는 바뀌며, ordinal별 PVC는 유지되는 것을 검증할 수 있습니다.

## 시작 전 확인 — StorageClass부터 보기

이 강의는 macOS·Linux Bash/Zsh 또는 Windows WSL2 Bash를 기준으로 합니다. 먼저 Node와 StorageClass를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get storageclass
kubectl --context kind-k8s-masterclass get storageclass standard
```

kind 기본 클러스터에서는 다음과 비슷한 결과가 보여야 합니다.

```text
NAME                 PROVISIONER               RECLAIMPOLICY   VOLUMEBINDINGMODE
standard (default)   rancher.io/local-path     Delete          WaitForFirstConsumer
```

<div class="expected-result"><strong>성공 기준</strong><span><code>standard</code> StorageClass가 존재하고 기본값으로 표시됩니다.</span></div>

`storageclasses.storage.k8s.io "standard" not found`가 보인다면 이 강의의 kind 환경과 다릅니다. PVC 실습을 계속 붙여 넣지 말고 1강의 kind 클러스터 구성을 다시 확인하세요.

Namespace도 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

독립적으로 듣고 있어 Namespace가 없다면 만듭니다.

```bash
kubectl --context kind-k8s-masterclass create namespace k8s-labs
```

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 수명·범위 |
|---|---|---|
| `emptyDir` | 같은 Pod의 컨테이너가 공유하는 임시 디렉터리 | Pod와 함께 삭제 |
| PVC | 앱이 필요한 저장소를 요청하는 객체 | Namespace 범위 |
| PV | 클러스터가 연결한 실제 Volume의 표현 | 클러스터 범위 |
| StorageClass | PV를 어떤 방식으로 만들지 정한 정책 | 클러스터 범위 |
| StatefulSet | ordinal 이름과 Pod별 PVC가 필요한 workload | Pod를 순서대로 관리 |

## 저장소 연결을 그림으로 보기

```text
k8s-labs Namespace
┌───────────────────────────────────────┐
│ data-writer Pod                       │
│      │ volumeMount: /data             │
│      ▼                                │
│ course-data PVC ─── 필요한 크기 1Gi   │
└──────────────│────────────────────────┘
               │ bind
               ▼
클러스터 범위 PV
               │ provision
               ▼
standard StorageClass / local-path provisioner
```

`kubectl get pvc -n k8s-labs`에는 Namespace가 필요합니다. PV와 StorageClass는 Namespace 밖의 클러스터 객체이므로 `kubectl get pv`, `kubectl get storageclass`로 조회합니다.

## 실습 1 — PVC를 요청하고 데이터 쓰기

다음 내용을 `07-pvc-pod.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: course-data
  namespace: k8s-labs
spec:
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: data-writer
  namespace: k8s-labs
spec:
  restartPolicy: Never
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "sleep 86400"]
      volumeMounts:
        - name: data
          mountPath: /data
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          memory: 64Mi
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: course-data
```

적용하고 PVC가 `Bound`, Pod가 `Ready`가 될 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 07-pvc-pod.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=jsonpath='{.status.phase}'=Bound \
  pvc/course-data \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/data-writer \
  -n k8s-labs \
  --timeout=90s
```

PVC와 연결된 PV를 각각의 범위에서 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get pvc course-data \
  -n k8s-labs \
  -o wide

PV_NAME=$(kubectl --context kind-k8s-masterclass get pvc course-data \
  -n k8s-labs \
  -o jsonpath='{.spec.volumeName}')
printf 'bound PV=%s\n' "$PV_NAME"
kubectl --context kind-k8s-masterclass get pv "$PV_NAME" \
  -o wide
```

예상 결과:

- PVC의 STATUS는 `Bound`입니다.
- PVC의 VOLUME과 `PV_NAME`이 같습니다.
- PV의 CLAIM에는 `k8s-labs/course-data`가 보입니다.

데이터를 쓰고 읽습니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs data-writer -- \
  sh -c 'printf "course-data-v1\n" > /data/message'
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs data-writer -- cat /data/message
```

`course-data-v1`이 출력되어야 합니다.

## 하나만 바꾸기 — Pod만 교체하기

PVC는 삭제하지 않고 Pod만 삭제합니다. 먼저 UID를 저장합니다. 새 UID를 비교할 때까지 같은 터미널을 사용하세요. shell 변수는 새 터미널로 자동 전달되지 않습니다.

```bash
OLD_WRITER_UID=$(kubectl --context kind-k8s-masterclass get pod data-writer \
  -n k8s-labs \
  -o jsonpath='{.metadata.uid}')
kubectl --context kind-k8s-masterclass delete pod data-writer \
  -n k8s-labs \
  --wait=true
kubectl --context kind-k8s-masterclass apply \
  -f 07-pvc-pod.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/data-writer \
  -n k8s-labs \
  --timeout=90s
```

새 UID와 파일을 확인합니다.

```bash
NEW_WRITER_UID=$(kubectl --context kind-k8s-masterclass get pod data-writer \
  -n k8s-labs \
  -o jsonpath='{.metadata.uid}')
printf 'old UID=%s\nnew UID=%s\n' \
  "$OLD_WRITER_UID" "$NEW_WRITER_UID"
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs data-writer -- cat /data/message
```

UID는 달라야 하고 데이터는 여전히 `course-data-v1`이어야 합니다. 새 Pod가 같은 PVC와 PV를 다시 mount했기 때문입니다.

{{< alert "circle-info" >}}
PVC는 백업이 아닙니다. 이 kind의 local-path PV는 kind Node 컨테이너 안의 경로를 사용하므로 클러스터를 삭제하면 함께 사라집니다. 운영에서는 StorageClass의 실제 backend, snapshot, backup과 restore 절차를 별도로 설계합니다.
{{< /alert >}}

## 비교 실습 — emptyDir은 Pod와 함께 사라진다

다음 내용을 `07-emptydir.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: emptydir-demo
  namespace: k8s-labs
spec:
  restartPolicy: Never
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 86400"]
      volumeMounts:
        - name: scratch
          mountPath: /scratch
  volumes:
    - name: scratch
      emptyDir: {}
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 07-emptydir.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/emptydir-demo \
  -n k8s-labs \
  --timeout=90s
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs emptydir-demo -- \
  sh -c 'printf "temporary\n" > /scratch/message'
```

Pod를 삭제하고 같은 manifest로 새 Pod를 만듭니다.

```bash
kubectl --context kind-k8s-masterclass delete pod emptydir-demo \
  -n k8s-labs \
  --wait=true
kubectl --context kind-k8s-masterclass apply \
  -f 07-emptydir.yaml
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/emptydir-demo \
  -n k8s-labs \
  --timeout=90s
```

### 예상 실패 실습

새 Pod의 emptyDir에는 이전 파일이 없어야 합니다. 다음 명령은 종료 코드 0이 아니어야 정상입니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs emptydir-demo -- \
  test -f /scratch/message
```

아무 내용도 출력되지 않고 명령이 실패하면 emptyDir 데이터가 Pod와 함께 사라진 것을 확인한 것입니다. 비교 Pod는 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod emptydir-demo \
  -n k8s-labs \
  --wait=true
```

## 실습 2 — StatefulSet의 이름과 데이터 보존 확인

StatefulSet은 `stateful-web-0`, `stateful-web-1`처럼 ordinal이 붙은 안정적인 이름과 Pod별 PVC를 만듭니다. 다음 내용을 `07-stateful-web.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: stateful-web
  namespace: k8s-labs
spec:
  clusterIP: None
  selector:
    app: stateful-web
  ports:
    - name: http
      port: 80
      targetPort: http
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: stateful-web
  namespace: k8s-labs
spec:
  serviceName: stateful-web
  replicas: 2
  selector:
    matchLabels:
      app: stateful-web
  template:
    metadata:
      labels:
        app: stateful-web
    spec:
      initContainers:
        - name: prepare-page
          image: busybox:1.36
          command: ["sh", "-c"]
          args:
            - test -f /data/index.html || printf 'initial page\n' > /data/index.html
          volumeMounts:
            - name: data
              mountPath: /data
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
            periodSeconds: 3
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              memory: 128Mi
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: stateful-web
      spec:
        storageClassName: standard
        accessModes:
          - ReadWriteOnce
        resources:
          requests:
            storage: 1Gi
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 07-stateful-web.yaml
kubectl --context kind-k8s-masterclass rollout status \
  statefulset/stateful-web \
  -n k8s-labs \
  --timeout=3m
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=stateful-web \
  -o wide
kubectl --context kind-k8s-masterclass get pvc \
  -n k8s-labs \
  -l app=stateful-web
```

Pod는 `stateful-web-0`, `stateful-web-1`, PVC는 `data-stateful-web-0`, `data-stateful-web-1`이어야 합니다.

0번 Pod의 파일을 고유한 값으로 바꾸고 UID를 저장합니다. Pod를 다시 만든 뒤 비교할 때까지 같은 터미널을 사용합니다.

```bash
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs stateful-web-0 -- \
  sh -c 'printf "persisted-by-stateful-web-0\n" > /usr/share/nginx/html/index.html'
OLD_STATEFUL_UID=$(kubectl --context kind-k8s-masterclass get pod stateful-web-0 \
  -n k8s-labs \
  -o jsonpath='{.metadata.uid}')
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs stateful-web-0 -- \
  cat /usr/share/nginx/html/index.html
```

Pod 0만 삭제합니다. StatefulSet이 같은 이름으로 새 Pod를 만들 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass delete pod stateful-web-0 \
  -n k8s-labs \
  --wait=true
kubectl --context kind-k8s-masterclass wait \
  --for=create \
  pod/stateful-web-0 \
  -n k8s-labs \
  --timeout=90s
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/stateful-web-0 \
  -n k8s-labs \
  --timeout=2m
```

이름, UID, 데이터를 함께 확인합니다.

```bash
NEW_STATEFUL_UID=$(kubectl --context kind-k8s-masterclass get pod stateful-web-0 \
  -n k8s-labs \
  -o jsonpath='{.metadata.uid}')
printf 'old UID=%s\nnew UID=%s\n' \
  "$OLD_STATEFUL_UID" "$NEW_STATEFUL_UID"
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs stateful-web-0 -- \
  cat /usr/share/nginx/html/index.html
```

Pod 이름은 다시 `stateful-web-0`이지만 UID는 달라야 합니다. 파일은 `persisted-by-stateful-web-0`을 유지해야 합니다. 안정적인 이름과 동일 객체는 같은 뜻이 아닙니다.

## 예상 실패 실습 — 존재하지 않는 PVC 참조

원본 파일을 수정하지 않고 별도 `07-missing-pvc.yaml`을 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: data-writer-missing
  namespace: k8s-labs
spec:
  restartPolicy: Never
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "sleep 86400"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: missing-claim
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 07-missing-pvc.yaml
```

다음 wait는 20초 후 실패해야 정상입니다.

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/data-writer-missing \
  -n k8s-labs \
  --timeout=20s
```

증거는 애플리케이션 로그가 아니라 Scheduler Events에 있습니다.

```bash
kubectl --context kind-k8s-masterclass get pod data-writer-missing \
  -n k8s-labs
kubectl --context kind-k8s-masterclass describe pod data-writer-missing \
  -n k8s-labs
```

`persistentvolumeclaim "missing-claim" not found`와 같은 메시지를 확인한 뒤 실패 Pod를 삭제합니다.

## 반드시 실패 Pod를 삭제하고 PVC 상태 검증하기

```bash
kubectl --context kind-k8s-masterclass delete pod data-writer-missing \
  -n k8s-labs \
  --wait=true
kubectl --context kind-k8s-masterclass get pvc \
  -n k8s-labs
```

`course-data`와 StatefulSet PVC가 모두 `Bound`여야 복구가 끝납니다.

## 스스로 해보기 — StatefulSet을 3개로 늘렸다 줄이기

StatefulSet을 3개로 늘리고 새 Pod와 PVC 이름을 예상하세요. 다시 2개로 줄였을 때 Pod와 PVC가 각각 어떻게 되는지도 확인합니다.

<details class="course-hint">
<summary>실행 명령과 정답</summary>

```bash
kubectl --context kind-k8s-masterclass scale statefulset/stateful-web \
  -n k8s-labs \
  --replicas=3
kubectl --context kind-k8s-masterclass rollout status statefulset/stateful-web \
  -n k8s-labs \
  --timeout=3m
kubectl --context kind-k8s-masterclass get pod,pvc \
  -n k8s-labs \
  -l app=stateful-web

kubectl --context kind-k8s-masterclass scale statefulset/stateful-web \
  -n k8s-labs \
  --replicas=2
kubectl --context kind-k8s-masterclass rollout status statefulset/stateful-web \
  -n k8s-labs \
  --timeout=3m
kubectl --context kind-k8s-masterclass get pod,pvc \
  -n k8s-labs \
  -l app=stateful-web
```

3개일 때 `stateful-web-2`와 `data-stateful-web-2`가 생깁니다. 2개로 줄이면 Pod 2는 사라지지만 데이터 보호를 위해 PVC 2는 자동 삭제되지 않습니다. 연습용 PVC 2만 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pvc data-stateful-web-2 \
  -n k8s-labs \
  --wait=true
```

</details>

## 3문장 정리

1. emptyDir은 Pod와 수명을 같이하지만 PVC와 PV는 Pod가 교체되어도 데이터를 유지할 수 있습니다.
2. PVC는 Namespace 범위의 요청이고 PV와 StorageClass는 클러스터 범위의 공급 객체입니다.
3. StatefulSet은 ordinal 이름과 Pod별 PVC를 제공하지만 백업, 복제 일관성, 재해 복구까지 대신하지는 않습니다.

## 다음 강의로 가져가는 상태

- `course-data` PVC: Bound
- `data-writer` Pod: Ready, `/data/message` 보존
- `stateful-web` StatefulSet: 2/2 Ready
- `data-stateful-web-0`, `data-stateful-web-1`: Bound
- 실패용 `emptydir-demo`, `data-writer-missing`: 삭제됨

```bash
kubectl --context kind-k8s-masterclass get pod,pvc \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get pv
```

실패 Pod가 없고 모든 PVC가 Bound이면 8강으로 이동합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/06-config-secret/">← 이전: ConfigMap과 Secret</a><a href="/kubernetes/08-probes-resources/">다음: Probe와 리소스 →</a></nav>

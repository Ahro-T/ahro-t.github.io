---
title: "03. Pod — 컨테이너를 실행하는 최소 단위"
summary: "컨테이너 하나에서 시작해 init container와 공유 Volume을 추가하고 Pod의 생명주기와 장애 상태를 관찰합니다."
description: "Pod가 VM이 아닌 이유, 컨테이너의 공유 범위, init container, emptyDir, 대표 상태와 복구 순서를 단계별로 다룹니다."
weight: 30
categories: ["Kubernetes"]
tags: ["Pod", "Containers", "Troubleshooting"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 03 · Beginner · Workload Basics</p>

## 이번 시간에 해결할 문제

웹 서버가 시작되기 전에 설정 파일이나 초기 화면을 준비해야 한다고 가정해봅시다. 준비 작업과 웹 서버를 별도 머신처럼 관리하면 실행 순서와 파일 전달을 직접 맞춰야 합니다.

쿠버네티스의 Pod는 **같은 Node에 함께 놓이고, 네트워크와 수명을 함께해야 하는 컨테이너를 묶는 최소 실행 단위**입니다. 이번 강의에서는 컨테이너 하나인 Pod부터 시작해, 먼저 끝나야 하는 init container와 함께 쓰는 Volume을 하나씩 추가합니다.

## 이 강의를 마치면

- Pod와 컨테이너를 같은 말처럼 사용하면 안 되는 이유를 설명할 수 있습니다.
- 같은 Pod의 컨테이너가 공유하는 것과 공유하지 않는 것을 구분할 수 있습니다.
- init container가 완료된 뒤 앱 컨테이너가 시작되는 순서를 확인할 수 있습니다.
- `Pending`, `Running`, `ImagePullBackOff`, `CrashLoopBackOff`, `Succeeded`를 원인과 상태로 구분할 수 있습니다.

## 시작 전 확인

클러스터, Node, Namespace를 확인합니다. 모든 Node가 `Ready`이고 `k8s-labs`가 `Active`여야 합니다.

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

이 강의에서 사용할 이름의 이전 실습 Pod가 남아 있다면 먼저 정리합니다. 다른 강의의 Deployment는 삭제하지 않습니다.

```bash
kubectl --context kind-k8s-masterclass delete pod pod-basic pod-lab broken-image -n k8s-labs --ignore-not-found
```

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 오늘의 예 |
|---|---|---|
| Pod | 함께 배치되고 수명을 공유하는 컨테이너 묶음 | `pod-lab` |
| Container | 이미지로 시작한 격리된 프로세스 | nginx 웹 서버 |
| init container | 앱보다 먼저 실행되어 성공해야 하는 준비 컨테이너 | HTML 파일 생성 |
| Volume | Pod의 컨테이너가 마운트해 사용하는 저장 공간 | `emptyDir` |
| Lifecycle | 생성부터 종료까지 객체가 거치는 상태 변화 | Pending → Running |

## 먼저 그림으로 이해하기

```text
Pod: pod-lab                       하나의 Pod IP
┌─────────────────────────────────────────────┐
│ 1. init container                           │
│    /work/index.html 작성                    │
│              │                              │
│              ▼                              │
│       [ emptyDir Volume ]                    │
│              │ 같은 Volume을 다른 경로에 mount
│              ▼                              │
│ 2. web container                            │
│    /usr/share/nginx/html/index.html 읽기     │
└─────────────────────────────────────────────┘
```

같은 Pod의 컨테이너는 같은 IP를 사용해 `localhost`로 통신할 수 있습니다. 그러나 각 컨테이너의 기본 파일시스템은 분리되어 있습니다. 파일을 함께 사용하려면 같은 Volume을 각 컨테이너에 마운트해야 합니다.

## Pod 상태를 읽기 전에 알아둘 것

`kubectl get pod`의 `STATUS` 한 칸에는 Pod phase 또는 대표적인 대기 이유가 요약되어 보입니다.

| 화면에 보이는 값 | 뜻 | 첫 증거 |
|---|---|---|
| `Pending` | 아직 실행할 Node·Volume·이미지가 준비되지 않음 | `describe`의 Events |
| `Running` | Pod가 Node에 배치되고 컨테이너가 실행 중 | `READY`, probe, logs |
| `ImagePullBackOff` | 이미지를 가져오지 못해 재시도 간격이 늘어남 | Events의 image 이름·인증 오류 |
| `CrashLoopBackOff` | 시작한 프로세스가 반복 종료되어 재시도 중 | `logs --previous`, exit code |
| `Completed` / `Succeeded` | 해야 할 프로세스가 exit code 0으로 종료 | 종료 reason과 exit code |

`ImagePullBackOff`와 `CrashLoopBackOff`는 최종 원인 이름이 아닙니다. “실패 후 재시도 중”이라는 상태이므로 Events와 로그에서 앞선 원인을 찾아야 합니다.

## 실습 1 — 컨테이너 하나인 Pod

다음 내용을 `03-pod-basic.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-basic
  namespace: k8s-labs
  labels:
    app: pod-basic
spec:
  containers:
    - name: web
      image: nginx:1.27-alpine
      ports:
        - name: http
          containerPort: 80
```

적용하기 전에 예상해봅시다. Pod 하나 안에 `web` 컨테이너 하나가 있으므로 Ready 표시는 최종적으로 `1/1`이어야 합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 03-pod-basic.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/pod-basic -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass get pod pod-basic -n k8s-labs -o wide
```

예상 결과:

```text
NAME        READY   STATUS    RESTARTS   ...   IP          NODE
pod-basic   1/1     Running   0          ...   10.x.x.x    k8s-masterclass-worker...
```

- `READY 1/1`: 컨테이너 하나 중 하나가 준비됐습니다.
- `IP`: 이 Pod가 사용하는 주소입니다. Pod가 교체되면 달라질 수 있습니다.
- `NODE`: scheduler가 선택한 실행 위치입니다. 선택 규칙은 10강에서 배웁니다.

nginx 프로세스가 실제로 시작됐는지 최근 로그를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass logs pod/pod-basic -n k8s-labs --tail=20
```

nginx 시작 메시지가 보이면 정상입니다. Pod 상태와 애플리케이션 로그가 서로 다른 증거라는 점을 기억하세요.

## 실습 2 — init container와 Volume 추가

다음 내용을 `03-pod-lab.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-lab
  namespace: k8s-labs
  labels:
    app: pod-lab
spec:
  initContainers:
    - name: prepare-page
      image: busybox:1.36
      command: ["sh", "-c"]
      args:
        - echo '<h1>prepared by init container</h1>' > /work/index.html
      volumeMounts:
        - name: web-content
          mountPath: /work
  containers:
    - name: web
      image: nginx:1.27-alpine
      ports:
        - name: http
          containerPort: 80
      volumeMounts:
        - name: web-content
          mountPath: /usr/share/nginx/html
  volumes:
    - name: web-content
      emptyDir: {}
```

YAML을 다음 순서로 읽습니다.

1. `volumes`가 `web-content`라는 빈 공간을 준비합니다.
2. init container가 그 공간을 `/work`에 연결하고 `index.html`을 씁니다.
3. init container가 성공적으로 끝난 뒤에만 `web` 컨테이너가 시작됩니다.
4. `web`은 같은 공간을 nginx 문서 경로에 연결해 파일을 제공합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f 03-pod-lab.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/pod-lab -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass get pod pod-lab -n k8s-labs
```

Pod는 `READY 1/1`, `STATUS Running`이어야 합니다. init container는 이미 끝났으므로 Ready 분모에 포함되지 않습니다. 상태를 따로 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get pod pod-lab -n k8s-labs \
  -o jsonpath='{range .status.initContainerStatuses[*]}{.name}{" ready="}{.ready}{" reason="}{.state.terminated.reason}{" exit="}{.state.terminated.exitCode}{"\n"}{end}'
```

예상 결과:

```text
prepare-page ready=true reason=Completed exit=0
```

### 브라우저 대신 HTTP 응답 확인하기

첫 번째 터미널에서 다음 명령을 실행한 채 둡니다.

```bash
kubectl --context kind-k8s-masterclass port-forward pod/pod-lab -n k8s-labs 8080:80
```

두 번째 터미널에서 요청합니다.

```bash
curl http://localhost:8080
```

`<h1>prepared by init container</h1>`이 나오면 두 컨테이너가 Volume을 통해 파일을 전달한 것입니다. 확인 후 첫 번째 터미널에서 `Ctrl-C`를 눌러 port-forward를 종료합니다. 8080 포트가 이미 사용 중이면 `18080:80`으로 바꾸고 `curl http://localhost:18080`을 사용하세요.

## 하나만 바꿔 관찰하기 — Pod가 바뀌면 `emptyDir`도 바뀐다

실행 중인 web 컨테이너에서 `runtime.txt`를 같은 Volume에 추가합니다.

```bash
kubectl --context kind-k8s-masterclass exec pod/pod-lab -n k8s-labs -- \
  sh -c 'echo created-during-runtime > /usr/share/nginx/html/runtime.txt'
kubectl --context kind-k8s-masterclass exec pod/pod-lab -n k8s-labs -- \
  cat /usr/share/nginx/html/runtime.txt
```

`created-during-runtime`이 출력됩니다. 이제 Pod만 삭제하고 같은 YAML로 새 Pod를 만듭니다.

```bash
kubectl --context kind-k8s-masterclass delete pod pod-lab -n k8s-labs --wait=true
kubectl --context kind-k8s-masterclass apply -f 03-pod-lab.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/pod-lab -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass exec pod/pod-lab -n k8s-labs -- \
  sh -c 'if [ -f /usr/share/nginx/html/runtime.txt ]; then echo exists; else echo disappeared-with-old-pod; fi'
```

예상 결과는 `disappeared-with-old-pod`입니다. `emptyDir`은 컨테이너 재시작보다 오래 남을 수 있지만 **Pod가 삭제되면 함께 사라지는 임시 Volume**입니다. init container가 새 Pod에서 다시 실행됐으므로 `index.html`은 다시 존재합니다.

## 장애 주입과 복구 — 존재하지 않는 이미지

다음 내용을 `03-broken-image.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: broken-image
  namespace: k8s-labs
spec:
  containers:
    - name: app
      image: nginx:not-a-real-version
```

```bash
kubectl --context kind-k8s-masterclass apply -f 03-broken-image.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass get pod broken-image -n k8s-labs
kubectl --context kind-k8s-masterclass describe pod broken-image -n k8s-labs
```

처음에는 `ErrImagePull`, 재시도 중에는 `ImagePullBackOff`가 보일 수 있습니다. `describe`의 Events에서 다음과 비슷한 문장을 찾으세요.

```text
Failed to pull image "nginx:not-a-real-version"
```

상태 이름만 보고 네트워크 문제라고 단정하지 마세요. 이번 Events에는 요청한 tag가 존재하지 않는다는 증거가 있습니다.

이미지 필드만 올바른 tag로 수정해 복구합니다.

```bash
kubectl --context kind-k8s-masterclass set image pod/broken-image -n k8s-labs app=nginx:1.27-alpine
kubectl --context kind-k8s-masterclass wait pod/broken-image -n k8s-labs --for=condition=Ready --timeout=90s
kubectl --context kind-k8s-masterclass get pod broken-image -n k8s-labs
```

`READY 1/1`, `STATUS Running`이면 복구가 끝났습니다. 실습용 Pod를 정리합니다.

```bash
kubectl --context kind-k8s-masterclass delete pod broken-image -n k8s-labs --ignore-not-found
```

## 종료 코드를 읽는 법

- exit code `0`: 프로세스가 정상적으로 일을 끝냈습니다.
- exit code `1`: 애플리케이션의 일반 오류인 경우가 많지만 로그 확인이 필요합니다.
- exit code `137`: SIGKILL을 받았습니다. memory limit 초과 여부를 함께 확인합니다.
- exit code `143`: SIGTERM을 받고 종료한 경우가 많습니다.

숫자만으로 원인을 확정하지 않습니다. `lastState`, `logs --previous`, Events를 함께 봐야 합니다. 8강에서 memory limit을 넘겨 exit code 137과 `OOMKilled`를 직접 재현합니다.

## 스스로 해보기

init container의 명령을 다음처럼 바꾸면 앱 컨테이너가 시작될까요?

```yaml
command: ["sh", "-c", "echo preparing; exit 1"]
```

Pod의 `STATUS`, init container의 종료 코드, web 컨테이너의 시작 여부를 예상해보세요.

<details class="course-hint">
<summary>힌트와 정답</summary>

init container가 exit code 1로 실패하므로 kubelet은 init container를 다시 시도합니다. 화면에는 `Init:Error` 또는 `Init:CrashLoopBackOff`가 보일 수 있고, web 컨테이너는 시작되지 않습니다. 앱 컨테이너보다 먼저 성공해야 한다는 init container의 계약 때문입니다.

실제로 시험했다면 원래 `03-pod-lab.yaml`을 복구한 뒤 Pod를 다시 만듭니다.

```bash
kubectl --context kind-k8s-masterclass delete pod pod-lab -n k8s-labs --ignore-not-found
kubectl --context kind-k8s-masterclass apply -f 03-pod-lab.yaml -n k8s-labs
kubectl --context kind-k8s-masterclass wait pod/pod-lab -n k8s-labs --for=condition=Ready --timeout=90s
```

</details>

## 3문장 정리

1. Pod는 VM이나 컨테이너의 다른 이름이 아니라 함께 배치되고 수명을 공유하는 컨테이너 묶음입니다.
2. 같은 Pod의 컨테이너는 네트워크를 공유하지만, 파일은 같은 Volume을 마운트해야 공유합니다.
3. `ImagePullBackOff` 같은 화면 상태는 원인 자체가 아니므로 Events와 로그에서 앞선 실패를 찾아야 합니다.

## 다음 강의로 가져가는 상태

첫 번째 단순 Pod는 정리하고 init container 실습 Pod만 남깁니다.

```bash
kubectl --context kind-k8s-masterclass delete pod pod-basic broken-image -n k8s-labs --ignore-not-found
kubectl --context kind-k8s-masterclass get pod pod-lab -n k8s-labs
```

다음 상태를 남겨둡니다.

- `pod-lab`: `Running`, `READY 1/1`
- `reconcile-demo` Deployment: 기존 상태 유지
- `broken-image`, `pod-basic`: 삭제됨
- 로컬 파일: `03-pod-basic.yaml`, `03-pod-lab.yaml`, `03-broken-image.yaml`

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/02-kubectl/">← 이전: kubectl</a><a href="/kubernetes/04-workloads/">다음: Deployment와 Workload →</a></nav>

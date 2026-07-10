---
title: "03. Pod — 컨테이너를 실행하는 최소 단위"
summary: "Pod의 생명주기와 공유 범위를 이해하고 init container와 장애 상태를 직접 관찰합니다."
description: "Pod가 VM이 아닌 이유, 컨테이너 간 네트워크·볼륨 공유, 대표 상태와 종료 코드를 다룹니다."
weight: 30
categories: ["Kubernetes"]
tags: ["Pod", "Containers", "Troubleshooting"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 03 · 2.5H · Workload Basics</p>

Pod는 “컨테이너 한 개”가 아닙니다. **같은 Node에 함께 배치되고, 네트워크와 수명을 공유해야 하는 컨테이너의 최소 실행 단위**입니다. 이 문장을 놓치면 sidecar, probe, Service가 모두 흐려집니다.

## 이 강의를 마치면

- Pod 안에서 공유되는 것과 격리되는 것을 구분할 수 있습니다.
- init container가 앱 컨테이너보다 먼저 완료되는 흐름을 설명할 수 있습니다.
- `Pending`, `ImagePullBackOff`, `CrashLoopBackOff`, `Succeeded`의 의미를 구분합니다.
- `status.containerStatuses`와 Events에서 장애 원인을 찾을 수 있습니다.

## Pod 안에서 무엇을 공유하나

| 항목 | 같은 Pod의 컨테이너 |
|---|---|
| Node와 생명주기 | 함께 배치되고 함께 사라짐 |
| 네트워크 | 같은 IP, `localhost`로 통신 |
| 파일시스템 | 기본은 분리, Volume을 마운트할 때만 공유 |
| 프로세스 | 기본은 분리, 별도 설정 없이는 서로 보이지 않음 |

애플리케이션과 로그 수집기처럼 반드시 함께 움직여야 할 때만 여러 컨테이너를 한 Pod에 둡니다. 단지 서로 통신한다는 이유로 API와 DB를 한 Pod에 넣지는 않습니다.

## 실습 1 — init container가 페이지 준비하기

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

```bash
kubectl apply -f pod-lab.yaml
kubectl wait -n k8s-labs --for=condition=Ready \
  pod/pod-lab --timeout=90s
kubectl get pod pod-lab
kubectl describe pod pod-lab
kubectl port-forward pod/pod-lab 8080:80
```

다른 터미널에서 `curl http://localhost:8080`을 실행합니다. init container는 `Completed`, web 컨테이너는 `Running`이어야 합니다.

## YAML을 읽는 순서

1. `apiVersion`과 `kind`: 어떤 API 객체인가
2. `metadata`: 이름, Namespace, labels는 무엇인가
3. `spec.containers`: 무엇을 어떤 이미지로 실행하는가
4. `ports`, `env`, `volumeMounts`: 프로세스의 입력과 연결은 무엇인가
5. `status`와 Events: 실제로 무엇이 일어났는가

YAML의 들여쓰기를 외우기보다 이 다섯 질문으로 읽습니다.

## 일부러 망가뜨리기 — ImagePullBackOff

```bash
kubectl run broken-image \
  --image=nginx:not-a-real-version \
  --restart=Never \
  -n k8s-labs

kubectl get pod broken-image -n k8s-labs
kubectl describe pod broken-image -n k8s-labs
kubectl get events -n k8s-labs --sort-by=.lastTimestamp
```

`ImagePullBackOff`는 원인이 아니라 재시도 상태입니다. Events에서 registry 응답, 이미지 이름, 인증 실패 여부를 읽어야 합니다.

```bash
kubectl delete pod broken-image -n k8s-labs
```

## 종료 코드를 읽는 법

```bash
kubectl get pod pod-lab -n k8s-labs \
  -o jsonpath='{range .status.containerStatuses[*]}{.name}{" ready="}{.ready}{" restarts="}{.restartCount}{"\n"}{end}'
```

- exit code `0`: 프로세스가 정상 종료
- exit code `1`: 애플리케이션 일반 오류인 경우가 많음
- exit code `137`: SIGKILL, 메모리 제한 초과 가능성 확인
- exit code `143`: SIGTERM을 받고 종료한 경우가 많음

숫자만 보고 단정하지 말고 `lastState`, logs, Events와 함께 봅니다.

## 자주 하는 오해

- Pod 삭제 뒤 같은 이름이 생겨도 기존 Pod가 재시작한 것이 아닐 수 있습니다. UID를 확인하세요.
- Pod IP는 영구 주소가 아닙니다. 고정 접근은 Service가 담당합니다.
- `restartPolicy`가 장애 복구 전략 전체는 아닙니다. 복제와 롤아웃은 Deployment가 담당합니다.
- sidecar는 “아무 보조 컨테이너”가 아니라 앱과 배치·수명을 공유할 이유가 분명해야 합니다.

## 체크포인트

<div class="success-check">같은 Pod의 두 컨테이너가 `localhost`로 통신할 수 있지만 서로의 파일을 자동으로 볼 수 없는 이유를 설명하고, 필요한 Volume을 추가할 수 있으면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/02-kubectl/">← 이전: kubectl</a><a href="/kubernetes/04-workloads/">다음: Deployment와 Workload →</a></nav>

---
title: "02. kubectl로 클러스터를 읽는 법"
summary: "get, describe, logs, events, diff를 목적에 맞게 사용하고 context와 namespace 실수를 막습니다."
description: "kubectl을 단순 명령 모음이 아니라 증거 수집 도구로 익힙니다."
weight: 20
categories: ["Kubernetes"]
tags: ["kubectl", "Debugging", "YAML"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 02 · 2H · Tooling</p>

운영에서 가장 위험한 명령은 복잡한 명령이 아닙니다. **다른 클러스터나 Namespace에 정확히 실행된 단순한 명령**입니다. 이번 강의는 kubectl을 빠르게 치는 법보다, 안전하게 읽고 변경하는 순서를 다룹니다.

<div class="lesson-strip" aria-label="강의 구성"><span>Context</span><span>관찰 명령</span><span>선언형 변경</span><span>안전장치</span></div>

## 이 강의를 마치면

- 현재 context와 namespace를 확인하고 전환할 수 있습니다.
- `get`, `describe`, `logs`, `events`가 각각 답하는 질문을 구분할 수 있습니다.
- 명령형 입력으로 YAML 초안을 만든 뒤 선언형으로 관리할 수 있습니다.
- 변경 전 `diff`, 변경 후 `rollout status`로 검증하는 습관을 갖습니다.

## 명령이 아니라 질문부터 고르기

| 알고 싶은 것 | 먼저 쓸 명령 |
|---|---|
| 무엇이 존재하는가 | `kubectl get` |
| 왜 이 상태가 되었는가 | `kubectl describe` |
| 프로세스가 무슨 말을 했는가 | `kubectl logs` |
| 클러스터에서 최근 무슨 일이 있었는가 | `kubectl events` |
| 적용하면 무엇이 달라지는가 | `kubectl diff` |
| API 객체의 필드가 무엇인가 | `kubectl explain` |

`get` 출력만 보고 원인을 추측하지 마세요. 상태는 증상이고, Events와 로그가 증거입니다.

## 실습 1 — Context와 Namespace 고정

```bash
kubectl config get-contexts
kubectl config current-context
kubectl cluster-info

kubectl config set-context --current --namespace=k8s-labs
kubectl config view --minify -o jsonpath='{..namespace}{"\n"}'
```

프롬프트에 context와 namespace를 표시하는 도구를 쓰는 것도 좋습니다. 핵심은 `apply` 전에 항상 대상이 눈에 보여야 한다는 것입니다.

## 실습 2 — YAML 초안 만들기

```bash
kubectl run toolbox \
  --image=busybox:1.36 \
  --restart=Never \
  --dry-run=client -o yaml \
  --command -- sleep 3600 \
  > toolbox.yaml
```

`--dry-run=client -o yaml`은 학습과 초안 생성에 유용합니다. 생성한 YAML을 열어 다음만 남겼는지 확인하세요.

1. `apiVersion`, `kind`
2. `metadata.name`, 필요한 labels
3. `spec`

클라이언트가 자동으로 넣은 불필요한 필드나 일회성 메타데이터를 그대로 저장소에 올리지 않습니다.

```bash
kubectl apply -f toolbox.yaml
kubectl get pod toolbox -o wide
kubectl describe pod toolbox
kubectl exec -it toolbox -- sh
```

## 실습 3 — 변경 전후를 확인하기

`toolbox.yaml`의 command를 `sleep 7200`으로 바꿔봅니다. Pod의 대부분 필드는 생성 후 변경할 수 없으므로 `diff`가 먼저 알려주는 정보를 읽습니다.

```bash
kubectl diff -f toolbox.yaml
kubectl apply -f toolbox.yaml
```

`kubectl diff`의 종료 코드 `0`은 차이 없음, `1`은 차이 있음, `1`보다 큰 값은 실행 오류입니다. 자동화에서 무조건 `|| true`로 덮으면 인증·스키마 오류까지 숨기므로 구분해서 처리합니다.

Pod가 immutable field 오류를 내면 “kubectl이 이상하다”가 아니라 객체 선택이 잘못된 것입니다. 장기 실행 Pod는 직접 관리하지 않고 Deployment 같은 상위 workload로 관리합니다.

## 일부러 실수하기 — 잘못된 Namespace

```bash
kubectl get pod toolbox -n default
```

`NotFound`가 나왔다고 Pod가 없는 것은 아닙니다. 다음처럼 범위를 넓혀 확인합니다.

```bash
kubectl get pods -A --field-selector metadata.name=toolbox
kubectl get events -n k8s-labs --sort-by=.lastTimestamp
```

## 운영자가 지키는 변경 루프

```text
대상 확인 → 현재 상태 저장 → diff → apply → rollout 확인 → smoke test
```

Deployment라면 다음이 기본 세트입니다.

```bash
kubectl diff -f deployment.yaml
kubectl apply -f deployment.yaml
kubectl rollout status deployment/web --timeout=90s
kubectl get events --sort-by=.lastTimestamp
```

## 자주 하는 오해

- `kubectl apply`가 성공했다고 애플리케이션이 준비된 것은 아닙니다.
- YAML은 클러스터의 백업이 아닙니다. 데이터와 Secret, 외부 의존성은 별도 복구 전략이 필요합니다.
- `-A`는 편하지만 변경 명령에 Namespace를 생략하는 습관은 위험합니다.
- `exec`로 컨테이너 안을 고쳐도 재생성되면 사라집니다. 원본 이미지나 선언을 고쳐야 합니다.

## 체크포인트

<div class="success-check">`get` 결과가 `Pending`일 때 `describe`의 Events로 가설을 만들고, 그 가설을 검증할 다음 명령을 말할 수 있으면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/01-control-loop/">← 이전: 조정 루프</a><a href="/kubernetes/03-pod/">다음: Pod 제대로 이해하기 →</a></nav>

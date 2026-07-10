---
title: "01. 쿠버네티스는 왜 존재하는가 — 선언과 조정 루프"
summary: "desired state와 current state의 차이를 좁히는 조정 루프로 쿠버네티스 전체를 이해합니다."
description: "쿠버네티스의 선언형 모델, Control Plane, Node, 조정 루프를 첫 kind 클러스터에서 관찰합니다."
weight: 10
categories: ["Kubernetes"]
tags: ["Kubernetes", "kind", "Control Plane"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 01 · 2.5H · Mental Model</p>

쿠버네티스를 처음 배우면 Pod, Deployment, Service 같은 명사가 쏟아집니다. 명사를 외우기 전에 **쿠버네티스가 반복해서 하는 일 하나**를 먼저 잡아야 합니다.

> 원하는 상태를 선언하면, 컨트롤러가 현재 상태를 관찰하고 차이를 줄인다.

<div class="lesson-strip" aria-label="강의 구성"><span>개념 35분</span><span>실습 80분</span><span>장애 실습 25분</span><span>체크포인트 10분</span></div>

## 이 강의를 마치면

- `spec`과 `status`의 차이를 설명할 수 있습니다.
- API Server, Scheduler, Controller, kubelet의 역할을 구분할 수 있습니다.
- kind로 다중 노드 클러스터를 만들고 시스템 Pod를 관찰할 수 있습니다.
- Pod를 삭제해도 다시 생기는 이유를 “재시작”이 아닌 조정 루프로 설명할 수 있습니다.

## 먼저 감으로 이해하기

온도조절기를 생각해봅시다.

- 원하는 상태: 23도
- 현재 상태: 19도
- 관찰: 센서가 현재 온도를 읽음
- 행동: 보일러를 켬
- 반복: 23도에 가까워질 때까지 다시 확인

쿠버네티스도 같습니다. 사용자는 YAML로 원하는 상태를 API Server에 저장하고, 여러 컨트롤러가 그 상태에 맞게 Pod와 네트워크, 저장소를 계속 조정합니다. 한 번 실행하고 끝나는 배포 스크립트와 가장 다른 지점입니다.

## 클러스터의 네 역할

| 구성요소 | 질문 | 핵심 역할 |
|---|---|---|
| API Server | 무엇을 원하지? | 모든 요청과 상태의 관문 |
| Scheduler | 어디에 놓지? | 새 Pod가 실행될 Node 결정 |
| Controller | 부족하거나 넘치나? | 원하는 상태와 현재 상태의 차이 조정 |
| kubelet | 이 Node에서 어떻게 실행하지? | Pod 명세를 컨테이너 런타임에 반영 |

{{< alert "triangle-exclamation" >}}
Kubernetes에서 Docker 지원이 사라졌다는 말은 Docker 이미지가 안 된다는 뜻이 아닙니다. 제거된 것은 dockershim이며, Node는 containerd 같은 CRI 호환 런타임으로 OCI 이미지를 실행합니다.
{{< /alert >}}

## 실습 1 — 다중 노드 클러스터 만들기

다음 파일을 `kind-course.yaml`로 저장합니다.

```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

클러스터를 만들고 현재 연결 대상을 확인합니다.

```bash
kind create cluster \
  --name k8s-masterclass \
  --image kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5 \
  --config kind-course.yaml \
  --wait 5m

kubectl config current-context
kubectl get nodes -o wide
kubectl get pods -n kube-system
```

성공 기준은 Node 세 대가 모두 `Ready`이고, `kube-system`의 핵심 Pod가 `Running`인 것입니다.

## 실습 2 — 선언과 실제 상태 보기

```bash
kubectl create namespace k8s-labs
kubectl create deployment reconcile-demo \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  -n k8s-labs

kubectl rollout status deployment/reconcile-demo -n k8s-labs --timeout=2m
kubectl get deployment reconcile-demo -n k8s-labs -o yaml
```

출력에서 두 부분을 따로 읽습니다.

- `spec.replicas`: 사용자가 원하는 수
- `status.availableReplicas`: 지금 실제로 서비스 가능한 수

```bash
kubectl get deployment reconcile-demo -n k8s-labs \
  -o jsonpath='{.spec.replicas}{" desired / "}{.status.availableReplicas}{" available\n"}'
```

## 일부러 망가뜨리기 — Pod 삭제

{{< alert "triangle-exclamation" >}}
아래 명령은 학습 클러스터의 replica를 한 번에 삭제합니다. 실제 서비스에서는 영향 범위를 확인하고 Pod 하나만 선택해 실험하세요.
{{< /alert >}}

```bash
kubectl get pods -n k8s-labs -l app=reconcile-demo -o wide
kubectl delete pod -n k8s-labs -l app=reconcile-demo --wait=false
kubectl get pods -n k8s-labs -l app=reconcile-demo -w
```

새 Pod가 생깁니다. 삭제된 Pod가 살아난 것이 아닙니다. Deployment가 소유한 ReplicaSet이 “2개가 필요하지만 0개뿐”이라는 차이를 보고 **새 UID를 가진 Pod를 생성**한 것입니다.

확인해봅시다.

```bash
kubectl get pods -n k8s-labs -l app=reconcile-demo \
  -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,OWNER:.metadata.ownerReferences[0].kind
```

## 자주 하는 오해

- Pod는 작은 VM이 아닙니다. 함께 배치되고 수명을 공유하는 하나 이상의 컨테이너 묶음입니다.
- 쿠버네티스는 명령을 “한 번 실행”하는 시스템이 아니라 상태를 계속 조정하는 시스템입니다.
- Namespace는 정리와 권한 범위에 유용하지만 그 자체가 강한 보안 경계는 아닙니다.
- Control Plane이 애플리케이션 트래픽을 직접 처리한다고 생각하면 안 됩니다.

## 체크포인트

<div class="success-check">
<strong>설명할 수 있는가?</strong> spec과 status를 온도조절기 비유 없이 설명해보세요.<br>
<strong>만들 수 있는가?</strong> worker 두 대인 kind 클러스터를 다시 만들 수 있나요?<br>
<strong>고칠 수 있는가?</strong> Node가 NotReady일 때 가장 먼저 볼 명령 세 개를 고르세요.
</div>

<details class="course-hint">
<summary>체크포인트 힌트</summary>

`kubectl get nodes -o wide`, `kubectl describe node`, `kubectl get events -A --sort-by=.lastTimestamp`부터 증거를 모으세요.

</details>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/">← 전체 커리큘럼</a><a href="/kubernetes/02-kubectl/">다음: kubectl로 클러스터 읽기 →</a></nav>

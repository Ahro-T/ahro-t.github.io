---
title: "14. 운영과 장애 대응 — tiny-shop 캡스톤"
summary: "Events·logs·metrics로 장애를 복구하고 배포·보안·관측성을 하나의 운영 Runbook으로 완성합니다."
description: "증상에서 증거를 모아 가설을 검증하는 장애 대응 루프와 최종 프로젝트 평가 기준을 제공합니다."
weight: 140
categories: ["Kubernetes"]
tags: ["Troubleshooting", "Observability", "Capstone", "Runbook"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 14 · 5H · Operations & Capstone</p>

운영자는 YAML을 많이 외운 사람이 아닙니다. 증상과 원인을 분리하고, 영향 범위를 좁히고, 증거로 가설을 검증하고, 가장 작은 안전한 변경으로 복구하는 사람입니다.

## 이 강의를 마치면

- 증상 → 범위 → 증거 → 가설 → 검증 → 복구 순서로 대응할 수 있습니다.
- 대표적인 Pod·network·storage·RBAC 장애를 분류할 수 있습니다.
- metrics, logs, traces가 답하는 질문을 구분할 수 있습니다.
- tiny-shop을 배포하고 세 가지 장애를 복구한 Runbook을 제출할 수 있습니다.

## 장애 대응의 고정 루프

```text
1. 증상: 사용자가 무엇을 경험하는가
2. 범위: 어느 클러스터·Namespace·버전·요청 경로인가
3. 증거: status, Events, logs, metrics, traces
4. 가설: 증거를 설명하는 가장 작은 원인은 무엇인가
5. 검증: 한 번에 변수 하나를 확인
6. 복구: 영향이 가장 작은 되돌릴 수 있는 조치
7. 예방: 탐지·테스트·설계 중 어디를 보강할 것인가
```

바로 수정하지 않습니다. 첫 변경 전에 현재 상태와 시간을 기록합니다.

## 가장 먼저 쓰는 명령

```bash
kubectl get pod -n k8s-labs -o wide
kubectl get events -n k8s-labs --sort-by=.lastTimestamp
kubectl describe pod POD_NAME -n k8s-labs
kubectl logs POD_NAME -n k8s-labs --all-containers
kubectl logs POD_NAME -n k8s-labs --previous
kubectl top pod -n k8s-labs
kubectl get deployment,service,endpointslice,pvc -n k8s-labs
```

필요하면 실행 중인 이미지에 디버깅 도구를 설치하지 않고 ephemeral debug container를 사용합니다.

```bash
kubectl debug -it POD_NAME -n k8s-labs \
  --image=nicolaka/netshoot:v0.13 \
  --target=CONTAINER_NAME
```

운영 환경에서는 debug 권한과 이미지 출처를 통제합니다.

## 상태별 첫 증거

| 증상 | 먼저 볼 것 | 흔한 원인 |
|---|---|---|
| `Pending` | Scheduler Events, PVC | request 부족, taint, affinity, unbound PVC |
| `ImagePullBackOff` | Pod Events | 잘못된 image, registry 인증·네트워크 |
| `CrashLoopBackOff` | `logs --previous`, exit code | 프로세스 오류, 설정 누락, probe |
| `Running 0/1` | readiness, EndpointSlice | 준비 조건 실패 |
| `OOMKilled` | lastState, memory metrics | limit 부족, memory leak |
| Service timeout | selector, EndpointSlice, targetPort | endpoint 없음, port 오류, policy |
| `Forbidden` | 요청 주체, `auth can-i` | Role·Binding·ServiceAccount 오류 |
| PVC `Pending` | PVC Events, StorageClass | provisioner·access mode·용량 문제 |

## 관측성의 세 신호

- Metrics: 얼마나 많이, 얼마나 느리게, 얼마나 실패하는가
- Logs: 특정 시점에 애플리케이션이 무슨 사건을 기록했는가
- Traces: 한 요청이 여러 서비스에서 어디에 시간을 썼는가

세 가지를 따로 쌓는 것으로 끝내지 않습니다. 동일한 service·environment·version 식별자와 trace ID로 연결해야 합니다. 알림은 단순 CPU 수치보다 사용자 증상과 SLO 소진을 우선합니다.

## 캡스톤 — tiny-shop

[tiny-shop 시작 manifest 내려받기](/kubernetes-labs/tiny-shop-starter.yaml){.not-prose}

앞 강의의 patch, HPA, PDB, RBAC이 평가 결과에 섞이지 않도록 애플리케이션 Namespace를 초기화합니다. Envoy Gateway controller, `GatewayClass`, metrics-server처럼 클러스터 범위인 구성은 유지됩니다.

{{< alert "triangle-exclamation" >}}
다음 명령은 `k8s-labs`의 기존 PVC와 데이터를 포함한 모든 Namespace 리소스를 삭제합니다. 보존할 데이터가 있는 공유 클러스터에서는 실행하지 말고 별도 Namespace를 사용하세요.
{{< /alert >}}

```bash
kubectl delete namespace k8s-labs --ignore-not-found --wait=true

kubectl apply -f \
  https://ahro-t.github.io/kubernetes-labs/tiny-shop-starter.yaml
kubectl rollout status deployment/api -n k8s-labs
kubectl rollout status deployment/web -n k8s-labs
kubectl port-forward service/web -n k8s-labs 8080:80
```

이 터미널은 port-forward를 유지하고, 다른 터미널에서 호출합니다.

```bash
curl http://localhost:8080/api/
```

시작 manifest는 web → api 호출과 probe·resource request까지만 제공합니다. 아래 필수 구현을 한 항목씩 추가해 최종 운영형 구성으로 발전시킵니다.

```text
Client
  ↓ HTTPS
Gateway / Ingress
  ↓
web Service → web Deployment
                  ↓
              api Service → api Deployment
                                  ↓
                            data Service / PVC
```

### 필수 구현

- 모든 애플리케이션 리소스는 `k8s-labs` Namespace에 위치
- image는 `latest` 대신 고정 tag 또는 digest 사용
- web·api에 startup, readiness, liveness probe
- 현실적인 requests와 memory limits
- ConfigMap과 Secret 분리, Secret은 Git에 평문으로 저장하지 않음
- Service와 Gateway 또는 Ingress 라우팅
- api 최소 2 replicas, topology spread, PDB
- ServiceAccount와 최소 권한 RBAC
- non-root, no privilege escalation, dropped capabilities
- Helm Chart 또는 Kustomize overlay
- 설치·검증·장애 대응·정리 명령이 포함된 Runbook

### 의도적 장애 세 가지

아래에서 세 개를 뽑아 동료가 주입하고, 수강생이 원인을 모른 채 복구합니다.

1. Service selector 오타
2. 존재하지 않는 image tag
3. 잘못된 ConfigMap key
4. readiness path 오류
5. memory limit 축소로 OOMKilled
6. PVC 이름 불일치
7. RBAC verb 제거
8. topology 제약 충돌로 Pending

### 제출물

| 산출물 | 통과 기준 |
|---|---|
| 아키텍처 그림 | 요청·설정·데이터 경로가 구분됨 |
| 배포 소스 | 새 클러스터에 재현 가능 |
| 검증 스크립트 | rollout과 핵심 HTTP 경로를 자동 확인 |
| 장애 기록 | 증상·증거·가설·조치·예방이 포함됨 |
| Runbook | 다른 사람이 그대로 실행 가능 |

## 배포 파이프라인 최소 Gate

```yaml
name: validate-kubernetes
on:
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: azure/setup-helm@v4
        with:
          version: v4.2.3
      - name: Lint chart
        run: helm lint ./tiny-shop
      - name: Render chart
        run: helm template tiny-shop ./tiny-shop > rendered.yaml
      - name: Install kubeconform
        run: |
          curl -fsSL \
            https://github.com/yannh/kubeconform/releases/download/v0.8.0/kubeconform-linux-amd64.tar.gz \
            | tar -xz kubeconform
          sudo install kubeconform /usr/local/bin/kubeconform
      - name: Offline schema validation
        run: kubeconform -strict -summary -kubernetes-version 1.36.0 rendered.yaml
```

offline schema 검증은 admission과 실제 런타임을 검증하지 못합니다. 실제 저장소에서는 Actions와 다운로드 checksum을 고정하고, Kubernetes 1.36 ephemeral kind cluster에서 server-side dry run, apply, rollout, HTTP smoke test까지 수행합니다.

## 완주 평가

- 20%: 선언과 객체 관계 설명
- 30%: 재현 가능한 배포와 검증
- 30%: 장애 세 건의 증거 기반 복구
- 20%: 보안·가용성·운영 Runbook

<div class="success-check"><strong>최종 통과:</strong> 정상 상태를 만드는 것, 고장을 재현하는 것, 증거로 복구하는 것, 같은 사고가 반복되지 않도록 Runbook과 검증을 남기는 것까지 한 번에 시연합니다.</div>

## 실습 환경 정리

```bash
kubectl delete namespace k8s-labs --ignore-not-found
kind delete cluster --name k8s-masterclass
```

Gateway controller, CRD, metrics-server처럼 클러스터 범위로 설치한 add-on은 클러스터 삭제와 함께 정리됩니다. 공유 클러스터에서 실습했다면 각 설치 도구의 uninstall 절차를 따르세요.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/13-helm-kustomize/">← 이전: Helm과 Kustomize</a><a href="/kubernetes/">전체 커리큘럼으로 돌아가기 ↑</a></nav>

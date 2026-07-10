---
title: "13. Helm과 Kustomize — 환경별 배포를 패키징"
summary: "안전한 작업 폴더에서 Helm Chart를 직접 만들고 render·debug·install·upgrade한 뒤 Kustomize와 작게 비교합니다."
description: "파일 위치와 Namespace를 고정하고 Kubernetes 1.35 schema로 렌더링 결과를 검증하는 초보자 배포 실습입니다."
weight: 130
categories: ["Kubernetes"]
tags: ["Helm", "Kustomize", "GitOps", "CI/CD"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 13 · 4H · Delivery</p>

## 이번에 해결할 문제

Deployment와 Service YAML을 환경마다 복사하면 처음에는 빠릅니다. 시간이 지나면 어느 파일이 진짜인지, 어떤 값이 운영에 적용됐는지, 수정한 한 줄이 어떤 최종 YAML을 만들었는지 알기 어려워집니다.

이번 강의에서는 Helm을 주 실습으로 사용해 작은 패키지를 처음부터 만듭니다. Kustomize는 “같은 YAML에 작은 차이만 덧붙이는 방법”으로 짧게 비교하고, GitOps는 다음 단계에서 확장할 개념으로만 정리합니다.

## 시작 전 확인 — 작업 위치와 Namespace부터 고정합니다

WSL2에서는 Windows 경로보다 Linux 홈 디렉터리 아래에서 실습하는 편이 파일 권한과 성능 문제를 줄이기 쉽습니다. 아래 명령은 기존 디렉터리를 삭제하지 않습니다.

```bash
kubectl --context kind-k8s-masterclass cluster-info
kubectl --context kind-k8s-masterclass wait --for=condition=Ready node --all --timeout=120s

helm version --short
kubectl --context kind-k8s-masterclass version --client
kubeconform -v

kubectl --context kind-k8s-masterclass create namespace k8s-labs \
  --dry-run=client -o yaml | kubectl --context kind-k8s-masterclass apply -f -

mkdir -p "$HOME/k8s-course/lesson13"
cd "$HOME/k8s-course/lesson13"
pwd
```

예상 마지막 줄:

```text
/home/사용자이름/k8s-course/lesson13
```

`kubeconform`이 설치되지 않았다면 [공식 kubeconform Releases](https://github.com/yannh/kubeconform/releases)에서 운영체제와 CPU에 맞는 archive와 checksum을 확인해 설치하세요. 프로젝트 README의 installation 절차를 따르고 `kubeconform -v`가 성공한 뒤 계속합니다. 이 강의의 schema 검증 기준은 Kubernetes `1.35.0`입니다.

## 용어 다섯 개만 먼저 잡기

- **Chart**: Helm이 배포에 필요한 template, 기본값, metadata를 묶는 디렉터리
- **template**: Values와 Release 정보를 받아 Kubernetes YAML을 만드는 파일
- **Values**: 사용자가 바꿀 수 있도록 공개한 Chart의 입력값
- **Release**: 특정 Namespace에 Chart를 설치한 한 번의 관리 단위와 이력
- **render**: template과 Values를 계산해 API Server가 받을 최종 YAML로 만드는 과정

## 파일이 클러스터에 도착하는 길

```text
Chart + Values
      ↓ helm template
rendered.yaml
      ↓ kubeconform / 리뷰 / server dry-run
검증된 YAML
      ↓ helm upgrade --install
Release와 Kubernetes 객체
```

핵심 원칙은 **render before apply**입니다. template 자체가 그럴듯해 보여도 최종 YAML이 올바르다는 보장은 없습니다.

## 1단계 — 빈 Chart 구조를 안전하게 만듭니다

현재 위치를 다시 확인한 뒤 필요한 디렉터리만 만듭니다.

```bash
cd "$HOME/k8s-course/lesson13"
mkdir -p tiny-shop/templates
find tiny-shop -maxdepth 2 -print
```

다음 구조가 출발점입니다.

```text
tiny-shop/
└── templates/
```

자동 생성 파일을 한꺼번에 지우는 명령은 사용하지 않습니다. 우리가 이해하고 유지할 파일 네 개만 직접 만듭니다.

## 2단계 — Chart.yaml과 values.yaml 만들기

`tiny-shop/Chart.yaml` 파일을 만듭니다.

```yaml
apiVersion: v2
name: tiny-shop
description: Minimal web service for the Kubernetes course
type: application
version: 0.1.0
appVersion: "1.27"
```

`tiny-shop/values.yaml` 파일을 만듭니다.

```yaml
replicaCount: 2

image:
  repository: nginx
  tag: 1.27-alpine
  pullPolicy: IfNotPresent

service:
  port: 80

resources:
  requests:
    cpu: 100m
    memory: 64Mi
  limits:
    memory: 128Mi
```

Values는 “사용자가 바꿀 수 있는 모든 필드”가 아닙니다. Chart 사용자가 실제로 선택해야 하는 계약만 공개합니다.

## 3단계 — Deployment template 만들기

`tiny-shop/templates/deployment.yaml` 파일을 만듭니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: tiny-shop
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: tiny-shop
        app.kubernetes.io/instance: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ required "image.repository is required" .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: http
            periodSeconds: 3
          resources:
{{ toYaml .Values.resources | nindent 12 }}
```

`required`는 꼭 필요한 입력이 비었을 때 조용히 잘못된 YAML을 만드는 대신 render 단계에서 멈추게 합니다. `nindent 12`는 resources 아래 YAML을 새 줄에서 12칸 들여씁니다.

## 4단계 — Service template 만들기

`tiny-shop/templates/service.yaml` 파일을 만듭니다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: tiny-shop
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  selector:
    app.kubernetes.io/instance: {{ .Release.Name }}
  ports:
    - name: http
      port: {{ .Values.service.port }}
      targetPort: http
```

Deployment와 Service가 같은 `app.kubernetes.io/instance` 값을 쓰므로 Service가 이 Release의 Pod만 선택합니다.

현재 파일 위치를 확인합니다.

```bash
find tiny-shop -maxdepth 2 -type f | sort
```

예상 결과:

```text
tiny-shop/Chart.yaml
tiny-shop/templates/deployment.yaml
tiny-shop/templates/service.yaml
tiny-shop/values.yaml
```

## 5단계 — API Server보다 먼저 render하고 검증합니다

```bash
helm lint ./tiny-shop

helm template tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --values ./tiny-shop/values.yaml \
  --debug > rendered.yaml

sed -n '1,220p' rendered.yaml
```

`helm lint`의 예상 마지막 줄은 `0 chart(s) failed`입니다. `rendered.yaml`에는 Go template 문법이 남아 있으면 안 되고, 모든 객체의 Namespace는 `k8s-labs`여야 합니다.

Kubernetes 1.35 schema로 offline 검증합니다.

```bash
kubeconform \
  -strict \
  -summary \
  -kubernetes-version 1.35.0 \
  rendered.yaml
```

예상 요약:

```text
Summary: 2 resources found ... Invalid: 0, Errors: 0
```

offline schema 검증은 admission이나 실제 이미지 실행까지 보장하지 않습니다. 이어서 server-side dry run을 사용합니다.

```bash
kubectl --context kind-k8s-masterclass apply --dry-run=server -f rendered.yaml
```

**왜 여러 검증을 하나요?** Helm은 template 계산을, kubeconform은 schema 구조를, API Server는 현재 클러스터의 admission과 API 지원을 각각 확인합니다. 한 도구가 다른 도구를 완전히 대체하지 않습니다.

## 6단계 — 값 하나를 비워 template 실패를 읽습니다

파일을 수정하지 않고 `image.repository` 한 값만 빈 문자열로 덮어씁니다.

```bash
if helm template tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --set-string image.repository='' \
  --debug; then
  printf '예상과 다름: required가 빈 repository를 허용했습니다.\n' >&2
else
  printf '예상한 실패: 필수 Values가 render 단계에서 차단되었습니다.\n'
fi
```

예상 오류에는 다음 문구가 포함됩니다.

```text
execution error ... image.repository is required
```

증거는 template 파일 이름과 실패한 표현식입니다. YAML 들여쓰기를 무작정 바꾸지 말고 오류가 지목한 Values 경로를 확인합니다.

### 반드시 복구

빈 override를 제거하고 정상 명령을 다시 실행합니다.

```bash
helm template tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --values ./tiny-shop/values.yaml \
  > rendered.yaml

kubeconform -strict -summary \
  -kubernetes-version 1.35.0 rendered.yaml
```

Invalid와 Errors가 모두 0이어야 다음 단계로 갑니다.

<details class="course-hint"><summary>template 오류 위치가 모호하다면</summary><p><code>helm template ... --debug --show-only templates/deployment.yaml</code>로 Deployment 하나만 렌더링하세요. Values가 실제로 어떻게 합쳐졌는지는 <code>helm get values</code>가 아니라 설치 전이므로 <code>helm template</code> 명령의 입력 파일과 <code>--set</code> 값을 확인해야 합니다.</p></details>

## 7단계 — Namespace를 고정해 설치하고 기다립니다

먼저 차이를 봅니다. `kubectl diff` 종료 코드 1은 “차이가 있음”이며 오류가 아닙니다.

```bash
kubectl --context kind-k8s-masterclass diff -f rendered.yaml
DIFF_RESULT=$?

if [ "$DIFF_RESULT" -eq 0 ]; then
  printf '현재 클러스터와 차이가 없습니다.\n'
elif [ "$DIFF_RESULT" -eq 1 ]; then
  printf '설치할 변경이 있습니다. diff를 검토하세요.\n'
else
  printf 'diff 실행 오류입니다. 설치하지 마세요. code=%s\n' "$DIFF_RESULT" >&2
fi
```

의도한 두 객체만 보이면 설치합니다.

```bash
helm upgrade --install tiny-shop ./tiny-shop \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs \
  --wait \
  --rollback-on-failure \
  --timeout 5m

kubectl --context kind-k8s-masterclass rollout status deployment/tiny-shop \
  -n k8s-labs --timeout=120s
helm status tiny-shop \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs
```

예상 상태는 Release `deployed`, Deployment `successfully rolled out`입니다.

실제 HTTP 응답을 확인합니다.

```bash
kubectl --context kind-k8s-masterclass port-forward service/tiny-shop \
  -n k8s-labs 8080:80
```

다른 터미널에서 실행합니다.

```bash
curl -fsS http://localhost:8080/ | head
```

nginx HTML이 보이면 성공입니다. 확인 뒤 첫 터미널에서 `Ctrl-C`로 port-forward만 종료합니다.

## 8단계 — replica 값 하나를 변경하고 Release 이력을 봅니다

```bash
helm upgrade tiny-shop ./tiny-shop \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs \
  --set replicaCount=3 \
  --wait \
  --rollback-on-failure \
  --timeout 5m

kubectl --context kind-k8s-masterclass rollout status deployment/tiny-shop \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get deployment tiny-shop -n k8s-labs
helm history tiny-shop \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs
```

Deployment의 READY는 `3/3`, Helm history에는 revision 2가 보여야 합니다. 명령줄 `--set`은 재현하기 어려우므로 운영에서는 환경별 values 파일에 기록하는 편이 낫습니다.

revision 1로 되돌리고 상태를 확인합니다.

```bash
helm rollback tiny-shop 1 \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs \
  --wait \
  --timeout 5m

kubectl --context kind-k8s-masterclass rollout status deployment/tiny-shop \
  -n k8s-labs --timeout=120s
kubectl --context kind-k8s-masterclass get deployment tiny-shop -n k8s-labs
```

READY `2/2`가 복구 기준입니다.

## 작은 비교 — Kustomize는 기존 YAML에 차이를 겹칩니다

Helm 실습과 이름이 충돌하지 않도록 별도 `kustom-demo`를 사용합니다.

```bash
cd "$HOME/k8s-course/lesson13"
mkdir -p kustom-demo/base kustom-demo/overlays/prod
```

`kustom-demo/base/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kustom-demo
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kustom-demo
  template:
    metadata:
      labels:
        app: kustom-demo
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
```

`kustom-demo/base/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: k8s-labs
resources:
  - deployment.yaml
```

`kustom-demo/overlays/prod/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
replicas:
  - name: kustom-demo
    count: 3
```

```bash
kubectl --context kind-k8s-masterclass kustomize kustom-demo/base > kustom-base.yaml
kubectl --context kind-k8s-masterclass kustomize kustom-demo/overlays/prod > kustom-prod.yaml

grep -n 'replicas:' kustom-base.yaml kustom-prod.yaml
kubeconform -strict -summary \
  -kubernetes-version 1.35.0 kustom-prod.yaml

kubectl --context kind-k8s-masterclass apply -k kustom-demo/overlays/prod
kubectl --context kind-k8s-masterclass rollout status deployment/kustom-demo \
  -n k8s-labs --timeout=120s
```

base는 replica 1, prod overlay는 replica 3입니다. Kustomize는 template 표현식을 계산하기보다 완전한 Kubernetes YAML에 명시적인 변형을 겹칩니다.

## 확장 개념 — GitOps는 이 결과를 계속 비교합니다

이번 강의에서는 GitOps controller를 설치하지 않습니다. Helm이나 Kustomize는 YAML을 만드는 도구이고, GitOps controller는 Git의 원하는 상태와 클러스터의 실제 상태를 반복해서 비교하는 별도 시스템입니다.

```text
소스 변경 → 테스트·이미지 build → manifest 또는 values PR
→ 리뷰·merge → GitOps controller가 render·sync
→ rollout·smoke test → 차이가 생기면 drift 표시 또는 복구
```

GitOps를 도입해도 잘못된 선언을 빠르게 배포할 수 있습니다. 승인, schema 정책, Secret 관리, rollback 기준은 여전히 필요합니다.

## 연습 — staging values 만들기

`tiny-shop/values-staging.yaml`을 만들어 replica 1, memory limit 96Mi만 덮어쓰세요. 기본 values와 함께 렌더링하고 Kubernetes 1.35 schema 검증을 통과시킵니다.

<details class="course-hint"><summary>힌트</summary><p>환경 파일에는 바뀌는 값만 적어도 됩니다. <code>helm template ... -f values.yaml -f values-staging.yaml</code>처럼 뒤 파일이 앞 파일을 덮어씁니다.</p></details>

<details class="course-hint"><summary>정답</summary><p><code>replicaCount: 1</code>과 <code>resources.limits.memory: 96Mi</code>만 작성합니다. 다만 map 병합 결과에 기존 CPU·memory request가 남는지 렌더링 결과에서 확인하세요. 최종 검증 명령은 <code>kubeconform -strict -summary -kubernetes-version 1.35.0 rendered-staging.yaml</code>입니다.</p></details>

## 실습 환경 정리

```bash
helm uninstall tiny-shop \
  --kube-context kind-k8s-masterclass \
  --namespace k8s-labs \
  --wait
kubectl --context kind-k8s-masterclass delete -k kustom-demo/overlays/prod --ignore-not-found --wait=true

kubectl --context kind-k8s-masterclass get deployment,service -n k8s-labs \
  -l 'app.kubernetes.io/instance=tiny-shop'
kubectl --context kind-k8s-masterclass get deployment kustom-demo -n k8s-labs 2>/dev/null || :
```

첫 조회는 `No resources found`, 두 번째 조회는 `NotFound`가 정상 정리 상태입니다. 작업 디렉터리는 14강에서 재사용할 수 있으므로 유지합니다.

## 세 문장 정리

Helm Chart는 template과 Values를 계산해 Release로 설치하며, 적용 전 최종 YAML을 반드시 렌더링해야 합니다. Kustomize는 완전한 base YAML에 환경별 작은 변형을 겹치는 도구라서 단순한 차이를 명시적으로 보여주기 좋습니다. GitOps는 두 도구의 대체물이 아니라 Git과 클러스터의 차이를 계속 조정하는 확장 운영 방식입니다.

## 다음 강의로 가져갈 상태

- `tiny-shop` Helm Release와 `kustom-demo` Deployment가 없어야 합니다.
- `$HOME/k8s-course/lesson13`의 소스와 렌더링 파일은 남겨도 됩니다.
- `k8s-labs` Namespace, Metrics Server, 클러스터는 유지합니다.
- 다음 강의에서는 다운로드한 starter를 별도 `lesson14` 폴더에서 사용합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/12-scaling-resilience/">← 이전: 확장성과 고가용성</a><a href="/kubernetes/14-operations-capstone/">다음: 운영과 캡스톤 →</a></nav>

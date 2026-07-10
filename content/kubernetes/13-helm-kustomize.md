---
title: "13. Helm과 Kustomize — 환경별 배포를 패키징"
summary: "render-before-apply 원칙으로 Helm Chart와 Kustomize overlay를 검증하고 환경별 차이를 관리합니다."
description: "Helm 4, Kustomize, immutable image, GitOps의 역할을 하나의 배포 흐름으로 연결합니다."
weight: 130
categories: ["Kubernetes"]
tags: ["Helm", "Kustomize", "GitOps", "CI/CD"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 13 · 3.5H · Delivery</p>

manifest가 열 개를 넘어가면 복사·붙여넣기가 시작되고, 환경별 파일이 조금씩 갈라집니다. Helm과 Kustomize는 같은 문제를 다르게 풉니다. 도구 선택보다 중요한 원칙은 **렌더링 결과를 먼저 보고 적용하는 것**입니다.

## 이 강의를 마치면

- Helm Chart, Values, Release의 관계를 설명할 수 있습니다.
- `helm lint`와 `helm template`로 API Server 전에 오류를 찾을 수 있습니다.
- Kustomize base와 overlay로 환경별 차이를 표현할 수 있습니다.
- GitOps의 desired state와 drift reconciliation을 쿠버네티스 조정 루프와 연결할 수 있습니다.

## Helm과 Kustomize 선택

| 상황 | 우선 검토 |
|---|---|
| 여러 팀에 배포할 재사용 패키지 | Helm |
| 같은 manifest의 작은 환경별 patch | Kustomize |
| 외부 애플리케이션 설치 | 공급자가 유지하는 Helm Chart |
| 템플릿 로직 없이 명시적 YAML 유지 | Kustomize |

둘을 함께 써도 됩니다. 다만 Helm 안에 Kustomize, Kustomize 안에 Helm을 무한히 중첩해 렌더링 경로를 불투명하게 만들지 않습니다.

## 실습 1 — Helm Chart 만들기

```bash
helm create tiny-shop
rm -rf tiny-shop/templates/*
find tiny-shop -maxdepth 2 -type f | sort
```

핵심 파일은 다음과 같습니다.

```text
tiny-shop/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── deployment.yaml
    └── service.yaml
```

`Chart.yaml`과 `values.yaml`을 최소 계약으로 바꿉니다.

```yaml
# Chart.yaml
apiVersion: v2
name: tiny-shop
description: Minimal course web service
type: application
version: 0.1.0
appVersion: "1.27"
```

```yaml
# values.yaml
replicaCount: 2

image:
  repository: nginx
  tag: 1.27-alpine
  pullPolicy: IfNotPresent

resources:
  requests:
    cpu: 100m
    memory: 64Mi
  limits:
    memory: 128Mi
```

다음 두 template은 위 values만 참조하는 완전한 최소 예제입니다.

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 80
          readinessProbe:
            httpGet: { path: /, port: http }
          resources:
{{ toYaml .Values.resources | indent 12 }}
```

```yaml
# templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app.kubernetes.io/name: {{ .Release.Name }}
  ports:
    - name: http
      port: 80
      targetPort: http
```

학습 예제는 pull 가능한 고정 tag를 사용합니다. 운영 승격에서는 검증된 image digest를 values 계약에 추가하고 tag 대신 `repository@sha256:...` 형태로 렌더링합니다.

## Render before apply

```bash
helm lint ./tiny-shop
helm template tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --values ./tiny-shop/values.yaml > rendered.yaml

kubectl apply --dry-run=server -f rendered.yaml
kubectl diff -f rendered.yaml
```

차이가 의도한 것인지 리뷰한 뒤 설치합니다.

```bash
helm upgrade --install tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --create-namespace \
  --wait=watcher \
  --rollback-on-failure \
  --timeout 5m

helm upgrade tiny-shop ./tiny-shop \
  --namespace k8s-labs \
  --set replicaCount=3 \
  --wait=watcher

helm history tiny-shop -n k8s-labs
helm rollback tiny-shop 1 -n k8s-labs --wait
```

Helm 4는 Chart 호환성을 유지하지만 CLI·플러그인 등 일부 변경이 있습니다. 팀 표준 버전과 Kubernetes 호환 범위를 명시하고, Helm 3 명령을 그대로 복사할 때는 공식 migration 문서를 확인합니다.

## 실습 2 — Kustomize Overlay

```text
deploy/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/kustomization.yaml
    └── prod/kustomization.yaml
```

base의 세 파일을 먼저 만듭니다.

```yaml
# deploy/base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: k8s-labs
resources:
  - deployment.yaml
  - service.yaml
```

```yaml
# deploy/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
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
          resources:
            requests:
              cpu: 100m
              memory: 64Mi
```

```yaml
# deploy/base/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: http
```

```yaml
# deploy/overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
replicas:
  - name: web
    count: 4
patches:
  - target:
      kind: Deployment
      name: web
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: web
      spec:
        template:
          spec:
            containers:
              - name: web
                resources:
                  requests:
                    cpu: 250m
```

```bash
kubectl kustomize deploy/overlays/prod > rendered-prod.yaml
kubectl diff -k deploy/overlays/prod
kubectl apply -k deploy/overlays/prod
```

## GitOps로 연결하기

GitOps controller는 Git의 선언과 클러스터 상태 차이를 계속 감지합니다.

```text
코드 commit → 이미지 build·scan → digest 기록 → manifest PR → merge
→ GitOps controller sync → rollout 관찰 → smoke test
```

중요한 점은 CI가 클러스터에 장기 관리자 키를 들고 직접 `kubectl apply`하는 구조를 피하는 것입니다. 가능하면 workload identity와 짧은 수명의 자격증명을 사용하고, 배포 이력은 Git과 controller status에 남깁니다.

## 자주 하는 오해

- Helm은 운영자(operator)가 아닙니다. 설치 후 지속적으로 상태를 조정하는 controller와 다릅니다.
- values가 많을수록 재사용성이 높은 것이 아닙니다. 공개할 계약만 values로 둡니다.
- `helm upgrade` 성공이 readiness·smoke test 성공을 뜻하지 않습니다.
- GitOps가 자동이면 안전한 것이 아닙니다. 승인, 정책, progressive delivery가 필요합니다.
- 동일 tag를 덮어쓰지 말고 immutable digest로 승격합니다.

## 체크포인트

<div class="success-check">Chart를 lint하고 렌더링 결과를 server-side dry run한 뒤 설치하며, 의도하지 않은 drift를 Git 기준 상태로 복구하는 흐름을 설명하면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/12-scaling-resilience/">← 이전: 확장성과 고가용성</a><a href="/kubernetes/14-operations-capstone/">다음: 운영과 캡스톤 →</a></nav>

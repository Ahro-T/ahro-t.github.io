---
title: "11. 보안 — Pod에 필요한 권한만 주기"
summary: "ServiceAccount·RBAC·SecurityContext·Pod Security·NetworkPolicy를 최소 권한 원칙으로 연결합니다."
description: "API 권한과 Linux 실행 권한, 네트워크 경계를 분리해 방어 계층을 만듭니다."
weight: 110
categories: ["Kubernetes"]
tags: ["RBAC", "Pod Security", "NetworkPolicy", "Security"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 11 · 3.5H · Security</p>

쿠버네티스 보안은 “Secret을 쓴다”로 끝나지 않습니다. 누가 API를 호출할 수 있는지, 컨테이너가 Node에서 무엇을 할 수 있는지, Pod 사이에 어떤 트래픽을 허용할지를 각각 제한해야 합니다.

## 이 강의를 마치면

- ServiceAccount와 사람 계정의 차이를 설명할 수 있습니다.
- Role·RoleBinding을 만들고 `kubectl auth can-i`로 검증할 수 있습니다.
- non-root, read-only root filesystem, dropped capabilities를 적용할 수 있습니다.
- Pod Security Admission과 NetworkPolicy의 전제를 설명할 수 있습니다.

## 세 개의 경계

| 경계 | 대표 제어 |
|---|---|
| Kubernetes API | 인증, ServiceAccount, RBAC |
| 컨테이너·Node | SecurityContext, seccomp, Pod Security |
| Pod 간 네트워크 | NetworkPolicy와 지원 CNI |

## 실습 1 — 읽기 전용 ServiceAccount

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader
  namespace: k8s-labs
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: k8s-labs
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader
  namespace: k8s-labs
subjects:
  - kind: ServiceAccount
    name: pod-reader
    namespace: k8s-labs
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-reader
```

```bash
kubectl apply -f rbac.yaml

kubectl auth can-i list pods \
  --as=system:serviceaccount:k8s-labs:pod-reader \
  -n k8s-labs

kubectl auth can-i delete pods \
  --as=system:serviceaccount:k8s-labs:pod-reader \
  -n k8s-labs
```

예상 결과는 `yes`, `no`입니다. 권한은 manifest를 읽고 끝내지 않고 실제 질문으로 검증합니다.

## 실습 2 — 안전한 SecurityContext

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: restricted-web
  namespace: k8s-labs
spec:
  automountServiceAccountToken: false
  securityContext:
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: web
      image: nginxinc/nginx-unprivileged:1.27-alpine
      ports:
        - containerPort: 8080
      securityContext:
        allowPrivilegeEscalation: false
        runAsNonRoot: true
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      volumeMounts:
        - name: cache
          mountPath: /var/cache/nginx
        - name: run
          mountPath: /var/run
        - name: tmp
          mountPath: /tmp
  volumes:
    - name: cache
      emptyDir: {}
    - name: run
      emptyDir: {}
    - name: tmp
      emptyDir: {}
```

```bash
kubectl apply -f restricted-web.yaml
kubectl get pod restricted-web -n k8s-labs
kubectl exec -n k8s-labs restricted-web -- id
```

이미지가 non-root 실행을 지원하지 않으면 `runAsNonRoot: true`만 추가해서 해결되지 않습니다. 이미지 설계부터 바꿔야 합니다.

## 실습 3 — Pod Security Admission

격리된 실습 Namespace를 만듭니다.

```bash
kubectl create namespace secure-lab
kubectl label namespace secure-lab \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=v1.36 \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/audit-version=v1.36 \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/warn-version=v1.36

kubectl run root-shell -n secure-lab --image=busybox:1.36 -- sleep 3600
```

기본 Pod는 restricted 정책 요구사항을 충족하지 못해 거부되어야 합니다. 실습 후 `kubectl delete namespace secure-lab`로 정리합니다.

## 확장 실습 — NetworkPolicy의 중요한 전제

기본 Kubernetes 네트워크는 allow입니다. NetworkPolicy 객체를 만들어도 CNI가 이를 구현하지 않으면 트래픽은 차단되지 않습니다. 이 실습은 policy 지원 CNI로 별도 구성한 클러스터에서 진행합니다. 객체를 apply한 사실이 아니라, 적용 전 성공 → deny 뒤 timeout → allow rule 뒤 성공을 모두 요청으로 검증해야 합니다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: k8s-labs
spec:
  podSelector: {}
  policyTypes: ["Ingress"]
```

운영에서는 deny-all을 시작점으로 두고 DNS, Gateway, 호출 서비스 등 필요한 경로만 허용합니다.

## 자주 하는 오해

- Secret을 쓴다고 안전한 것은 아닙니다. RBAC와 저장 시 암호화가 필요합니다.
- Namespace는 멀티테넌트 보안 경계를 자동으로 만들지 않습니다.
- `cluster-admin`을 편의상 서비스 계정에 주면 안 됩니다.
- PodSecurityPolicy는 제거되었습니다. Pod Security Admission 또는 정책 엔진을 사용합니다.
- 이미지 취약점 스캔은 실행 권한 최소화를 대체하지 않습니다.

## 체크포인트

<div class="success-check">pod-reader가 list는 가능하지만 delete는 불가능함을 증명하고, restricted 정책을 통과하는 Pod와 거부되는 Pod의 차이를 설명하면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/10-scheduling/">← 이전: 스케줄링</a><a href="/kubernetes/12-scaling-resilience/">다음: 확장성과 고가용성 →</a></nav>

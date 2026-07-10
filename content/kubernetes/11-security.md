---
title: "11. 보안 — Pod에 필요한 권한만 주기"
summary: "실제 ServiceAccount 토큰 요청, RBAC 거부, Pod Security Admission 통과를 한 단계씩 검증합니다."
description: "API 권한, admission, 컨테이너 실행 권한, 네트워크 정책의 경계를 섞지 않고 최소 권한으로 실습합니다."
weight: 110
categories: ["Kubernetes"]
tags: ["RBAC", "Pod Security", "NetworkPolicy", "Security"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 11 · 3.5H · Security</p>

## 이번에 해결할 문제

Pod 안의 프로그램이 Kubernetes API에서 Pod 목록을 읽고 싶어 합니다. 편하다는 이유로 `cluster-admin`을 주면 읽기뿐 아니라 삭제, Secret 조회, 다른 Namespace 변경까지 가능해질 수 있습니다.

이번 강의의 목표는 “보안 설정을 많이 넣기”가 아닙니다. 아래 세 질문에 각각 다른 증거로 답하는 것입니다.

1. 이 Pod는 **누구의 이름으로** API를 호출할까요?
2. 그 주체는 **어떤 동작까지** 허용받았을까요?
3. API 권한과 별개로, 이 Pod 자체는 **안전한 실행 조건**을 만족할까요?

## 시작 전 확인 — 앞 강의 리소스 없이 시작합니다

```bash
kubectl --context kind-k8s-masterclass cluster-info
kubectl --context kind-k8s-masterclass version
kubectl --context kind-k8s-masterclass wait --for=condition=Ready node --all --timeout=120s

kubectl --context kind-k8s-masterclass create namespace k8s-labs \
  --dry-run=client -o yaml | kubectl --context kind-k8s-masterclass apply -f -
```

이 강의의 Pod Security 버전은 Kubernetes `v1.35`를 기준으로 고정합니다. 서버가 1.35보다 오래되었다면 실습 클러스터를 먼저 맞추세요. Bash, macOS Zsh 또는 WSL2 Bash에서 실행하며, 명령이 timeout되면 같은 명령을 무한 반복하지 말고 Events를 확인합니다.

## 용어 다섯 개만 먼저 잡기

- **ServiceAccount**: 사람 대신 Pod의 프로그램이 Kubernetes API에서 사용하는 신원
- **Role**: 한 Namespace 안에서 허용할 리소스와 동작을 적은 권한 묶음
- **RoleBinding**: Role을 ServiceAccount 같은 주체에게 연결하는 객체
- **Admission**: 인증과 권한 검사가 끝난 요청을 저장하기 전에 정책으로 허용하거나 거부하는 단계
- **SecurityContext**: 컨테이너의 사용자, 권한 상승, Linux capability, seccomp 등을 제한하는 설정

NetworkPolicy는 뒤의 분리된 확장 절에서 다룹니다. RBAC과 NetworkPolicy는 이름이 비슷한 “보안 기능”이지만, 하나는 API 요청을 제어하고 다른 하나는 Pod 간 네트워크 흐름을 제어합니다.

## 실제 요청이 통과하는 길

```text
Pod의 프로세스
  ↓ ServiceAccount 토큰
API Server 인증: 누구인가?
  ↓
RBAC 인가: 이 동작을 해도 되는가?
  ↓
Admission: 정책을 만족하는 객체인가?
  ↓
etcd에 저장되고 controller가 실행 상태를 만듦
```

`kubectl auth can-i`는 RBAC 질문에 빠르게 답합니다. 하지만 이번에는 거기서 멈추지 않고, Pod 안의 실제 토큰으로 API Server에 HTTP 요청도 보냅니다.

## 1단계 — 읽기 전용 ServiceAccount 만들기

`rbac-lab.yaml` 파일을 만듭니다.

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
---
apiVersion: v1
kind: Pod
metadata:
  name: sa-client
  namespace: k8s-labs
spec:
  serviceAccountName: pod-reader
  containers:
    - name: client
      image: curlimages/curl:8.12.1
      command: ["sh", "-c", "sleep 86400"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
  securityContext:
    runAsNonRoot: true
    runAsUser: 100
    runAsGroup: 101
    seccompProfile:
      type: RuntimeDefault
  restartPolicy: Never
```

```bash
kubectl --context kind-k8s-masterclass apply -f rbac-lab.yaml
kubectl --context kind-k8s-masterclass wait -n k8s-labs \
  --for=condition=Ready pod/sa-client --timeout=90s

kubectl --context kind-k8s-masterclass get serviceaccount,role,rolebinding -n k8s-labs
kubectl --context kind-k8s-masterclass get pod sa-client -n k8s-labs \
  -o jsonpath='{.spec.serviceAccountName}{"\n"}'
```

예상 결과의 마지막 줄은 `pod-reader`입니다. Pod YAML에 Role 이름을 직접 적지 않았다는 점을 보세요. `serviceAccountName`으로 신원을 정하고, RoleBinding이 그 신원과 Role을 연결합니다.

먼저 빠른 사전 질문을 합니다.

```bash
kubectl --context kind-k8s-masterclass auth can-i list pods \
  --as=system:serviceaccount:k8s-labs:pod-reader \
  -n k8s-labs

kubectl --context kind-k8s-masterclass auth can-i delete pods \
  --as=system:serviceaccount:k8s-labs:pod-reader \
  -n k8s-labs
```

예상 결과:

```text
yes
no
```

## 2단계 — Pod 안의 토큰으로 실제 API를 호출합니다

Pod에는 ServiceAccount 토큰, Namespace, API Server 인증서를 담은 projected volume이 기본으로 연결됩니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- \
  sh -c 'ls -1 /var/run/secrets/kubernetes.io/serviceaccount'
```

예상 파일은 `ca.crt`, `namespace`, `token`입니다. 토큰 내용을 화면에 출력하거나 문서에 복사하지 마세요.

다음 요청은 Pod 목록을 읽고 HTTP 상태 코드만 출력합니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  curl -sS --cacert "$CA" \
    -H "Authorization: Bearer $TOKEN" \
    -o /tmp/list-response.json -w "%{http_code}\n" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NS/pods"
'
```

예상 결과는 `200`입니다. 이어서 응답의 앞부분만 확인합니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- \
  sh -c 'head -c 180 /tmp/list-response.json; printf "\n"'
```

응답에는 JSON의 `kind: PodList`와 `items`가 보여야 합니다.

이번에는 같은 토큰으로 `sa-client` Pod 삭제를 요청합니다. Role에 `delete`가 없으므로 **Pod는 삭제되지 않고** HTTP `403`이 나와야 합니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  curl -sS --cacert "$CA" \
    -H "Authorization: Bearer $TOKEN" \
    -X DELETE -o /tmp/delete-response.json -w "%{http_code}\n" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NS/pods/sa-client"
'

kubectl --context kind-k8s-masterclass get pod sa-client -n k8s-labs
```

예상 결과는 `403`과 여전히 `Running`인 `sa-client`입니다. 이것이 최소 권한을 실제 요청으로 증명한 결과입니다.

## 3단계 — 권한 하나를 빼서 실패시키고 복구합니다

`rbac-lab.yaml`의 Role에서 `list` 하나만 제거합니다.

```yaml
    verbs: ["get", "watch"]
```

파일 전체를 다시 적용해도 기존 Pod를 재생성할 필요는 없습니다. RBAC 결정은 다음 API 요청부터 달라집니다.

```bash
kubectl --context kind-k8s-masterclass apply -f rbac-lab.yaml

kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  CA=/var/run/secrets/kubernetes.io/serviceaccount/ca.crt
  curl -sS --cacert "$CA" \
    -H "Authorization: Bearer $TOKEN" \
    -o /tmp/list-denied.json -w "%{http_code}\n" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NS/pods"
'
```

예상한 실패는 `403`입니다. 증거를 읽습니다.

```bash
kubectl --context kind-k8s-masterclass exec -n k8s-labs sa-client -- \
  sh -c 'head -c 260 /tmp/list-denied.json; printf "\n"'
```

응답에는 `pods is forbidden`과 `cannot list resource "pods"`가 포함되어야 합니다.

### 반드시 복구

Role의 verbs를 다시 `get`, `list`, `watch`로 되돌리고 적용합니다.

```bash
kubectl --context kind-k8s-masterclass apply -f rbac-lab.yaml
kubectl --context kind-k8s-masterclass auth can-i list pods \
  --as=system:serviceaccount:k8s-labs:pod-reader \
  -n k8s-labs
```

`yes`가 복구 기준입니다. `cluster-admin`을 추가하는 것은 복구가 아니라 과도한 우회입니다.

## 4단계 — Pod Security Admission의 거부와 통과를 비교합니다

RBAC은 “누가 이 요청을 보냈는가”를 검사합니다. Pod Security Admission은 “만들려는 Pod가 선택한 보안 수준을 만족하는가”를 검사합니다.

격리된 `secure-lab` Namespace를 만들고 Kubernetes 1.35의 restricted 규칙을 고정합니다.

```bash
kubectl --context kind-k8s-masterclass create namespace secure-lab \
  --dry-run=client -o yaml | kubectl --context kind-k8s-masterclass apply -f -

kubectl --context kind-k8s-masterclass label namespace secure-lab --overwrite \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=v1.35 \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/audit-version=v1.35 \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/warn-version=v1.35
```

### 거부되어야 하는 예제

`psa-denied.yaml`을 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: psa-denied
  namespace: secure-lab
spec:
  containers:
    - name: shell
      image: busybox:1.36.1
      command: ["sh", "-c", "sleep 86400"]
      securityContext:
        privileged: true
```

```bash
if kubectl --context kind-k8s-masterclass apply -f psa-denied.yaml; then
  printf '예상과 다름: restricted 정책이 적용되었는지 확인하세요.\n' >&2
else
  printf '예상한 실패: Admission이 안전하지 않은 Pod를 거부했습니다.\n'
fi
```

오류에는 `violates PodSecurity "restricted:v1.35"`와 함께 `privileged`, `allowPrivilegeEscalation`, `runAsNonRoot`, `seccompProfile`, `capabilities` 같은 위반 항목이 표시됩니다. 이 Pod는 저장되지 않았으므로 `kubectl logs`나 Events를 찾는 단계가 아닙니다.

### 통과해야 하는 예제

`psa-passed.yaml`을 만듭니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: psa-passed
  namespace: secure-lab
spec:
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    runAsGroup: 65532
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: shell
      image: busybox:1.36.1
      command: ["sh", "-c", "sleep 86400"]
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
  restartPolicy: Never
```

```bash
kubectl --context kind-k8s-masterclass apply -f psa-passed.yaml
kubectl --context kind-k8s-masterclass wait -n secure-lab \
  --for=condition=Ready pod/psa-passed --timeout=90s
kubectl --context kind-k8s-masterclass get pod psa-passed -n secure-lab
kubectl --context kind-k8s-masterclass exec -n secure-lab psa-passed -- id
```

예상 결과는 `Running`과 0이 아닌 UID/GID입니다. 정책을 통과했다는 사실과 애플리케이션이 실제로 실행된다는 사실을 모두 확인했습니다.

## 별도 확장 — kind 기본 CNI에서는 NetworkPolicy를 실행 검증할 수 없습니다

여기서 경계를 분명히 해야 합니다. 이 과정의 기본 kind 클러스터는 일반적으로 `kindnet`을 사용하며, **kindnet은 NetworkPolicy enforcement를 구현하지 않습니다.** NetworkPolicy 객체가 API Server에 저장되어도 트래픽이 차단되었다는 뜻이 아닙니다.

```bash
kubectl --context kind-k8s-masterclass get daemonset -n kube-system kindnet
```

위 객체가 보이는 기본 실습 클러스터에서는 “deny policy를 적용했으니 timeout될 것”이라는 실험을 하지 않습니다. apply 성공만 보고 보안이 생겼다고 결론 내리는 것이 더 위험합니다.

아래 객체는 **NetworkPolicy를 지원하는 CNI로 별도 구성한 클러스터에서만** 실행 검증합니다.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: k8s-labs
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

지원 CNI 클러스터에서는 반드시 다음 세 상태를 실제 요청으로 비교합니다.

```text
정책 전     : client → server 요청 성공
deny 적용 후: 같은 요청 timeout 또는 연결 실패
allow 추가 후: 허용한 client에서만 다시 성공
```

이 세 결과가 없다면 NetworkPolicy 실습을 완료한 것이 아닙니다. 현재 kind 기본 클러스터에서는 객체 구조만 읽고 다음으로 넘어갑니다.

## 연습 — 읽기 전용 권한을 ConfigMap까지 넓히기

`pod-reader`가 Pod뿐 아니라 ConfigMap도 `get`, `list`할 수 있게 하되 Secret은 읽지 못하게 만드세요. 변경 뒤 세 개의 `can-i` 결과가 `yes`, `yes`, `no`인지 확인합니다.

```bash
kubectl --context kind-k8s-masterclass auth can-i list pods \
  --as=system:serviceaccount:k8s-labs:pod-reader -n k8s-labs
kubectl --context kind-k8s-masterclass auth can-i list configmaps \
  --as=system:serviceaccount:k8s-labs:pod-reader -n k8s-labs
kubectl --context kind-k8s-masterclass auth can-i get secrets \
  --as=system:serviceaccount:k8s-labs:pod-reader -n k8s-labs
```

<details class="course-hint"><summary>힌트</summary><p>Core API의 <code>apiGroups</code>는 빈 문자열입니다. 기존 rules 항목의 resources에 무작정 Secret을 넣지 말고, 필요한 리소스 이름만 추가하세요.</p></details>

<details class="course-hint"><summary>정답</summary><p>Role의 같은 rule에서 <code>resources: ["pods", "configmaps"]</code>, <code>verbs: ["get", "list", "watch"]</code>를 사용합니다. Secret이 resources에 없으므로 세 번째 질문은 <code>no</code>여야 합니다. 연습 뒤 파일을 원래 Pod 전용 상태로 되돌려도 됩니다.</p></details>

## 실습 환경 정리

```bash
kubectl --context kind-k8s-masterclass delete -f rbac-lab.yaml --ignore-not-found --wait=true
kubectl --context kind-k8s-masterclass delete namespace secure-lab --ignore-not-found --wait=true
```

삭제가 오래 걸리면 `Ctrl-C`로 출력 대기를 중단할 수 있지만, 삭제 요청 자체가 취소되었다고 가정하지 마세요. `kubectl --context kind-k8s-masterclass get namespace secure-lab`과 `kubectl --context kind-k8s-masterclass get pod -n k8s-labs sa-client`로 최종 상태를 다시 확인합니다.

## 세 문장 정리

ServiceAccount는 Pod의 신원이고 Role은 허용할 API 동작이며 RoleBinding이 둘을 연결합니다. RBAC 거부는 실제 API 응답 `403`으로 증명할 수 있고, 권한을 크게 주는 대신 빠진 verb 하나만 복구해야 합니다. Pod Security Admission과 NetworkPolicy는 서로 다른 경계이며, NetworkPolicy는 지원 CNI 없이는 객체만 존재할 뿐 트래픽을 막지 않습니다.

## 다음 강의로 가져갈 상태

- `sa-client`, `pod-reader` ServiceAccount·Role·RoleBinding이 없어야 합니다.
- `secure-lab` Namespace가 없어야 합니다.
- 기본 kind CNI를 NetworkPolicy 지원 CNI라고 가정하지 않습니다.
- `k8s-labs` Namespace와 클러스터는 유지합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/10-scheduling/">← 이전: 스케줄링</a><a href="/kubernetes/12-scaling-resilience/">다음: 확장성과 고가용성 →</a></nav>

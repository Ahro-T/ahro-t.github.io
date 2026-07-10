---
title: "06. ConfigMap과 Secret — 이미지와 설정 분리하기"
summary: "ConfigMap을 환경변수와 Volume으로 각각 주입해 변경 반영 시점을 비교하고, Secret key 누락 장애를 끝까지 복구합니다."
description: "같은 이미지를 환경마다 다시 만들지 않고 설정과 비밀값을 주입하며, env·Volume의 차이와 Secret의 한계를 실습합니다."
weight: 60
categories: ["Kubernetes"]
tags: ["ConfigMap", "Secret", "Configuration"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 06 · Beginner · Configuration</p>

## 이번 시간에 해결할 문제

개발 환경에서는 로그 레벨이 `debug`, 운영 환경에서는 `info`라고 가정해봅시다. 환경이 다를 때마다 이미지를 다시 만들면 같은 프로그램을 검증해서 승격한다는 원칙이 깨집니다. 데이터베이스 비밀번호를 이미지 안에 넣는다면 이미지를 받을 수 있는 사람 모두가 비밀번호도 얻게 됩니다.

쿠버네티스는 일반 설정을 ConfigMap에, 비밀값을 Secret에 저장하고 Pod가 시작할 때 주입할 수 있습니다. 하지만 **어떻게 주입했는지에 따라 변경 반영 시점이 다릅니다.**

## 이 강의를 마치면

- 이미지, ConfigMap, Secret에 어떤 값을 두어야 하는지 구분할 수 있습니다.
- ConfigMap을 환경변수와 Volume 파일로 주입하고 변경 반영 차이를 직접 확인할 수 있습니다.
- Secret의 `stringData`와 `data`가 무엇이며 base64가 암호화가 아님을 설명할 수 있습니다.
- 없는 Secret key 때문에 시작되지 않는 Pod를 Events에서 찾아 삭제하고 정상 상태를 검증할 수 있습니다.

## 시작 전 확인

이 강의도 macOS·Linux Bash/Zsh 또는 Windows WSL2 Bash를 기준으로 합니다. 클러스터와 Namespace를 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get nodes
kubectl --context kind-k8s-masterclass get namespace k8s-labs
```

<div class="expected-result"><strong>성공 기준</strong><span>Node가 Ready이고 <code>k8s-labs</code> Namespace가 Active입니다.</span></div>

`k8s-labs`가 없다면 이 강의만 독립적으로 듣기 위해 만듭니다.

```bash
kubectl --context kind-k8s-masterclass create namespace k8s-labs
```

`AlreadyExists`가 보이면 이미 준비된 것이므로 다음 단계로 갑니다.

## 오늘의 용어 5개

| 용어 | 쉬운 뜻 | 주의점 |
|---|---|---|
| ConfigMap | 비밀이 아닌 설정 묶음 | 비밀번호를 넣지 않음 |
| Secret | 비밀값을 담는 API 객체 | 기본 저장 형태가 곧 암호화는 아님 |
| 환경변수 | 프로세스 시작 시 전달하는 이름과 값 | 실행 중인 프로세스에는 자동 갱신되지 않음 |
| Volume | Pod에 파일 경로로 연결하는 저장 공간 | ConfigMap·Secret도 파일로 보일 수 있음 |
| base64 | 바이너리를 문자로 표현하는 인코딩 | 암호화나 접근 제어가 아님 |

## 설정 주입 경로를 그림으로 보기

```text
ConfigMap app-config
      │
      ├─ env.valueFrom ── Pod 시작 ── APP_MESSAGE 환경변수
      │                              이후 ConfigMap 변경을 자동 반영하지 않음
      │
      └─ configMap Volume ────────── /config/message 파일
                                     kubelet이 주기적으로 갱신

Secret api-credential
      └─ Secret Volume ───────────── /var/run/secrets/course/db-password
```

Volume 파일이 바뀌어도 애플리케이션이 파일을 다시 읽지 않으면 동작은 달라지지 않습니다. “파일이 갱신됨”과 “애플리케이션 설정이 반영됨”은 별개의 문제입니다.

## 실습 1 — 같은 ConfigMap을 env와 Volume으로 주입하기

다음 내용을 `06-config-demo.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: k8s-labs
data:
  message: course-start
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: config-demo
  namespace: k8s-labs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: config-demo
  template:
    metadata:
      labels:
        app: config-demo
    spec:
      automountServiceAccountToken: false
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "sleep 86400"]
          env:
            - name: APP_MESSAGE
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: message
          volumeMounts:
            - name: config
              mountPath: /config
              readOnly: true
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              memory: 64Mi
      volumes:
        - name: config
          configMap:
            name: app-config
            items:
              - key: message
                path: message
```

적용하고 Deployment와 Pod가 준비될 때까지 기다립니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 06-config-demo.yaml
kubectl --context kind-k8s-masterclass rollout status \
  deployment/config-demo \
  -n k8s-labs \
  --timeout=2m
```

Pod 이름을 변수에 저장한 뒤 두 경로의 값을 읽습니다.

```bash
CONFIG_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=config-demo \
  -o jsonpath='{.items[0].metadata.name}')

kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- printenv APP_MESSAGE
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- cat /config/message
```

둘 다 `course-start`를 출력해야 합니다.

## 하나만 바꾸기 — ConfigMap 값 변경

원본 파일은 그대로 두고 live ConfigMap의 `message` 하나만 바꿉니다.

```bash
kubectl --context kind-k8s-masterclass patch configmap app-config \
  -n k8s-labs \
  --type=merge \
  -p '{"data":{"message":"course-updated"}}'
```

ConfigMap Volume은 즉시가 아니라 kubelet 동기화 주기와 cache 전파 시간에 따라 갱신됩니다. 느린 로컬 환경을 고려해 약 3분 동안 5초 간격으로 확인합니다.

```bash
CONFIG_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=config-demo \
  --sort-by=.metadata.creationTimestamp \
  -o name | tail -n 1)
VOLUME_MESSAGE=""
for attempt in {1..36}; do
  VOLUME_MESSAGE=$(kubectl --context kind-k8s-masterclass exec \
    -n k8s-labs "$CONFIG_POD" -- cat /config/message)
  if [ "$VOLUME_MESSAGE" = "course-updated" ]; then
    break
  fi
  sleep 5
done
printf 'volume=%s\n' "$VOLUME_MESSAGE"
test "$VOLUME_MESSAGE" = "course-updated"
```

이제 환경변수와 파일을 다시 비교합니다.

```bash
CONFIG_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=config-demo \
  --sort-by=.metadata.creationTimestamp \
  -o name | tail -n 1)
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- printenv APP_MESSAGE
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- cat /config/message
```

예상 결과:

```text
course-start
course-updated
```

환경변수는 컨테이너가 시작할 때 복사되므로 기존 프로세스 안에서 바뀌지 않습니다. ConfigMap Volume 파일은 갱신되지만, 실제 프로그램이 그 파일을 다시 읽는지도 별도로 확인해야 합니다.

새 환경변수를 반영하려면 Pod를 새로 만들어야 합니다.

```bash
kubectl --context kind-k8s-masterclass rollout restart \
  deployment/config-demo \
  -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status \
  deployment/config-demo \
  -n k8s-labs \
  --timeout=2m

CONFIG_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=config-demo \
  --sort-by=.metadata.creationTimestamp \
  -o name | tail -n 1)
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  "$CONFIG_POD" \
  -n k8s-labs \
  --timeout=90s
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- printenv APP_MESSAGE
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- cat /config/message
```

이번에는 환경변수와 Volume 파일이 모두 `course-updated`여야 합니다.

## 반드시 원본 설정으로 복구하기

live 값과 로컬 파일이 서로 다르면 다음 apply에서 혼란이 생깁니다. 값을 명시적으로 되돌리고 원본 파일을 적용한 뒤 Pod도 새로 만듭니다.

```bash
kubectl --context kind-k8s-masterclass patch configmap app-config \
  -n k8s-labs \
  --type=merge \
  -p '{"data":{"message":"course-start"}}'
kubectl --context kind-k8s-masterclass apply \
  -f 06-config-demo.yaml
kubectl --context kind-k8s-masterclass rollout restart \
  deployment/config-demo \
  -n k8s-labs
kubectl --context kind-k8s-masterclass rollout status \
  deployment/config-demo \
  -n k8s-labs \
  --timeout=2m

CONFIG_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=config-demo \
  --sort-by=.metadata.creationTimestamp \
  -o name | tail -n 1)
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  "$CONFIG_POD" \
  -n k8s-labs \
  --timeout=90s
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- printenv APP_MESSAGE
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$CONFIG_POD" -- cat /config/message
```

새 Pod에서 env와 파일이 모두 `course-start`인지 확인하면 복구 완료입니다.

## 실습 2 — Secret을 파일 하나로 마운트하기

다음 내용을 `06-secret.yaml`로 저장합니다. 학습용 값이며 실제 비밀번호를 Git에 저장하면 안 됩니다.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: api-credential
  namespace: k8s-labs
type: Opaque
stringData:
  username: course-user
  password: change-me-in-a-real-environment
```

`stringData`는 사람이 입력하기 편한 필드입니다. API Server는 저장할 때 값을 `data`의 base64 문자열로 바꿉니다. 이는 암호화가 아니므로 Secret 조회 권한과 etcd 암호화, 외부 Secret 저장소가 여전히 중요합니다.

다음 내용을 `06-secret-consumer.yaml`로 저장합니다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: secret-consumer
  namespace: k8s-labs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: secret-consumer
  template:
    metadata:
      labels:
        app: secret-consumer
    spec:
      automountServiceAccountToken: false
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "sleep 86400"]
          volumeMounts:
            - name: credential
              mountPath: /var/run/secrets/course
              readOnly: true
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              memory: 64Mi
      volumes:
        - name: credential
          secret:
            secretName: api-credential
            items:
              - key: password
                path: db-password
```

Secret을 먼저 만들고 consumer를 배포합니다.

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 06-secret.yaml
kubectl --context kind-k8s-masterclass apply \
  -f 06-secret-consumer.yaml
kubectl --context kind-k8s-masterclass rollout status \
  deployment/secret-consumer \
  -n k8s-labs \
  --timeout=2m
```

비밀값 자체를 화면이나 로그에 출력하지 않고 파일 존재와 길이만 확인합니다.

```bash
SECRET_POD=$(kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=secret-consumer \
  -o jsonpath='{.items[0].metadata.name}')
kubectl --context kind-k8s-masterclass exec \
  -n k8s-labs "$SECRET_POD" -- \
  wc -c /var/run/secrets/course/db-password
```

0보다 큰 숫자와 파일 경로가 출력되면 mount가 성공한 것입니다.

## 예상 실패 실습 — 존재하지 않는 Secret key

다음은 일부러 실패시키는 **완전한 별도 manifest**입니다. 원본 consumer 파일은 수정하지 않습니다. `06-secret-consumer-broken.yaml`로 저장합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-consumer-broken
  namespace: k8s-labs
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 86400"]
      volumeMounts:
        - name: credential
          mountPath: /var/run/secrets/course
          readOnly: true
  volumes:
    - name: credential
      secret:
        secretName: api-credential
        items:
          - key: missing-password
            path: db-password
```

```bash
kubectl --context kind-k8s-masterclass apply \
  -f 06-secret-consumer-broken.yaml
```

다음 wait는 20초 뒤 실패해야 정상입니다.

```bash
kubectl --context kind-k8s-masterclass wait \
  --for=condition=Ready \
  pod/secret-consumer-broken \
  -n k8s-labs \
  --timeout=20s
```

{{< alert "triangle-exclamation" >}}
`timed out waiting for the condition`이 예상 결과입니다. 컨테이너가 시작되기 전 Volume 준비 단계에서 막혔기 때문입니다.
{{< /alert >}}

로그보다 Events를 먼저 확인합니다.

```bash
kubectl --context kind-k8s-masterclass get pod \
  secret-consumer-broken \
  -n k8s-labs
kubectl --context kind-k8s-masterclass describe pod \
  secret-consumer-broken \
  -n k8s-labs
kubectl --context kind-k8s-masterclass get events \
  -n k8s-labs \
  --field-selector involvedObject.name=secret-consumer-broken \
  --sort-by=.lastTimestamp
```

Events에 `references non-existent secret key: missing-password`와 같은 메시지가 보여야 합니다. 컨테이너가 시작되지 않았으므로 애플리케이션 로그가 없는 것이 정상입니다.

## 반드시 실패 객체를 정리하고 정상 상태 검증하기

```bash
kubectl --context kind-k8s-masterclass delete pod \
  secret-consumer-broken \
  -n k8s-labs \
  --wait=true
kubectl --context kind-k8s-masterclass rollout status \
  deployment/secret-consumer \
  -n k8s-labs \
  --timeout=2m
kubectl --context kind-k8s-masterclass get pods \
  -n k8s-labs \
  -l app=secret-consumer
```

정상 consumer가 `1/1 Running`이고 broken Pod가 사라져야 복구가 끝납니다.

## 스스로 해보기 — 어떤 주입 방식을 고를까

다음 값마다 환경변수, Volume 파일, 외부 Secret 저장소 중 우선 선택을 정하고 이유를 말해보세요.

1. 프로세스 시작 때만 읽는 로그 레벨
2. nginx가 다시 읽을 수 있는 라우팅 설정 파일
3. 15분마다 자동 교체되는 클라우드 접근 자격증명

<details class="course-hint">
<summary>정답 예시</summary>

1. 로그 레벨은 환경변수로 전달할 수 있지만 변경 시 Pod rollout이 필요하다는 계약을 명시합니다.
2. 라우팅 설정은 ConfigMap Volume으로 제공할 수 있습니다. 파일 갱신만으로 충분하지 않고 nginx reload까지 자동화해야 합니다.
3. 짧은 수명의 자격증명은 정적 Secret보다 workload identity나 외부 Secret 공급자를 우선 검토합니다.

</details>

## 3문장 정리

1. ConfigMap은 일반 설정, Secret은 비밀값에 사용하지만 Secret의 base64는 암호화가 아닙니다.
2. 환경변수는 Pod 시작 시 고정되고 ConfigMap·Secret Volume 파일은 나중에 갱신될 수 있습니다.
3. 설정 변경은 source와 live 상태를 함께 맞추고, 필요한 rollout과 애플리케이션 reload까지 검증해야 완료됩니다.

## 다음 강의로 가져가는 상태

- `config-demo` Deployment: env와 Volume 모두 `course-start`
- `api-credential` Secret과 정상 `secret-consumer` Deployment
- `secret-consumer-broken` Pod: 삭제됨
- 5강의 `web` Service와 netcheck: 그대로 유지

```bash
kubectl --context kind-k8s-masterclass get \
  configmap,secret,deployment,pod \
  -n k8s-labs
```

실패 Pod가 없고 두 Deployment가 Ready이면 7강으로 이동합니다.

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/05-service-dns/">← 이전: Service와 DNS</a><a href="/kubernetes/07-storage/">다음: Volume과 StatefulSet →</a></nav>

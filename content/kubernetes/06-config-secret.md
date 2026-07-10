---
title: "06. ConfigMap과 Secret — 이미지와 설정 분리"
summary: "환경변수와 Volume 주입 방식을 비교하고 Secret의 base64 오해와 안전한 변경 흐름을 바로잡습니다."
description: "이미지를 다시 빌드하지 않고 설정을 주입하되, 변경 반영과 비밀정보 보호의 한계를 이해합니다."
weight: 60
categories: ["Kubernetes"]
tags: ["ConfigMap", "Secret", "Configuration"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 06 · 2.5H · Configuration</p>

이미지는 실행 코드와 기본값을 담고, 환경마다 달라지는 값은 런타임에 주입합니다. 이 경계를 지키면 같은 이미지 digest를 개발·스테이징·운영으로 승격할 수 있습니다.

## 이 강의를 마치면

- ConfigMap과 Secret의 용도를 구분할 수 있습니다.
- 환경변수와 Volume mount의 변경 반영 차이를 설명할 수 있습니다.
- Secret의 base64가 암호화가 아님을 설명할 수 있습니다.
- 누락된 key 때문에 컨테이너가 시작되지 않는 장애를 찾을 수 있습니다.

## 무엇을 어디에 둘까

| 데이터 | 권장 위치 |
|---|---|
| 로그 레벨, 기능 플래그, URL | ConfigMap |
| 비밀번호, 토큰, 인증서 개인키 | Secret 또는 외부 Secret 저장소 |
| 컨테이너 실행 코드 | Image |
| 환경별 manifest 차이 | Helm values 또는 Kustomize overlay |

## 실습 1 — ConfigMap으로 HTML 주입

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-content
  namespace: k8s-labs
data:
  index.html: |
    <h1>Kubernetes Masterclass</h1>
    <p>configuration lives outside the image</p>
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: config-web
  namespace: k8s-labs
spec:
  replicas: 1
  selector:
    matchLabels:
      app: config-web
  template:
    metadata:
      labels:
        app: config-web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          volumeMounts:
            - name: content
              mountPath: /usr/share/nginx/html
              readOnly: true
      volumes:
        - name: content
          configMap:
            name: web-content
```

```bash
kubectl apply -f config-web.yaml
kubectl port-forward -n k8s-labs deployment/config-web 8081:80
```

이 터미널은 port-forward를 유지하고, 다른 터미널에서 확인합니다.

```bash
curl http://localhost:8081
```

ConfigMap Volume의 파일은 시간이 지나면 갱신될 수 있지만, 애플리케이션이 파일을 다시 읽는지는 별개입니다. `subPath` mount는 자동 갱신되지 않습니다.

## 실습 2 — Secret을 파일로 마운트

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

```bash
kubectl apply -f secret.yaml
kubectl get secret api-credential -n k8s-labs
```

`stringData`는 입력 편의를 위한 필드이고 API Server는 이를 `data`의 base64로 변환합니다. base64는 누구나 복호화할 수 있는 인코딩입니다.

Pod에는 필요한 key만 read-only 파일로 마운트합니다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-consumer
  namespace: k8s-labs
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: credential
          mountPath: /var/run/secrets/course
          readOnly: true
  volumes:
    - name: credential
      secret:
        secretName: api-credential
        items:
          - key: password
            path: db-password
```

```bash
kubectl apply -f secret-consumer.yaml
kubectl exec -n k8s-labs secret-consumer -- \
  wc -c /var/run/secrets/course/db-password
```

내용 자체를 터미널이나 로그에 출력하지 않고 파일 존재와 길이만 검증합니다.

## 일부러 망가뜨리기 — 없는 key 참조

위 Pod를 복사해 이름을 `secret-consumer-broken`, `items.key`를 `missing-password`로 바꾸고 적용합니다.

```bash
kubectl get pod -n k8s-labs
kubectl describe pod secret-consumer-broken -n k8s-labs
kubectl get events -n k8s-labs --sort-by=.lastTimestamp
```

컨테이너 로그가 없을 수 있습니다. 컨테이너가 시작되기 전에 Volume 준비 단계에서 실패했기 때문입니다. 이때는 `logs`보다 Events가 먼저입니다.

## Secret 운영 원칙

- Git에 평문 Secret을 커밋하지 않습니다.
- Secret에 대한 `get`, `list`, `watch` RBAC를 최소화합니다.
- etcd encryption at rest가 자동이라고 가정하지 않습니다.
- 가능하면 짧은 수명의 workload identity를 사용합니다.
- 로그, 환경 덤프, 오류 메시지에 비밀값이 노출되지 않게 합니다.
- 변경 시 어떤 Pod가 새 값을 읽어야 하는지 rollout 계획을 정합니다.

## 체크포인트

<div class="success-check">ConfigMap 환경변수와 Volume 파일이 변경될 때 Pod와 애플리케이션에 언제 반영되는지 각각 설명하고, 없는 Secret key 장애를 Events에서 찾으면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/05-service-dns/">← 이전: Service와 DNS</a><a href="/kubernetes/07-storage/">다음: Volume과 StatefulSet →</a></nav>

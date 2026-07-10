---
title: "07. Volume과 StatefulSet — 상태를 잃지 않는 법"
summary: "emptyDir, PV, PVC, StorageClass를 구분하고 Pod 교체 뒤에도 데이터와 identity를 유지합니다."
description: "쿠버네티스 저장소 추상화와 StatefulSet의 안정적인 이름·Volume claim을 실습합니다."
weight: 70
categories: ["Kubernetes"]
tags: ["PVC", "StatefulSet", "Storage"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Module 07 · 3H · Stateful Workloads</p>

Pod는 교체 가능한 계산 단위입니다. 데이터까지 Pod의 writable layer에 두면 Pod와 함께 사라집니다. 저장소는 Pod의 수명에서 분리하고, 애플리케이션의 일관성·백업·복구는 별도로 설계해야 합니다.

## 이 강의를 마치면

- `emptyDir`, PV, PVC, StorageClass의 관계를 설명할 수 있습니다.
- 동적 프로비저닝으로 PVC를 만들고 Pod 교체 후 데이터를 확인할 수 있습니다.
- Deployment와 StatefulSet 선택 기준을 설명할 수 있습니다.
- StatefulSet만 만든다고 데이터가 안전해지는 것이 아님을 이해합니다.

## 저장소 객체의 관계

```text
Pod → PVC(필요한 저장소 요청) → PV(실제 볼륨 표현) → StorageClass/CSI(프로비저닝)
```

- `emptyDir`: Pod와 수명을 같이하는 임시 공간
- PVC: 애플리케이션이 요청하는 용량과 access mode
- PV: 클러스터가 제공하는 볼륨
- StorageClass: 볼륨을 어떻게 동적으로 만들지 정의

## 실습 1 — Pod를 지워도 데이터 남기기

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: course-data
  namespace: k8s-labs
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: data-writer
  namespace: k8s-labs
spec:
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: course-data
```

```bash
kubectl apply -f pvc-lab.yaml
kubectl wait -n k8s-labs --for=condition=Ready \
  pod/data-writer --timeout=90s
kubectl get pvc,pv -n k8s-labs
kubectl exec -n k8s-labs data-writer -- \
  sh -c 'echo persisted-before-recreate > /data/message'
kubectl exec -n k8s-labs data-writer -- cat /data/message

kubectl delete pod data-writer -n k8s-labs
kubectl apply -f pvc-lab.yaml
kubectl wait -n k8s-labs --for=condition=Ready \
  pod/data-writer --timeout=90s
kubectl exec -n k8s-labs data-writer -- cat /data/message
```

두 번째에도 `persisted-before-recreate`가 보여야 합니다. 새 Pod의 시작 명령은 기존 파일을 덮어쓰지 않습니다.

## 실습 2 — StatefulSet의 안정적인 identity

```yaml
apiVersion: v1
kind: Service
metadata:
  name: stateful-web
  namespace: k8s-labs
spec:
  clusterIP: None
  selector:
    app: stateful-web
  ports:
    - port: 80
      name: http
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: stateful-web
  namespace: k8s-labs
spec:
  serviceName: stateful-web
  replicas: 2
  selector:
    matchLabels:
      app: stateful-web
  template:
    metadata:
      labels:
        app: stateful-web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
    - metadata:
        name: data
        labels:
          app: stateful-web
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

```bash
kubectl apply -f stateful-web.yaml
kubectl rollout status statefulset/stateful-web \
  -n k8s-labs --timeout=120s
kubectl get pod,pvc -n k8s-labs -l app=stateful-web
```

Pod 이름은 `stateful-web-0`, `stateful-web-1`로 안정적이고 각 Pod는 자기 PVC를 가집니다.

## 일부러 망가뜨리기 — 존재하지 않는 PVC

Pod manifest를 복사해 이름을 `data-writer-missing`, `claimName`을 `missing-claim`으로 바꿔 새 Pod로 적용합니다. 기존 Pod의 volume 필드는 immutable이므로 같은 이름에 덮어쓰지 않습니다.

```bash
kubectl get pod -n k8s-labs
kubectl describe pod -n k8s-labs data-writer-missing
```

Pod는 `Pending`이고 Events에 `persistentvolumeclaim "missing-claim" not found`와 같은 PVC 참조 실패가 나타납니다. 애플리케이션 로그는 아직 존재하지 않습니다.

## StatefulSet이 해결하지 않는 것

- 데이터베이스 백업과 point-in-time recovery
- 복제 일관성과 리더 선출
- 스토리지 장애 도메인 설계
- 스키마 마이그레이션
- 클러스터 전체 재해 복구

관리형 데이터베이스가 더 나은 선택인 경우도 많습니다. 쿠버네티스 안에 넣을 수 있다는 것과 운영할 수 있다는 것은 다릅니다.

## 체크포인트

<div class="success-check">Pod writable layer, emptyDir, PVC의 수명 차이를 설명하고 Pod를 삭제한 뒤 같은 PVC에서 데이터를 읽으면 통과입니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/06-config-secret/">← 이전: ConfigMap과 Secret</a><a href="/kubernetes/08-probes-resources/">다음: Probe와 리소스 →</a></nav>

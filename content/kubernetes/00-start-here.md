---
title: "00. 시작하기 전에 — 길을 잃지 않는 실습법"
summary: "쿠버네티스가 처음인 사람을 위해 전체 학습 지도, 필수 도구, 명령 읽는 법과 복구 방법부터 준비합니다."
description: "터미널과 Docker만 조금 아는 학습자가 쿠버네티스 실습을 안전하게 시작하도록 환경과 학습 방법을 안내합니다."
weight: 1
categories: ["Kubernetes"]
tags: ["Kubernetes", "Getting Started", "kind"]
series: ["쿠버네티스 마스터클래스"]
---

<p class="lesson-kicker">Orientation · 1H · Start Here</p>

이 과정은 쿠버네티스를 이미 쓰는 사람을 위한 명령어 모음이 아닙니다. **터미널과 Docker를 조금 써봤지만 쿠버네티스는 처음인 사람**을 기준으로 시작합니다.

처음에는 `Pod`, `Deployment`, `Service`가 전부 낯설어도 괜찮습니다. 지금 외우려고 하지 마세요. 이 안내에서 할 일은 세 가지뿐입니다.

1. 앞으로 무엇을 어떤 순서로 배우는지 지도를 봅니다.
2. 실습 도구가 정상인지 확인합니다.
3. 오류가 났을 때 처음 상태로 돌아오는 법을 익힙니다.

<div class="beginner-note"><strong>이 과정의 약속</strong><span>새 용어는 쓰기 전에 뜻을 설명하고, 명령은 실행 결과와 이유를 함께 보여줍니다. 결과가 다르면 다음 단계로 넘어가지 않고 복구합니다.</span></div>

## 전체 지도를 먼저 봅시다

쿠버네티스 학습은 아래 질문을 하나씩 해결하는 과정입니다.

```text
컨테이너 하나를 실행하려면?              → Pod
같은 컨테이너를 여러 개 유지하려면?       → Deployment
교체되는 컨테이너에 고정 주소를 주려면?    → Service
이미지 밖에서 설정과 비밀값을 넣으려면?    → ConfigMap / Secret
Pod가 바뀌어도 데이터를 남기려면?          → Volume / PVC
트래픽을 받을 준비가 됐는지 알려면?         → Probe
외부 사용자의 요청을 안으로 들이려면?       → Gateway
어느 서버에 놓을지 정하려면?               → Scheduling
할 수 있는 일을 제한하려면?                → RBAC / SecurityContext
부하와 장애를 견디려면?                    → HPA / PDB
여러 환경에 반복 배포하려면?                → Helm / Kustomize
문제가 났을 때 원인을 찾으려면?             → Events / Logs / Metrics
```

각 객체는 새로운 기능을 자랑하려고 생긴 것이 아닙니다. **앞 단계에서 생긴 구체적인 문제를 해결하기 위해** 하나씩 등장합니다. 그래서 이 과정도 위 순서를 따릅니다.

## 지금 알아둘 용어 여섯 개

| 용어 | 이 과정에서의 뜻 | 아직 몰라도 되는 것 |
|---|---|---|
| 컨테이너 | 애플리케이션과 실행 환경을 묶은 실행 단위 | OCI 명세의 세부 구조 |
| 이미지 | 컨테이너를 만들기 위한 읽기 전용 설계도 | layer 내부 구현 |
| 클러스터 | 쿠버네티스가 관리하는 서버들의 묶음 | 고가용성 control plane 구성 |
| Node | 컨테이너가 실제로 실행되는 서버 한 대 | kubelet 내부 코드 |
| Namespace | 리소스를 이름과 권한 범위로 나누는 논리적 공간 | multi-tenancy 전체 설계 |
| manifest | 원하는 상태를 YAML로 적은 파일 | 모든 API 필드 |

모르는 용어가 한꺼번에 나오면 이 표로 돌아오세요. 강의가 진행되면서 각 항목을 실제 화면과 연결합니다.

## 실습 환경의 모양

이 과정에서는 실제 클라우드 요금이 발생하지 않도록 `kind`를 사용합니다. kind는 Docker 컨테이너 안에 쿠버네티스 Node를 만들어 줍니다.

실습 명령은 macOS/Linux의 Bash·Zsh 또는 Windows의 **WSL2 Bash**를 기준으로 합니다. PowerShell과 명령 프롬프트는 줄 연결, 따옴표, 파일 명령이 달라 그대로 실행되지 않습니다.

```text
내 컴퓨터
└─ Docker
   ├─ control-plane 컨테이너
   ├─ worker 컨테이너
   └─ worker 컨테이너
       └─ 그 안에서 실습용 Pod 실행
```

여기서 자주 하는 오해가 있습니다. 애플리케이션 Pod와 kind의 Node 컨테이너는 같은 층이 아닙니다. **Docker가 Node를 실행하고, 그 Node 안의 containerd가 다시 실습용 컨테이너를 실행합니다.** 처음에는 중첩된 구조라는 사실만 기억하면 충분합니다.

## 도구 다섯 개 확인하기

터미널에서 아래 명령을 한 줄씩 실행합니다. `$` 기호는 입력하지 않습니다.

```bash
docker version
kubectl version --client
kind version
helm version
curl --version
```

정상이라면 각 도구의 버전이 출력됩니다. 이 과정의 클러스터 기준은 Kubernetes `1.35.5`입니다. `kubectl`은 API Server와 한 minor 안쪽인 `1.34`, `1.35`, `1.36` 계열을 사용하세요. Docker, kind, Helm, curl의 patch 숫자는 예시와 완전히 같을 필요는 없습니다.

<div class="expected-result"><strong>성공 기준</strong><span>다섯 명령이 모두 “command not found” 없이 버전 정보를 출력합니다. <code>docker version</code>은 Client와 Server 정보를 모두 보여야 합니다.</span></div>

### `command not found`가 나온다면

해당 도구가 설치되지 않았거나 실행 경로에 없습니다. 강의를 계속 진행하지 말고 공식 설치 안내를 따라 설치한 뒤 **터미널을 새로 열어** 다시 확인합니다.

- [Docker 설치](https://docs.docker.com/engine/install/)
- [kubectl 설치](https://kubernetes.io/docs/tasks/tools/)
- [kind 설치](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)
- [Helm 설치](https://helm.sh/docs/intro/install/)
- [curl 설치](https://curl.se/download.html)

### Docker daemon 오류가 나온다면

다음과 비슷한 문구가 보일 수 있습니다.

```text
Cannot connect to the Docker daemon
```

도구는 설치됐지만 Docker 엔진이 실행 중이 아니라는 뜻입니다. Docker Desktop을 사용하는 경우 앱을 실행하고 “Engine running” 상태를 기다립니다. Linux에서는 Docker 서비스 상태와 현재 사용자의 권한을 확인합니다.

## 명령 블록을 읽는 법

강의에는 여러 줄 명령이 자주 등장합니다. 아래는 구조만 읽는 예시이며, 아직 클러스터를 만들지 않았으므로 **지금 실행하지 않습니다.**

<pre class="command-anatomy" aria-label="여러 줄 명령 구조 예시"><code>kubectl --context kind-k8s-masterclass create deployment web \
  --image=nginx:1.27-alpine \
  --replicas=2 \
  -n k8s-labs</code></pre>

줄 끝의 `\`는 “명령이 다음 줄에 계속된다”는 뜻입니다. 실제 실습에서는 명령 블록 전체를 복사하면 하나의 명령으로 실행됩니다.

옵션을 해석하면 다음과 같습니다.

| 조각 | 뜻 |
|---|---|
| `kubectl create deployment web` | 이름이 `web`인 Deployment 생성 |
| `--image=...` | 이 이미지로 컨테이너 실행 |
| `--replicas=2` | Pod 두 개 유지 |
| `-n k8s-labs` | `k8s-labs` Namespace에서 실행 |

앞으로도 긴 명령은 이런 식으로 **동사, 대상, 옵션, 범위**로 나눠 읽습니다.

## 파일 이름은 직접 정합니다

강의에서 “다음 내용을 `pod.yaml`로 저장합니다”라고 하면 텍스트 편집기로 새 파일을 만들라는 뜻입니다. 실습 파일이 섞이지 않도록 먼저 작업 폴더를 준비합니다.

```bash
mkdir -p k8s-masterclass
cd k8s-masterclass
```

현재 위치를 확인합니다.

```bash
pwd
```

Windows에서는 WSL2 터미널 안에서 실행합니다. 이후 YAML 파일은 이 폴더 아래에 저장합니다.

## 출력이 다르면 멈추고 세 가지를 봅니다

실습에서 가장 위험한 습관은 오류가 났는데도 다음 명령을 계속 붙여 넣는 것입니다. 결과가 예상과 다르면 아래 순서로 확인합니다.

1. **범위** — 현재 context와 Namespace가 맞는가
2. **상태** — 객체의 `STATUS`, `READY`, `AVAILABLE` 값은 무엇인가
3. **사건** — Events에 실패 이유가 적혀 있는가

```bash
kubectl config current-context
kubectl --context kind-k8s-masterclass get pods -A
kubectl --context kind-k8s-masterclass get events -A --sort-by=.lastTimestamp
```

첫 강의에서 클러스터를 만들기 전에는 첫 명령이 “current-context is not set”을, 나머지 명령이 연결 오류를 내도 정상입니다.

## 언제든 처음 상태로 돌아오는 법

kind 실습이 심하게 꼬였을 때는 운영 클러스터처럼 억지로 살릴 필요가 없습니다. 학습용 클러스터를 삭제하고 다시 만들 수 있습니다.

```bash
kind get clusters
kind delete cluster --name k8s-masterclass
```

첫 번째 명령은 현재 kind 클러스터 목록을 보여줍니다. 두 번째 명령은 이 과정에서 사용하는 `k8s-masterclass`만 삭제합니다.

{{< alert "triangle-exclamation" >}}
회사나 학교의 공유 클러스터에서 삭제 명령을 연습하지 마세요. 이 과정에서는 context가 `kind-k8s-masterclass`인지 확인한 뒤 실습합니다.
{{< /alert >}}

## 시작 체크리스트

- [ ] Docker 엔진이 실행 중입니다.
- [ ] `docker`, `kubectl`, `kind`, `helm`, `curl` 버전이 출력됩니다.
- [ ] 실습용 `k8s-masterclass` 폴더를 만들었습니다.
- [ ] `$`와 예시 출력은 명령에 포함하지 않는다는 것을 압니다.
- [ ] 오류가 나면 다음 단계로 넘어가지 않고 상태와 Events를 봅니다.
- [ ] 실습 context가 아닌 곳에서 삭제 명령을 실행하지 않습니다.

<div class="success-check"><strong>준비 완료:</strong> 다섯 도구의 역할을 한 문장씩 말하고, 여러 줄 명령을 읽고, 학습용 kind 클러스터를 삭제하는 명령을 찾을 수 있으면 1강으로 넘어갑니다.</div>

<nav class="course-nav" aria-label="강의 이동"><a href="/kubernetes/">← 전체 커리큘럼</a><a href="/kubernetes/01-control-loop/">다음: 쿠버네티스가 필요한 이유 →</a></nav>

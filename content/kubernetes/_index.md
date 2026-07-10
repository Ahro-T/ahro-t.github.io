---
title: "Kubernetes Masterclass"
description: "YAML 암기에서 벗어나, 선언·관찰·장애 복구로 배우는 실전 쿠버네티스 강의"
showBreadcrumbs: true
showTableOfContents: true
cardView: true
cardViewScreenWidth: false
groupByYear: false
orderByWeight: true

cascade:
  showDate: false
  showAuthor: false
  showBreadcrumbs: true
  showTableOfContents: true
  showReadingTime: false
  showRelatedContent: false
  showTaxonomies: false
  showPagination: false
---

<section class="course-hero" aria-labelledby="course-hero-title">
  <p class="course-eyebrow">처음부터 운영까지 · 시작 안내 + 14강</p>
  <h2 id="course-hero-title">쿠버네티스가 처음이어도, 한 단계씩 직접 확인합니다.</h2>
  <p class="course-hero-copy">명령부터 붙여 넣지 않습니다. 먼저 어떤 문제를 해결하는지 보고, 결과를 예상하고, 한 줄씩 실행한 뒤 실제 출력의 뜻을 읽습니다. 막히면 다음 단계로 넘어가지 않고 원인을 찾아 정상 상태로 되돌립니다.</p>
  <nav class="course-actions" aria-label="강의 바로가기">
    <a href="/kubernetes/00-start-here/">처음부터 시작하기 →</a>
    <a class="secondary" href="#완주-프로젝트">완주 프로젝트 보기</a>
  </nav>
</section>

<dl class="course-stats" aria-label="과정 요약">
  <div class="course-stat"><dt>입문 + 14강</dt><dd>용어부터 운영까지</dd></div>
  <div class="course-stat"><dt>30–44시간</dt><dd>학습 속도별 권장 시간</dd></div>
  <div class="course-stat"><dt>매 강의 복구</dt><dd>고장 내고 정상화하기</dd></div>
  <div class="course-stat"><dt>1개</dt><dd>운영형 캡스톤</dd></div>
</dl>

## 이 강의의 방식

현재 기준은 **터미널과 Docker를 조금 사용해 봤지만 쿠버네티스는 처음인 학습자**입니다. 새 용어는 처음 등장할 때 쉬운 뜻부터 설명합니다. 모든 강의는 같은 여섯 단계로 진행합니다.

<ol class="course-principles">
  <li class="course-principle"><strong>1. 문제를 먼저 봅니다</strong><span>객체 이름보다 “없으면 어떤 불편이 생기는가”를 이해합니다.</span></li>
  <li class="course-principle"><strong>2. 오늘의 용어를 정리합니다</strong><span>한 번에 새 용어를 다섯 개 이하로 제한합니다.</span></li>
  <li class="course-principle"><strong>3. 결과를 예상합니다</strong><span>명령 전 STATUS, READY, 요청 결과를 먼저 적어 봅니다.</span></li>
  <li class="course-principle"><strong>4. 한 단계씩 실행합니다</strong><span>파일명, 명령, 예상 출력, 출력의 의미를 함께 확인합니다.</span></li>
  <li class="course-principle"><strong>5. 하나만 바꿉니다</strong><span>변수 하나를 바꿔 전후 상태가 왜 달라지는지 비교합니다.</span></li>
  <li class="course-principle"><strong>6. 반드시 복구합니다</strong><span>Events·logs로 원인을 확인하고 다음 강의가 가능한 상태로 되돌립니다.</span></li>
</ol>

## 어떤 순서로 배우나요?

| 구간 | 강의 | 해결하는 질문 |
|---|---|---|
| 준비 | 00 | 도구와 명령을 어떻게 읽고, 꼬였을 때 어떻게 돌아오는가 |
| 기초 | 01–04 | 원하는 수의 컨테이너를 어떻게 계속 실행하고 안전하게 바꾸는가 |
| 연결과 데이터 | 05–09 | Pod를 어떻게 찾고, 설정·데이터·외부 요청을 어떻게 연결하는가 |
| 운영 제어 | 10–12 | 배치, 권한, 확장과 계획된 장애를 어떻게 통제하는가 |
| 전달과 복구 | 13–14 | 배포를 반복 가능하게 만들고 장애를 증거로 해결하는가 |

앞 강의에서 만든 리소스를 다음 강의에서 관찰하기도 합니다. 각 페이지의 **시작 전 확인**에서 필요한 상태를 보여주고, 독립적으로 듣는 경우의 준비 명령도 제공합니다.

## 수강 전 준비

- 터미널에서 명령을 한 줄씩 실행할 수 있는 정도
- Docker 이미지와 컨테이너의 아주 기본적인 차이
- Docker Desktop 또는 Docker Engine
- `kubectl`, `kind`, Helm
- 메모리 8GB 이상 권장
- 클라우드 계정은 필요하지 않습니다. 전체 실습을 로컬에서 완주할 수 있습니다.

첫 실습에서는 다음 버전을 기준으로 진행합니다. 버전이 달라도 핵심 API는 동일하지만, 명령 출력은 조금 다를 수 있습니다.

| 도구 | 기준 | 확인 명령 |
|---|---:|---|
| Kubernetes | 1.35 계열 | `kubectl --context kind-k8s-masterclass version` |
| kind | 0.32 계열 | `kind version` |
| kubectl | API 서버 ±1 minor | `kubectl version --client` |
| Helm | 4.2 계열 | `helm version` |

{{< alert "circle-info" >}}
순서대로 수강할 때는 1강에서 만든 `k8s-masterclass` 클러스터와 `k8s-labs` Namespace를 14강까지 유지합니다. 강의가 끝날 때마다 Namespace를 삭제하지 마세요. 개별 강의만 듣는 경우에는 해당 페이지의 시작 전 확인과 정리 절차를 따릅니다.
{{< /alert >}}

## 완주 프로젝트

마지막에는 `tiny-shop`이라는 작은 멀티티어 서비스를 다섯 단계로 완성합니다. 한 번에 모든 요구사항을 던지지 않고, 각 단계마다 확인 명령과 통과 기준을 제공합니다.

- Web → API → 데이터 저장소 경로
- Deployment, Service, ConfigMap, Secret, PVC
- starter에 이미 있는 readiness·liveness·startup probe와 requests·limits 검증
- HPA, PDB, topology spread와 로컬 RWO 저장소의 한계 확인
- 불필요한 API 토큰 제거와 읽기 전용 ServiceAccount·RBAC
- Kustomize 패키징, GitHub Actions 검증, selector 장애 Runbook

외부 Gateway와 TLS는 09강에서, Pod Security와 NetworkPolicy의 적용 경계는 11강에서 각각 독립 실습으로 완주합니다. 캡스톤에서는 한 번에 범위를 넓히지 않고 내부 요청 경로와 운영 복구를 통합합니다.

완주 기준은 “배포 성공”이 아닙니다. **고장 난 시스템에서 증거를 찾고, 원인을 설명하고, 안전하게 복구하는 것**입니다.

## 공식 문서

강의 자료는 공식 문서를 기준으로 유지합니다.

- [Kubernetes Concepts](https://kubernetes.io/docs/concepts/)
- [Kubernetes Tasks](https://kubernetes.io/docs/tasks/)
- [kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
- [Gateway API](https://gateway-api.sigs.k8s.io/)
- [Helm Documentation](https://helm.sh/docs/)

아래 00강부터 진행하세요. 설치가 끝났더라도 00강의 “명령을 읽는 법”과 “처음 상태로 돌아오는 법”은 꼭 확인하는 것을 권장합니다.

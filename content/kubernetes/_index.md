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
  <p class="course-eyebrow">Zero to Production · 42.5시간 실습</p>
  <h2 id="course-hero-title">쿠버네티스를 외우지 말고, 운영 원리로 이해하세요.</h2>
  <p class="course-hero-copy">“원하는 상태를 선언하면, 컨트롤러가 실제 상태를 따라오게 만든다.” 이 한 문장을 붙잡고 배포, 네트워크, 저장소, 보안, 확장, 장애 복구까지 직접 확인합니다.</p>
  <nav class="course-actions" aria-label="강의 바로가기">
    <a href="/kubernetes/01-control-loop/">1강 바로 시작하기 →</a>
    <a class="secondary" href="#완주-프로젝트">완주 프로젝트 보기</a>
  </nav>
</section>

<dl class="course-stats" aria-label="과정 요약">
  <div class="course-stat"><dt>14강</dt><dd>원리부터 운영까지</dd></div>
  <div class="course-stat"><dt>42.5시간</dt><dd>개념 30% · 실습 70%</dd></div>
  <div class="course-stat"><dt>12개</dt><dd>의도적 장애 실습</dd></div>
  <div class="course-stat"><dt>1개</dt><dd>운영형 캡스톤</dd></div>
</dl>

## 이 강의의 방식

정상 동작만 따라 치면 실무에서 멈춥니다. 모든 강의는 같은 네 단계로 진행합니다.

<ol class="course-principles">
  <li class="course-principle"><strong>1. 감으로 이해하기</strong><span>YAML보다 먼저 “왜 이 객체가 필요한가”를 잡습니다.</span></li>
  <li class="course-principle"><strong>2. 최소 구성 만들기</strong><span>가장 작은 manifest를 배포하고 실제 상태를 관찰합니다.</span></li>
  <li class="course-principle"><strong>3. 일부러 망가뜨리기</strong><span>selector, image, probe, 권한을 틀려 장애를 재현합니다.</span></li>
  <li class="course-principle"><strong>4. 증거로 복구하기</strong><span>Events·logs·metrics로 가설을 세우고 검증합니다.</span></li>
</ol>

## 수강 전 준비

- 터미널과 Git의 기본 사용법
- Docker Desktop 또는 Docker Engine
- `kubectl`, `kind`, Helm
- 메모리 8GB 이상 권장
- 클라우드 계정은 필요하지 않습니다. 전체 실습을 로컬에서 완주할 수 있습니다.

첫 실습에서는 다음 버전을 기준으로 진행합니다. 버전이 달라도 핵심 API는 동일하지만, 명령 출력은 조금 다를 수 있습니다.

| 도구 | 기준 | 확인 명령 |
|---|---:|---|
| Kubernetes | 1.36 계열 | `kubectl version` |
| kind | 0.32 계열 | `kind version` |
| kubectl | API 서버 ±1 minor | `kubectl version --client` |
| Helm | 4.2 계열 | `helm version` |

{{< alert "circle-info" >}}
애플리케이션 리소스는 원칙적으로 `k8s-labs` Namespace에 만듭니다. 실습이 끝나면 `kubectl delete namespace k8s-labs`로 정리합니다. GatewayClass, CRD, controller처럼 클러스터 범위에 설치한 add-on은 각 강의의 별도 정리 명령을 따릅니다.
{{< /alert >}}

## 완주 프로젝트

마지막에는 `tiny-shop`이라는 작은 멀티티어 서비스를 운영합니다.

- Web → API → 데이터 저장소 경로
- Deployment, Service, ConfigMap, Secret, PVC
- readiness·liveness·startup probe와 requests·limits
- Gateway 또는 Ingress 기반 외부 라우팅과 TLS
- HPA, PDB, topology spread, graceful shutdown
- ServiceAccount, RBAC, Pod Security, NetworkPolicy
- Helm 패키징, GitHub Actions 검증, 운영 Runbook

완주 기준은 “배포 성공”이 아닙니다. **고장 난 시스템에서 증거를 찾고, 원인을 설명하고, 안전하게 복구하는 것**입니다.

## 공식 문서

강의 자료는 공식 문서를 기준으로 유지합니다.

- [Kubernetes Concepts](https://kubernetes.io/docs/concepts/)
- [Kubernetes Tasks](https://kubernetes.io/docs/tasks/)
- [kubectl Reference](https://kubernetes.io/docs/reference/kubectl/)
- [Gateway API](https://gateway-api.sigs.k8s.io/)
- [Helm Documentation](https://helm.sh/docs/)

아래 1강부터 순서대로 진행하세요. 각 카드에는 그 강의에서 해결할 질문과 실습 결과가 적혀 있습니다.

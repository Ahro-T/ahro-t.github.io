(() => {
  "use strict";

  const STORAGE_KEY = "ahro-conversation-course-v2";
  const LEGACY_KEY = "ahro-docker-kubernetes-course-v1";
  const THEME_KEY = "ahro-course-theme";
  const VIDEO_ID = "kTp5xUtcalw";
  const CATEGORY_LABELS = {
    foundation: "FOUNDATION",
    docker: "DOCKER",
    kubernetes: "K8S CORE",
    operations: "OPERATIONS",
  };

  const COACHING = {
    1: {
      analogy: "여행 전에 표만 샀다고 출발 준비가 끝난 건 아니죠. Docker daemon과 kubectl의 목적지까지 확인해야 진짜 준비 완료예요.",
      hint: "‘설치됨’보다 ‘명령이 실제로 어디에 도착하는가’를 생각해보세요.",
      keywords: ["docker", "kubernetes", "kubectl", "context", "로컬", "배포"],
      quiz: {
        question: "실습 시작 전에 가장 확실한 확인은 무엇일까요?",
        options: ["앱 아이콘이 설치되어 있는지 본다", "Docker daemon과 kubectl context를 실제 명령으로 확인한다", "VS Code 테마를 설정한다"],
        answer: 1,
        explain: "도구가 설치돼도 daemon이 꺼져 있거나 context가 다른 클러스터를 가리킬 수 있어요.",
      },
    },
    2: {
      analogy: "큰 식당을 메뉴별 독립 매장으로 나누면 각자 빨리 움직일 수 있지만, 주문 전달과 재고 동기화가 새 문제가 됩니다.",
      hint: "독립 배포라는 이득과 네트워크·데이터라는 비용을 함께 떠올려보세요.",
      keywords: ["독립", "배포", "확장", "네트워크", "데이터", "복잡"],
      quiz: {
        question: "마이크로서비스라고 부르기 위한 가장 중요한 신호는?",
        options: ["소스 파일이 아주 많다", "모든 서비스가 한 DB를 공유한다", "비즈니스 경계별로 배포와 데이터 수명주기가 독립적이다"],
        answer: 2,
        explain: "파일 개수가 아니라 비즈니스 책임과 배포·데이터의 독립성이 핵심이에요.",
      },
    },
    3: {
      analogy: "Cloud Native는 좋은 날만 달리는 차가 아니라, 고장을 감지하고 우회하며 스스로 정상 궤도로 돌아오는 차에 가까워요.",
      hint: "장애와 변경을 예외가 아니라 일상으로 다루는 시스템의 성질을 말해보세요.",
      keywords: ["자동", "복구", "관찰", "장애", "변화", "느슨"],
      quiz: {
        question: "Cloud Native에 가장 가까운 설명은?",
        options: ["클라우드 VM에서 실행되는 모든 앱", "도구를 많이 설치한 시스템", "변경·장애를 전제로 자동화와 관찰·복구가 가능한 시스템"],
        answer: 2,
        explain: "장소나 도구 목록보다 시스템이 변화와 장애를 다루는 방식이 중요해요.",
      },
    },
    4: {
      analogy: "Image가 붕어빵 틀과 재료 명세라면 Container는 그 명세로 지금 구워지고 있는 붕어빵이에요. 같은 틀에서 여러 개가 나올 수 있죠.",
      hint: "불변 템플릿과 실제 실행 프로세스를 구분해보세요.",
      keywords: ["image", "이미지", "container", "컨테이너", "템플릿", "프로세스", "registry", "engine"],
      quiz: {
        question: "Image와 Container의 관계로 맞는 것은?",
        options: ["Container는 실행 중인 Image의 인스턴스다", "Image는 실행 중인 Container 안에만 존재한다", "둘은 이름만 다른 같은 객체다"],
        answer: 0,
        explain: "Image는 불변 템플릿이고 Container는 쓰기 계층과 격리가 더해진 실행 프로세스예요.",
      },
    },
    5: {
      analogy: "VS Code Docker 화면은 자동차 계기판이고 CLI는 내부 조작 원리를 드러내는 조작계예요. 둘 다 같은 Engine을 움직입니다.",
      hint: "GUI가 별도 Docker를 만드는 게 아니라 무엇을 시각화하는지 생각해보세요.",
      keywords: ["gui", "cli", "engine", "시각", "dockerfile", "로그", "이미지"],
      quiz: {
        question: "VS Code에서 컨테이너를 실행했다면 CLI에서는?",
        options: ["찾을 수 없다", "같은 Docker Engine을 보므로 docker ps에서 찾을 수 있다", "VS Code를 닫아야만 찾을 수 있다"],
        answer: 1,
        explain: "GUI와 CLI는 같은 Docker Engine의 상태를 서로 다른 방식으로 보여줘요.",
      },
    },
    6: {
      analogy: "컨테이너가 임시 숙소라면 Volume은 따로 빌린 창고예요. 숙소를 바꿔도 창고는 남지만, 창고 자체가 백업은 아닙니다.",
      hint: "컨테이너의 수명과 데이터의 수명을 분리하는 위치를 떠올려보세요.",
      keywords: ["volume", "볼륨", "bind", "데이터", "영속", "컨테이너 밖", "수명"],
      quiz: {
        question: "Volume에 대한 정확한 설명은?",
        options: ["컨테이너 삭제와 데이터 수명을 분리한다", "자동으로 원격 백업까지 만든다", "Image 안에 데이터를 영구 저장한다"],
        answer: 0,
        explain: "Volume은 수명을 분리하지만 백업·복제·암호화는 별도 전략이 필요해요.",
      },
    },
    7: {
      analogy: "Compose 파일은 여러 연주자의 악보예요. 앱·DB·네트워크가 어떤 구성으로 함께 시작할지 한 장에 적습니다.",
      hint: "여러 컨테이너의 구성과 수명주기를 반복 가능하게 만드는 선언을 생각해보세요.",
      keywords: ["compose", "yaml", "서비스", "네트워크", "볼륨", "선언", "수명주기"],
      quiz: {
        question: "depends_on이 보장하지 않는 것은?",
        options: ["컨테이너 시작 순서", "의존 서비스가 실제 요청을 받을 준비 완료", "서비스 간 의존 관계 표현"],
        answer: 1,
        explain: "프로세스 시작과 애플리케이션 준비 완료는 달라서 healthcheck와 재시도가 필요해요.",
      },
    },
    8: {
      analogy: "Registry는 앱의 물류창고, tag는 상자에 붙인 라벨, digest는 내용물로 계산한 지문이라고 보면 됩니다.",
      hint: "다른 머신이 이미지를 받을 수 있게 저장·배포하는 장소와 버전 표식을 말해보세요.",
      keywords: ["registry", "레지스트리", "push", "pull", "tag", "태그", "digest", "버전"],
      quiz: {
        question: "재현 가능한 배포에 가장 안전한 선택은?",
        options: ["항상 latest만 사용", "명시적 버전 태그 또는 digest 사용", "로컬 이미지 ID만 문서에 기록"],
        answer: 1,
        explain: "latest는 특별한 최신 보장이 아니라 단순한 기본 태그예요.",
      },
    },
    9: {
      analogy: "Kubernetes는 온도조절기 같아요. 24도라는 원하는 상태를 적으면 현재 온도를 계속 보고 차이를 줄입니다.",
      hint: "한 번 실행하는 명령보다 ‘원하는 상태와 현재 상태의 차이’를 누가 계속 줄이는지 보세요.",
      keywords: ["원하는 상태", "현재 상태", "api", "controller", "컨트롤러", "조정", "관찰"],
      quiz: {
        question: "Deployment가 관리하는 Pod를 지웠는데 다시 생긴 이유는?",
        options: ["YAML 파일이 자동 실행돼서", "컨트롤러가 원하는 replica 수와 현재 상태의 차이를 조정해서", "kubectl이 계속 백그라운드에서 실행돼서"],
        answer: 1,
        explain: "API에 기록된 원하는 상태를 컨트롤러가 지속적으로 관찰하고 복구한 결과예요.",
      },
    },
    10: {
      analogy: "Namespace는 같은 건물 안의 부서별 사물함 구역이에요. 같은 이름을 쓸 수 있지만 건물 자체가 완전히 분리되는 건 아닙니다.",
      hint: "이름 충돌과 조회 범위를 나누지만 완전한 보안 경계는 아니라는 점을 잡아보세요.",
      keywords: ["namespace", "네임스페이스", "범위", "이름", "격리", "context"],
      quiz: {
        question: "kubectl get pods가 비어 있을 때 먼저 볼 것은?",
        options: ["클러스터를 바로 삭제한다", "현재 context와 Namespace를 확인한다", "Node 이름을 바꾼다"],
        answer: 1,
        explain: "리소스가 사라진 게 아니라 조회 범위가 달라졌을 가능성을 먼저 확인해야 해요.",
      },
    },
    11: {
      analogy: "Control Plane은 배차 본부, Worker Node는 실제 차고예요. 본부가 배치 결정을 하고 kubelet이 현장에서 실행을 책임집니다.",
      hint: "결정하는 곳과 실제 컨테이너를 실행하는 곳을 분리해보세요.",
      keywords: ["control plane", "컨트롤 플레인", "node", "노드", "scheduler", "kubelet", "runtime"],
      quiz: {
        question: "Scheduler가 직접 하는 일은?",
        options: ["컨테이너 프로세스를 직접 실행한다", "Pod가 실행될 적절한 Node를 선택한다", "이미지를 Registry에 push한다"],
        answer: 1,
        explain: "Scheduler는 Node를 결정하고, 실제 실행은 해당 Node의 kubelet과 runtime이 담당해요.",
      },
    },
    12: {
      analogy: "Pod는 같은 방을 쓰는 팀이에요. localhost와 일부 저장소, 이동 일정까지 함께해야 하는 컨테이너를 묶습니다.",
      hint: "함께 배치되고 네트워크·저장소·수명주기를 공유하는 최소 단위를 생각해보세요.",
      keywords: ["pod", "파드", "컨테이너", "네트워크", "수명주기", "init", "공유"],
      quiz: {
        question: "운영 앱의 Pod를 직접 만드는 것보다 Deployment를 쓰는 이유는?",
        options: ["Pod는 YAML을 지원하지 않아서", "자기 복구와 롤링 업데이트를 상위 컨트롤러가 담당해서", "Deployment만 로그를 볼 수 있어서"],
        answer: 1,
        explain: "직접 만든 Pod에는 원하는 개수 유지와 업데이트를 책임질 상위 컨트롤러가 없어요.",
      },
    },
    13: {
      analogy: "Label은 선수의 유니폼 번호표, Selector는 ‘파란 유니폼만 모여’라는 선발 조건이에요.",
      hint: "Pod 이름이 아니라 메타데이터 조건으로 동적인 집합을 찾는 흐름을 떠올려보세요.",
      keywords: ["label", "라벨", "selector", "셀렉터", "service", "endpoint", "집합"],
      quiz: {
        question: "Service와 Pod 이름이 같아도 연결되지 않는다면?",
        options: ["Service selector와 Pod label 일치를 확인한다", "이름 끝에 숫자를 붙인다", "Pod IP를 Service 이름으로 바꾼다"],
        answer: 0,
        explain: "연결 기준은 이름이 아니라 Selector와 Label의 일치예요.",
      },
    },
    14: {
      analogy: "같은 Pod의 컨테이너는 한 몸에 붙은 도구 주머니 같아요. 몸이 움직이고 멈출 때 늘 함께해야 할 도구만 넣어야 합니다.",
      hint: "독립 확장이 필요한 서비스가 아니라 항상 같은 위치와 수명주기를 가져야 하는 보조 기능을 생각해보세요.",
      keywords: ["sidecar", "사이드카", "같은 pod", "localhost", "수명주기", "공유", "보조"],
      quiz: {
        question: "두 컨테이너를 같은 Pod에 둘 좋은 기준은?",
        options: ["개발자가 같다", "항상 함께 배치·확장·종료되어야 한다", "둘 다 HTTP를 사용한다"],
        answer: 1,
        explain: "편의보다 배치·확장·장애 수명주기가 강하게 결합됐는지가 기준이에요.",
      },
    },
    15: {
      analogy: "Workload는 근무 계약 형태예요. 상시 N명, 지점마다 1명, 이름이 고정된 직원, 일회성 알바처럼 목적에 맞게 고릅니다.",
      hint: "항상 N개·모든 Node·안정된 정체성·완료 작업·주기 작업으로 나눠보세요.",
      keywords: ["deployment", "daemonset", "statefulset", "job", "cronjob", "workload", "controller"],
      quiz: {
        question: "매일 새벽 한 번 백업을 실행할 때 가장 알맞은 Workload는?",
        options: ["DaemonSet", "CronJob", "StatefulSet"],
        answer: 1,
        explain: "일정에 따라 완료형 Job을 생성하는 책임은 CronJob에 있어요.",
      },
    },
    16: {
      analogy: "Rolling Update는 영업 중 좌석을 조금씩 교체하고, Blue-Green은 새 매장을 통째로 준비한 뒤 간판을 바꾸는 방식이에요.",
      hint: "점진 교체와 두 버전 병렬 준비의 비용·롤백 차이를 비교해보세요.",
      keywords: ["rolling", "blue", "green", "롤링", "블루", "그린", "트래픽", "롤백"],
      quiz: {
        question: "전략 이름만으로 무중단이 보장되지 않는 핵심 이유는?",
        options: ["Pod 이름이 바뀌어서", "readiness·종료 유예·DB 호환성·용량이 함께 맞아야 해서", "YAML이 너무 길어서"],
        answer: 1,
        explain: "트래픽을 받을 준비와 안전한 종료, 데이터 호환성까지 함께 설계해야 해요.",
      },
    },
    17: {
      analogy: "Service는 직원이 바뀌어도 그대로인 회사 대표번호예요. 뒤의 Pod IP가 변해도 클라이언트는 같은 번호로 연락합니다.",
      hint: "변하는 Pod 집합 앞의 안정된 IP·DNS 접점을 떠올려보세요.",
      keywords: ["service", "서비스", "selector", "pod", "ip", "dns", "endpoint"],
      quiz: {
        question: "Service가 하지 않는 일은?",
        options: ["안정된 가상 IP와 DNS 제공", "Selector로 Pod 집합 연결", "장애 난 Pod를 새로 실행해 복구"],
        answer: 2,
        explain: "Pod 복구는 Deployment 같은 컨트롤러 책임이고 Service는 네트워크 접점을 제공해요.",
      },
    },
    18: {
      analogy: "PVC는 세입자의 ‘10GB 창고 필요’ 요청서이고, PV는 건물주가 실제로 제공하는 창고예요.",
      hint: "앱의 저장소 요구와 인프라가 제공하는 실제 저장 용량을 분리해보세요.",
      keywords: ["pv", "pvc", "volume", "볼륨", "바인딩", "storage", "스토리지"],
      quiz: {
        question: "PVC를 삭제하면 실제 데이터도 반드시 삭제될까요?",
        options: ["항상 삭제된다", "절대 삭제되지 않는다", "PV reclaim policy와 스토리지 구현에 달려 있다"],
        answer: 2,
        explain: "PVC 객체와 실제 데이터의 수명 관계는 reclaim policy를 확인해야 해요.",
      },
    },
    19: {
      analogy: "ConfigMap은 환경별 설정 봉투, Secret은 접근을 더 엄격히 해야 하는 민감 정보 봉투예요. 봉투에 넣었다고 금고가 되는 건 아닙니다.",
      hint: "이미지와 설정을 분리하고 환경 변수나 파일로 주입하는 객체를 떠올려보세요.",
      keywords: ["configmap", "secret", "설정", "민감", "환경 변수", "파일", "base64"],
      quiz: {
        question: "Kubernetes Secret의 기본 상태에 대한 정확한 설명은?",
        options: ["Base64로 강력하게 암호화된다", "Base64 인코딩일 뿐 접근 제어와 저장 암호화가 별도로 필요하다", "누구도 읽을 수 없는 외부 금고다"],
        answer: 1,
        explain: "Base64는 인코딩이라 복원 가능해요. RBAC·etcd 암호화·외부 비밀 관리가 필요합니다.",
      },
    },
    20: {
      analogy: "식당으로 보면 Startup은 개점 준비 완료, Readiness는 지금 주문 가능, Liveness는 주방이 멈춰 재시작이 필요한지 묻는 검사예요.",
      hint: "시작 완료·트래픽 준비·복구 불가능한 고착이라는 서로 다른 질문으로 나눠보세요.",
      keywords: ["startup", "readiness", "liveness", "기동", "트래픽", "재시작", "probe"],
      quiz: {
        question: "외부 DB가 잠시 느려졌을 때 Liveness를 실패시키면 위험한 이유는?",
        options: ["앱 재시작 폭풍으로 장애가 커질 수 있다", "Service 이름이 바뀐다", "Image가 삭제된다"],
        answer: 0,
        explain: "외부 의존성 장애가 불필요한 앱 재시작으로 증폭될 수 있어요.",
      },
    },
    21: {
      analogy: "kubectl, Lens, K9s는 같은 경기의 라디오·TV·전광판이에요. 표현은 달라도 같은 Kubernetes API 상태를 봅니다.",
      hint: "도구마다 별도 클러스터를 보는 게 아니라 공통으로 읽는 대상을 생각해보세요.",
      keywords: ["api", "kubectl", "lens", "k9s", "리소스", "event", "이벤트"],
      quiz: {
        question: "UI에서 본 장애를 CLI로 다시 확인하는 좋은 습관은?",
        options: ["UI 화면만 캡처한다", "kubectl get·describe·logs로 같은 API 증거를 확인한다", "cluster-admin 권한을 모두에게 준다"],
        answer: 1,
        explain: "표현 도구가 달라도 리소스·Events·Logs라는 같은 증거로 교차 확인할 수 있어요.",
      },
    },
    22: {
      analogy: "HPA는 손님 수를 보고 계산대를 늘리는 매니저예요. 하지만 건물 자체가 꽉 찼다면 새 계산대를 놓을 공간은 없습니다.",
      hint: "관측값과 목표를 비교해 replica를 조절하지만 Node까지 늘리지는 않는다는 점을 잡아보세요.",
      keywords: ["hpa", "metrics", "메트릭", "replica", "리플리카", "request", "node", "확장"],
      quiz: {
        question: "HPA가 replica를 늘렸는데 Pod가 Pending인 가장 유력한 방향은?",
        options: ["Node 용량과 스케줄링 조건을 확인한다", "HPA가 Node도 자동 생성할 때까지 기다린다", "Service를 삭제한다"],
        answer: 0,
        explain: "HPA는 Pod 수만 조절해요. 배치할 Node 용량은 별도 문제입니다.",
      },
    },
    23: {
      analogy: "전체 시스템은 식당 공급망 같아요. Registry가 재료 창고, Deployment가 인력 유지, Service가 대표번호, 설정·저장소·Probe·HPA가 운영 조건을 맡습니다.",
      hint: "Image가 배포되고 요청을 받아 저장·설정·복구·확장되는 순서로 연결해보세요.",
      keywords: ["image", "registry", "deployment", "pod", "service", "pvc", "probe", "hpa"],
      quiz: {
        question: "전체 흐름을 가장 잘 연결한 문장은?",
        options: ["Service가 Image를 빌드하고 HPA가 데이터를 저장한다", "Registry의 Image로 Deployment가 Pod를 유지하고 Service가 연결하며 Probe와 HPA가 운영 상태를 조정한다", "PVC가 Pod를 복구하고 ConfigMap이 Node를 확장한다"],
        answer: 1,
        explain: "각 객체의 책임이 빌드·실행·연결·설정/저장·관찰/확장으로 자연스럽게 이어져요.",
      },
    },
  };

  const state = {
    chunks: [],
    activeId: 1,
    progress: {
      completed: [],
      notes: {},
      sessions: {},
      lastActive: 1,
    },
    noteTimer: null,
    replyTimer: null,
  };

  const elements = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      "course-map",
      "course-map-toggle",
      "map-close",
      "chunk-list",
      "progress-label",
      "progress-percent",
      "progress-bar",
      "lesson-step",
      "lesson-title",
      "conversation",
      "chat-log",
      "typing-indicator",
      "quick-actions",
      "message-form",
      "message-input",
      "send-button",
      "restart-button",
      "resource-toggle",
      "resource-drawer",
      "resource-close",
      "drawer-scrim",
      "course-video",
      "video-time",
      "youtube-link",
      "lesson-notes",
      "note-status",
      "timeline-position",
      "timeline-label",
      "previous-button",
      "next-button",
      "save-status",
      "theme-toggle",
      "teacher-message-template",
      "learner-message-template",
    ].forEach((id) => {
      elements[id] = $(id);
    });
  }

  function defaultProgress() {
    return { completed: [], notes: {}, sessions: {}, lastActive: 1 };
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === "object") {
        state.progress = {
          completed: Array.isArray(saved.completed) ? saved.completed.map(Number) : [],
          notes: saved.notes && typeof saved.notes === "object" ? saved.notes : {},
          sessions: saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {},
          lastActive: Number(saved.lastActive) || 1,
        };
        return;
      }

      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (legacy && typeof legacy === "object") {
        state.progress.completed = Array.isArray(legacy.completed) ? legacy.completed.map(Number) : [];
        state.progress.notes = legacy.notes && typeof legacy.notes === "object" ? legacy.notes : {};
        state.progress.lastActive = Number(legacy.lastActive) || 1;
      }
    } catch {
      state.progress = defaultProgress();
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
      elements["save-status"].textContent = "방금 저장됨";
      window.setTimeout(() => {
        elements["save-status"].textContent = "대화가 이 브라우저에 저장됩니다";
      }, 1200);
    } catch {
      elements["save-status"].textContent = "이 브라우저에서는 저장할 수 없습니다";
    }
  }

  function activeChunk() {
    return state.chunks.find((chunk) => chunk.id === state.activeId);
  }

  function chunkFromHash() {
    const match = window.location.hash.match(/^#chunk-(\d{1,2})$/);
    return match ? Number(match[1]) : null;
  }

  function videoUrl(chunk) {
    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      start: String(chunk.start),
    });
    return `https://www.youtube-nocookie.com/embed/${VIDEO_ID}?${params}`;
  }

  function youtubeUrl(chunk) {
    return `https://www.youtube.com/watch?v=${VIDEO_ID}&t=${chunk.start}s`;
  }

  function initialSession(chunk) {
    const number = String(chunk.id).padStart(2, "0");
    return {
      phase: "diagnostic",
      attempts: 0,
      messages: [
        {
          role: "teacher",
          text: `${number}번째 대화예요. 오늘은 ‘${chunk.title}’을 같이 잡아봅시다.\n\n내가 먼저 길게 설명하지 않을게요. 지금 아는 만큼만 편하게 말하면 돼요.`,
        },
        {
          role: "teacher",
          text: chunk.question,
        },
      ],
    };
  }

  function getSession(id = state.activeId) {
    const key = String(id);
    if (!state.progress.sessions[key]) {
      const chunk = state.chunks.find((item) => item.id === Number(id));
      state.progress.sessions[key] = initialSession(chunk);
      saveProgress();
    }
    return state.progress.sessions[key];
  }

  function addMessage(role, text, extra = {}) {
    const session = getSession();
    session.messages.push({ role, text, ...extra });
    saveProgress();
  }

  function isCompleted(id) {
    return state.progress.completed.includes(Number(id));
  }

  function markCompleted(id) {
    if (!isCompleted(id)) {
      state.progress.completed.push(Number(id));
      saveProgress();
    }
    updateProgress();
    renderChunkList();
  }

  function renderChunkList() {
    const fragment = document.createDocumentFragment();
    state.chunks.forEach((chunk) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chunk-button";
      button.dataset.id = String(chunk.id);
      button.setAttribute("aria-label", `${chunk.id}번 ${chunk.title}, ${chunk.durationMinutes}분`);
      if (chunk.id === state.activeId) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "step");
      }
      if (isCompleted(chunk.id)) button.classList.add("is-complete");

      const number = document.createElement("span");
      number.className = "chunk-number";
      number.textContent = String(chunk.id).padStart(2, "0");

      const copy = document.createElement("span");
      copy.className = "chunk-copy";
      const title = document.createElement("strong");
      title.textContent = chunk.title;
      const meta = document.createElement("small");
      meta.textContent = `${CATEGORY_LABELS[chunk.category]} · ${chunk.durationMinutes}분`;
      copy.append(title, meta);

      const status = document.createElement("span");
      status.className = "chunk-status";
      status.textContent = isCompleted(chunk.id) ? "✓" : "·";
      status.setAttribute("aria-hidden", "true");

      button.append(number, copy, status);
      button.addEventListener("click", () => selectChunk(chunk.id));
      item.append(button);
      fragment.append(item);
    });
    elements["chunk-list"].replaceChildren(fragment);
  }

  function updateProgress() {
    const completeCount = state.chunks.filter((chunk) => isCompleted(chunk.id)).length;
    const percent = state.chunks.length ? Math.round((completeCount / state.chunks.length) * 100) : 0;
    elements["progress-label"].textContent = `${completeCount} / ${state.chunks.length} 수업`;
    elements["progress-percent"].textContent = `${percent}%`;
    elements["progress-bar"].style.width = `${percent}%`;
  }

  function createMessageNode(message, index) {
    const template = message.role === "learner"
      ? elements["learner-message-template"]
      : elements["teacher-message-template"];
    const node = template.content.firstElementChild.cloneNode(true);
    const bubble = node.querySelector(".message-bubble");
    bubble.textContent = message.text;

    if (message.kind === "quiz") {
      bubble.append(createQuizCard(message, index));
    } else if (message.kind === "mission") {
      bubble.append(createMissionCard(message, index));
    }
    return node;
  }

  function createQuizCard(message, messageIndex) {
    const coaching = COACHING[state.activeId];
    const card = document.createElement("div");
    card.className = "message-card";
    const question = document.createElement("p");
    question.textContent = coaching.quiz.question;
    const options = document.createElement("div");
    options.className = "quiz-options";

    coaching.quiz.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.dataset.quizIndex = String(index);
      button.dataset.messageIndex = String(messageIndex);
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      const copy = document.createElement("b");
      copy.textContent = option;
      button.append(number, copy);

      if (typeof message.selected === "number") {
        button.disabled = true;
        if (index === coaching.quiz.answer) button.classList.add("is-correct");
        if (index === message.selected && index !== coaching.quiz.answer) button.classList.add("is-wrong");
      }
      options.append(button);
    });

    card.append(question, options);
    return card;
  }

  function createMissionCard(message, messageIndex) {
    const chunk = activeChunk();
    const card = document.createElement("div");
    card.className = "message-card mission-card";
    const label = document.createElement("span");
    label.className = "mission-label";
    label.textContent = "5–15 MINUTE MISSION";
    const copy = document.createElement("p");
    copy.textContent = chunk.lab;
    const actions = document.createElement("div");
    actions.className = "mission-actions";

    [
      ["try", "좋아요, 해볼게요"],
      ["later", "지금은 개념만 잡을게요"],
    ].forEach(([action, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mission-action";
      button.dataset.missionAction = action;
      button.dataset.messageIndex = String(messageIndex);
      button.textContent = text;
      if (message.selected) button.disabled = true;
      actions.append(button);
    });

    card.append(label, copy, actions);
    return card;
  }

  function renderConversation() {
    const session = getSession();
    const fragment = document.createDocumentFragment();
    session.messages.forEach((message, index) => {
      fragment.append(createMessageNode(message, index));
    });
    elements["chat-log"].replaceChildren(fragment);
    renderQuickActions(session.phase);
    updateComposer(session.phase);
    scrollConversation(false);
  }

  function renderQuickActions(phase) {
    const actionsByPhase = {
      diagnostic: [
        ["hint", "힌트 한 스푼"],
        ["unknown", "솔직히 잘 모르겠어요"],
      ],
      teachback: [
        ["example", "예시를 먼저 볼래요"],
        ["model", "핵심 한 문장 다시 보기"],
      ],
      done: [
        ["retry", "내 말로 다시 설명하기"],
        ["next", "다음 수업으로"],
      ],
    };
    const actions = actionsByPhase[phase] || [];
    const fragment = document.createDocumentFragment();
    actions.forEach(([action, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-action";
      button.dataset.action = action;
      button.textContent = label;
      fragment.append(button);
    });
    elements["quick-actions"].replaceChildren(fragment);
  }

  function updateComposer(phase) {
    const disabled = phase === "quiz" || phase === "mission" || phase === "done";
    elements["message-input"].disabled = disabled;
    elements["send-button"].disabled = disabled;
    if (phase === "diagnostic") {
      elements["message-input"].placeholder = "틀려도 괜찮아요. 지금 떠오르는 생각을 말해보세요.";
    } else if (phase === "teachback") {
      elements["message-input"].placeholder = "방금 내용을 보지 않고 친구에게 설명하듯 적어보세요.";
    } else if (phase === "quiz") {
      elements["message-input"].placeholder = "위 선택지에서 하나를 골라보세요.";
    } else if (phase === "mission") {
      elements["message-input"].placeholder = "미션을 어떻게 진행할지 골라보세요.";
    } else {
      elements["message-input"].placeholder = "이 수업을 마쳤어요. 복습하거나 다음으로 가보세요.";
    }
  }

  function normalize(text) {
    return text.toLocaleLowerCase("ko").replace(/\s+/g, " ").trim();
  }

  function analyzeAnswer(text) {
    const keywords = COACHING[state.activeId].keywords;
    const normalized = normalize(text);
    const found = keywords.filter((keyword) => normalized.includes(normalize(keyword)));
    const missing = keywords.filter((keyword) => !found.includes(keyword));
    return { found, missing, ratio: found.length / keywords.length };
  }

  function teacherReplyForDiagnostic(text) {
    const chunk = activeChunk();
    const coaching = COACHING[state.activeId];
    const session = getSession();
    const result = analyzeAnswer(text);
    session.attempts += 1;

    if (result.found.length === 0 && session.attempts < 2) {
      addMessage(
        "teacher",
        `좋은 출발이에요. 아직 핵심 단어가 안 나와도 괜찮아요.\n\n이렇게 비유해볼게요. ${coaching.analogy}\n\n힌트: ${coaching.hint}\n\n이제 한 문장으로 다시 말해볼까요?`,
      );
      return;
    }

    if (result.found.length > 0 && result.ratio < 0.5) {
      addMessage(
        "teacher",
        `좋아요. ‘${result.found.slice(0, 2).join("·")}’를 짚은 건 정확해요. 여기에 ‘${result.missing.slice(0, 2).join("·")}’ 관점까지 붙이면 구조가 완성됩니다.`,
      );
    } else if (result.ratio >= 0.5) {
      addMessage(
        "teacher",
        `오, 핵심을 제대로 잡았어요. 특히 ‘${result.found.slice(0, 3).join("·")}’를 연결한 게 좋습니다.`,
      );
    } else {
      addMessage(
        "teacher",
        `좋아요. 방금 답을 발판으로 정확한 축을 하나 세워볼게요. ${coaching.analogy}`,
      );
    }

    addMessage(
      "teacher",
      `딱 한 문장만 기억하면 이거예요.\n\n${chunk.model}\n\n그리고 여기서 많이 하는 착각이 있어요. ${chunk.misconception}`,
    );
    addMessage("teacher", "바로 확인해볼까요? 정답을 외우기보다 이유를 생각하며 골라보세요.", { kind: "quiz" });
    session.phase = "quiz";
  }

  function handleFreeAnswer(text) {
    const session = getSession();
    const trimmed = text.trim();
    if (!trimmed) return;

    addMessage("learner", trimmed);
    elements["message-input"].value = "";
    resizeComposer();

    showTyping(() => {
      if (session.phase === "diagnostic") {
        teacherReplyForDiagnostic(trimmed);
      } else if (session.phase === "teachback") {
        teacherReplyForTeachback(trimmed);
      }
      saveProgress();
      renderConversation();
    });
  }

  function teacherReplyForTeachback(text) {
    const chunk = activeChunk();
    const session = getSession();
    const result = analyzeAnswer(text);
    session.attempts += 1;

    if (result.found.length === 0 && text.length < 24 && session.attempts < 3) {
      addMessage(
        "teacher",
        `조금만 더 구체적으로 가볼게요. ‘${COACHING[state.activeId].keywords.slice(0, 2).join("’와 ‘")}’가 어떻게 이어지는지 넣어보세요.\n\n${chunk.check}`,
      );
      return;
    }

    addMessage(
      "teacher",
      `좋습니다. 이제 이 수업은 통과예요. 완벽한 문장보다 자기 말로 원인과 결과를 연결했다는 게 중요해요.\n\n오늘의 한 줄: ${chunk.model}`,
    );
    addMessage(
      "teacher",
      state.activeId === state.chunks.length
        ? "23번의 대화를 모두 연결했네요. 이제 명령어를 잊어도 ‘누가 어떤 상태를 책임지는가’부터 다시 찾아갈 수 있어요."
        : "잠깐 쉬었다가 다음 대화로 가도 좋고, 영상에서 해당 구간을 확인해도 좋아요. 준비되면 다음 수업에서 만나요.",
    );
    session.phase = "done";
    markCompleted(state.activeId);
  }

  function handleQuickAction(action) {
    const chunk = activeChunk();
    const coaching = COACHING[state.activeId];
    const session = getSession();

    if (action === "hint" || action === "unknown") {
      addMessage("learner", action === "hint" ? "힌트 한 스푼만 주세요." : "솔직히 아직 잘 모르겠어요.");
      showTyping(() => {
        addMessage(
          "teacher",
          action === "unknown"
            ? `좋아요. 모른다고 말하는 순간부터 진짜 수업이 시작돼요.\n\n${coaching.analogy}\n\n${coaching.hint}\n\n이 비유에서 떠오르는 걸 한 문장만 적어볼래요?`
            : `${coaching.hint}\n\n비유하면 이래요. ${coaching.analogy}\n\n이제 핵심 관계를 한 문장으로 말해보세요.`,
        );
        renderConversation();
      });
      return;
    }

    if (action === "example") {
      addMessage("learner", "예시를 먼저 보고 싶어요.");
      showTyping(() => {
        addMessage(
          "teacher",
          `예시는 이렇게 설명할 수 있어요.\n\n“${chunk.model}”\n\n이 문장을 그대로 외우지 말고, 오늘 실습 상황을 하나 붙여서 다시 말해볼까요?`,
        );
        renderConversation();
      });
      return;
    }

    if (action === "model") {
      addMessage("teacher", `핵심 한 문장은 이거예요.\n\n${chunk.model}\n\n이제 화면을 덜 보고 자기 말로 바꿔보세요.`);
      renderConversation();
      return;
    }

    if (action === "retry") {
      session.phase = "teachback";
      addMessage("teacher", `좋아요, 다시 해봅시다.\n\n${chunk.check}`);
      saveProgress();
      renderConversation();
      elements["message-input"].focus();
      return;
    }

    if (action === "next") {
      adjacentChunk(1);
    }
  }

  function handleQuiz(button) {
    const selected = Number(button.dataset.quizIndex);
    const messageIndex = Number(button.dataset.messageIndex);
    const coaching = COACHING[state.activeId];
    const session = getSession();
    const message = session.messages[messageIndex];
    if (!message || typeof message.selected === "number") return;

    message.selected = selected;
    addMessage("learner", coaching.quiz.options[selected]);
    showTyping(() => {
      addMessage(
        "teacher",
        selected === coaching.quiz.answer
          ? `맞아요. ${coaching.quiz.explain}`
          : `여기서 많이 헷갈려요. 정답은 “${coaching.quiz.options[coaching.quiz.answer]}”예요.\n\n${coaching.quiz.explain}`,
      );
      addMessage("teacher", "이제 머리에서 손으로 내려가 볼 차례예요.", { kind: "mission" });
      session.phase = "mission";
      saveProgress();
      renderConversation();
    });
  }

  function handleMission(button) {
    const action = button.dataset.missionAction;
    const messageIndex = Number(button.dataset.messageIndex);
    const chunk = activeChunk();
    const session = getSession();
    const message = session.messages[messageIndex];
    if (!message || message.selected) return;

    message.selected = action;
    addMessage("learner", action === "try" ? "좋아요, 직접 해볼게요." : "지금은 개념만 먼저 잡을게요.");
    showTyping(() => {
      addMessage(
        "teacher",
        action === "try"
          ? `좋아요. 결과가 예상과 달라도 바로 고치지 말고, 먼저 관찰한 증거를 한 줄 적어두세요.\n\n마지막으로 이것만 설명하면 오늘 수업은 끝입니다.\n${chunk.check}`
          : `괜찮아요. 오늘은 개념 연결에 집중하죠. 나중에 미션으로 돌아올 수 있게 표시해둘게요.\n\n마지막으로 이것만 자기 말로 설명해보세요.\n${chunk.check}`,
      );
      session.phase = "teachback";
      saveProgress();
      renderConversation();
      elements["message-input"].focus();
    });
  }

  function showTyping(callback) {
    window.clearTimeout(state.replyTimer);
    elements["typing-indicator"].hidden = false;
    elements["quick-actions"].replaceChildren();
    updateComposer("quiz");
    scrollConversation();
    state.replyTimer = window.setTimeout(() => {
      elements["typing-indicator"].hidden = true;
      callback();
    }, 420);
  }

  function scrollConversation(smooth = true) {
    window.requestAnimationFrame(() => {
      elements["conversation"].scrollTo({
        top: elements["conversation"].scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    });
  }

  function selectChunk(id, options = {}) {
    const chunk = state.chunks.find((item) => item.id === Number(id));
    if (!chunk) return;

    state.activeId = chunk.id;
    state.progress.lastActive = chunk.id;
    getSession(chunk.id);
    saveProgress();

    elements["lesson-step"].textContent = `CHUNK ${String(chunk.id).padStart(2, "0")} · ${CATEGORY_LABELS[chunk.category]} · ${chunk.durationMinutes}분`;
    elements["lesson-title"].textContent = chunk.title;
    elements["video-time"].textContent = `${chunk.startLabel}부터`;
    elements["youtube-link"].href = youtubeUrl(chunk);
    elements["course-video"].src = videoUrl(chunk);
    elements["lesson-notes"].value = state.progress.notes[String(chunk.id)] || "";
    elements["note-status"].textContent = "자동 저장됩니다.";
    elements["timeline-position"].style.width = `${Math.round((chunk.id / state.chunks.length) * 100)}%`;
    elements["timeline-label"].textContent = `${chunk.id} / ${state.chunks.length}`;
    elements["previous-button"].disabled = chunk.id === 1;
    elements["next-button"].disabled = chunk.id === state.chunks.length;

    history.replaceState(null, "", `#chunk-${String(chunk.id).padStart(2, "0")}`);
    renderChunkList();
    renderConversation();
    closeCourseMap();

    if (options.focus !== false) {
      elements["conversation"].focus({ preventScroll: true });
    }
  }

  function adjacentChunk(direction) {
    const index = state.chunks.findIndex((chunk) => chunk.id === state.activeId);
    const next = state.chunks[index + direction];
    if (next) selectChunk(next.id);
  }

  function restartLesson() {
    const chunk = activeChunk();
    state.progress.sessions[String(chunk.id)] = initialSession(chunk);
    saveProgress();
    renderConversation();
    elements["message-input"].focus();
  }

  function resizeComposer() {
    const input = elements["message-input"];
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  }

  function saveNote() {
    state.progress.notes[String(state.activeId)] = elements["lesson-notes"].value;
    saveProgress();
    elements["note-status"].textContent = "저장됐습니다.";
  }

  function openResourceDrawer() {
    elements["resource-drawer"].classList.add("is-open");
    elements["resource-drawer"].setAttribute("aria-hidden", "false");
    elements["resource-toggle"].setAttribute("aria-expanded", "true");
    elements["drawer-scrim"].hidden = false;
  }

  function closeResourceDrawer() {
    elements["resource-drawer"].classList.remove("is-open");
    elements["resource-drawer"].setAttribute("aria-hidden", "true");
    elements["resource-toggle"].setAttribute("aria-expanded", "false");
    elements["drawer-scrim"].hidden = true;
  }

  function openCourseMap() {
    elements["course-map"].classList.add("is-open");
    elements["course-map-toggle"].setAttribute("aria-expanded", "true");
  }

  function closeCourseMap() {
    elements["course-map"].classList.remove("is-open");
    elements["course-map-toggle"].setAttribute("aria-expanded", "false");
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    document.querySelector('meta[name="theme-color"]').content = next === "dark" ? "#101715" : "#f7f4ec";
  }

  function bindEvents() {
    elements["message-form"].addEventListener("submit", (event) => {
      event.preventDefault();
      handleFreeAnswer(elements["message-input"].value);
    });

    elements["message-input"].addEventListener("input", resizeComposer);
    elements["message-input"].addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements["message-form"].requestSubmit();
      }
    });

    elements["quick-actions"].addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button) handleQuickAction(button.dataset.action);
    });

    elements["chat-log"].addEventListener("click", (event) => {
      const quizButton = event.target.closest("[data-quiz-index]");
      if (quizButton) {
        handleQuiz(quizButton);
        return;
      }
      const missionButton = event.target.closest("[data-mission-action]");
      if (missionButton) handleMission(missionButton);
    });

    elements["restart-button"].addEventListener("click", restartLesson);
    elements["previous-button"].addEventListener("click", () => adjacentChunk(-1));
    elements["next-button"].addEventListener("click", () => adjacentChunk(1));
    elements["resource-toggle"].addEventListener("click", openResourceDrawer);
    elements["resource-close"].addEventListener("click", closeResourceDrawer);
    elements["drawer-scrim"].addEventListener("click", closeResourceDrawer);
    elements["course-map-toggle"].addEventListener("click", openCourseMap);
    elements["map-close"].addEventListener("click", closeCourseMap);
    elements["theme-toggle"].addEventListener("click", toggleTheme);

    elements["lesson-notes"].addEventListener("input", () => {
      elements["note-status"].textContent = "저장 중…";
      window.clearTimeout(state.noteTimer);
      state.noteTimer = window.setTimeout(saveNote, 380);
    });

    window.addEventListener("hashchange", () => {
      const id = chunkFromHash();
      if (id && id !== state.activeId) selectChunk(id, { focus: false });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeResourceDrawer();
        closeCourseMap();
      }
    });
  }

  async function init() {
    cacheElements();
    loadProgress();

    try {
      const response = await fetch("./course-data.json");
      if (!response.ok) throw new Error(`course-data.json: ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.chunks) || data.chunks.length !== 23) {
        throw new Error("청크 데이터 형식이 올바르지 않습니다.");
      }
      state.chunks = data.chunks;
    } catch (error) {
      console.error(error);
      elements["chat-log"].textContent = "수업 자료를 불러오지 못했습니다. 잠시 후 새로고침해주세요.";
      return;
    }

    bindEvents();
    updateProgress();
    const requested = chunkFromHash();
    const initialId = state.chunks.some((chunk) => chunk.id === requested)
      ? requested
      : Math.min(Math.max(state.progress.lastActive, 1), state.chunks.length);
    selectChunk(initialId, { focus: false });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

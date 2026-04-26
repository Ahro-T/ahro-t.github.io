---
title: "5. 가재(Gajae)로 보는 Resident Agent — 앞의 모든 층이 하나의 시스템이 되는 순간"
date: 2026-04-26
draft: false
categories: ["AI"]
tags: ["AI", "가재", "Resident Agent", "Agentic AI", "에이전트"]
series: ["에이전트 시스템 입문"]
description: "Gajae는 단일 봇이 아니라 ingress부터 verification까지 닫힌 resident-agent system의 사례다."
---

## 이 시리즈 읽는 순서

1. [LLM에서 Agent로](/posts/agentic-ai-flow-ep1/)
2. [Harness와 Runtime](/posts/agentic-ai-flow-ep2/)
3. [Memory와 LLMWiki](/posts/agentic-ai-flow-ep3/)
4. [Evaluator, Verifier, Self-Improvement](/posts/agentic-ai-flow-ep4/)
5. **현재 글** — 가재(Gajae)로 보는 Resident Agent

[이전 글](/posts/agentic-ai-flow-ep4/)까지 오면서 우리는 조각들을 하나씩 봤습니다.

- LLM
- agent
- harness
- runtime
- memory / llmwiki / ontology
- evaluator / verifier / self-improvement

이제 마지막 질문이 남습니다.

> "좋아, 조각들은 알겠어. 그런데 이게 실제로 하나의 시스템 안에서는 어떻게 붙지?"

이 질문에 가장 좋은 답은 추상적 정의를 하나 더 늘어놓는 게 아니라, **하나의 concrete topology**를 보는 것입니다.

이 글에서는 그 사례로 **가재(Gajae)** 를 봅니다.

중요한 건 가재를 그냥 "똑똑한 봇"으로 읽지 않는 것입니다.

이번 글의 핵심은 이겁니다.

> **Gajae는 단일 봇이 아니라, ingress부터 verification까지 닫힌 resident-agent system의 사례다.**

---

## 먼저, 왜 가재를 "봇"으로 보면 안 되는가

겉으로 보면 가재는 Discord 같은 채팅 인터페이스를 통해 보이는 agent처럼 보일 수 있습니다.

그래서 처음 보면 쉽게 이렇게 생각할 수 있습니다.

> "아, 그냥 채팅형 개발 봇이구나."

하지만 이건 핵심을 놓친 해석입니다.

가재 문맥에서 중요한 것은 채팅창에 보이는 답변 하나가 아니라:

- 어떤 이벤트가 들어오고
- 누가 그 이벤트를 받아들이고
- 어떤 lane에서 처리할지 정하고
- 세션 안에서 작업을 이어가고
- 결과를 artifact와 검증 루프로 다시 확인하는가

입니다.

즉 채팅은 입구일 수는 있어도, **뇌 전체는 아닙니다.**

---

## Gajae를 읽는 가장 중요한 구분: ingress와 brain은 다르다

가재 사례를 볼 때 가장 먼저 잡아야 할 구분은 이것입니다.

> **들어오는 곳(ingress)** 과 **실제로 판단하고 라우팅하는 곳(brain/orchestrator)** 은 다르다.

예를 들어 Discord, Slack, GitHub 이벤트 같은 것들은 시스템의 **입구**입니다.

반면 실제로 중요한 일은 그 뒤에서 벌어집니다.

- 이벤트를 어떤 종류의 작업으로 볼지
- 어떤 lane에서 처리할지
- 기존 세션을 이어붙일지 새로 열지
- 결과를 어떻게 다시 상태로 반영할지

이건 채팅창이 하는 일이 아니라, **orchestrator/harness 층**이 하는 일입니다.

이 구분을 놓치면 resident agent를 전부 "말 잘하는 인터페이스"로 오해하게 됩니다.

---

## Gajae 구조를 가장 단순하게 그리면

가재를 가장 단순하게 그리면 대략 이런 topology가 나옵니다.

1. **Ingress**
2. **Orchestrator / Brain**
3. **Lane selection**
4. **Worker / Session runtime**
5. **Supervision**
6. **Artifact / Knowledge boundary**
7. **Verification loop**

이 구조가 중요한 이유는, 이게 우리가 앞선 글에서 따로따로 봤던 층들을 실제 하나의 resident system 안에 다시 묶어주기 때문입니다.

---

## 1. Ingress — 시스템은 어디서 깨어나는가

가재 같은 resident system은 보통 이벤트를 통해 깨어납니다.

예를 들어:

- GitHub issue
- PR
- webhook
- Discord 호출

같은 것들이 들어올 수 있습니다.

여기서 중요한 점은 ingress가 "생각하는 층"이 아니라는 것입니다.

ingress는:

- 사건을 받아들이고
- 시스템에 전달하고
- 바깥에 현재 상태를 보여주는

**입구와 게시판**에 가깝습니다.

즉 ingress는 interface이지, whole system은 아닙니다.

---

## 2. Orchestrator / Brain — 진짜로 중요한 판단은 여기서 일어난다

가재 같은 구조에서 실제 핵심은 orchestrator입니다.

이 층은 대충 이런 일을 합니다.

- 이 이벤트가 어떤 종류의 작업인지 판단한다
- 어떤 lane으로 보내야 할지 정한다
- 이미 진행 중인 세션이 있는지 확인한다
- 작업을 이어갈지 새로 시작할지 결정한다

즉 이 층은 "답변 생성"보다 **작업 조직**에 더 가깝습니다.

앞선 글에서 말한 harness적 성격도 여기에 많이 걸립니다.

좋은 resident system은 단지 agent를 부르는 것이 아니라, agent를 **어디서 어떻게 일하게 할지**를 먼저 정합니다.

---

## 3. Lane — 모든 일을 같은 방식으로 처리하지 않는다

가재 구조에서 OMC / OMX 같은 이름이 중요하게 읽히는 이유도 여기에 있습니다.

이런 것들은 단순한 스타일 차이 프롬프트라기보다, **서로 다른 작업 lane**으로 보는 편이 더 정확합니다.

이 감각이 중요한 이유는 이렇습니다.

- 빠르게 처리해야 하는 일이 있고
- 깊게 파고들어야 하는 일이 있고
- 검증과 리뷰가 더 중요한 일이 있습니다

이걸 다 한 레일 위에서 처리하면 시스템이 쉽게 꼬입니다.

그래서 lane은 사실상 "일의 성격에 따라 다른 운영 흐름을 준다"는 뜻입니다.

즉 resident agent는 하나의 bot이라기보다, **여러 작업 레일을 가진 운영 구조**에 가깝습니다.

---

## 4. Session runtime — 실제 일은 세션 안에서 이어진다

가재 같은 시스템을 그냥 답변기로 볼 수 없는 또 하나의 이유는, 실제 일이 **세션 안에서 이어진다**는 점입니다.

여기서 중요한 것은:

- 지금 어떤 작업이 열려 있는가
- 어디까지 진행됐는가
- 무엇이 막혔는가
- 어떤 상태로 이어져야 하는가

입니다.

즉 resident system은 "한 번 답하고 끝"이 아니라, **붙들고 있는 작업 흐름**이 있습니다.

이건 runtime의 세계입니다.

이 지점에서 agent system은 확실히 챗봇을 넘어섭니다.

---

## 5. Supervision — 살아 있는 척하는 시스템을 막는다

이 층은 생각보다 훨씬 중요합니다.

왜냐하면 많은 시스템이 진짜로 실패하는 방식이:

> 겉으로는 멀쩡해 보이는데 실제론 멈춰 있는 상태

이기 때문입니다.

그래서 resident system에는 supervision이 필요합니다.

즉:

- 세션이 살아 있는가
- idle 상태인가
- blocked 상태인가
- 다시 붙여야 하는가

를 보는 층이 필요합니다.

좋은 시스템은 단지 실행만 하지 않고, **자기 실행 상태를 감시**합니다.

이게 없으면 operator는 겉보기 상태에 속기 쉽습니다.

---

## 6. Artifact boundary — 기억과 handoff는 채팅창 밖에 있어야 한다

가재 같은 구조에서 또 중요한 것은 artifact boundary입니다.

여기서 핵심은 단순합니다.

> 상태와 결과를 채팅창에만 두지 말자

왜냐하면 resident system은:

- handoff가 필요하고
- review가 필요하고
- 복구가 필요하고
- 나중에 다시 읽어야 하기 때문입니다

그래서 작업 상태, handoff, review evidence 같은 것은 더 durable한 경계에 있어야 합니다.

이게 없으면:

- 지금 무엇이 진짜 결과인지 흐려지고
- 다른 worker가 이어받기 어렵고
- verification의 근거도 약해집니다

즉 artifact boundary는 resident system에서 기억의 문제이면서 동시에 **신뢰의 문제**입니다.

---

## 7. Verification loop — maintainer system의 핵심은 여기 있다

가재를 그냥 봇으로 읽으면 놓치기 쉬운 마지막 핵심은 **verification loop**입니다.

이런 구조에서 중요한 건 "답을 얼마나 잘 만들었나"만이 아닙니다.

오히려 더 중요한 것은:

- 수정이 일어났는가
- PR/CI/review 신호가 다시 들어오는가
- 그 결과를 보고 다시 수정하거나 판단하는가

입니다.

즉 가재 같은 resident maintainer 구조는:

**action → check → re-check → revise**

가 닫히는 시스템입니다.

이건 앞 글에서 말한 self-improvement가 실제 운영 형태로 드러나는 지점이기도 합니다.

즉 가재를 보면 self-improvement를 추상적 자가반성보다 **검증이 닫히는 maintainer loop**로 이해하게 됩니다.

---

## 이제 앞의 모든 층을 다시 붙여보자

지금까지 본 조각들을 다시 붙이면 가재 같은 resident system은 대략 이렇게 읽을 수 있습니다.

- **LLM**: 생성 엔진
- **Agent**: 목표를 향해 행동하는 작업자
- **Harness**: 그 작업자를 어떤 절차로 움직일지 정하는 운영 프레임
- **Runtime**: 세션과 lane 안에서 실제로 일이 이어지는 환경
- **Memory / artifacts / wiki**: 상태와 지식을 남기는 층
- **Verifier / evaluator**: 결과를 통과시킬지 판단하는 층
- **Self-improvement loop**: 검증 결과를 다시 다음 작업에 반영하는 폐루프

즉 resident agent는 "agent 하나"가 아니라, **이 층들이 붙어 있는 운영 구조**입니다.

---

## 그래서 독자가 마지막에 그릴 수 있어야 하는 그림

이 시리즈를 다 읽고 마지막에 머릿속에 남아야 하는 건 화려한 용어 목록이 아닙니다.

이런 그림이어야 합니다.

1. 입력점이 있다
2. 그걸 판단하는 orchestrator가 있다
3. 작업 lane과 session runtime이 있다
4. 상태와 지식이 artifact / wiki 쪽에 남는다
5. verifier가 결과를 다시 검사한다
6. 그 결과가 다음 행동에 반영된다

즉 시스템은 **닫힌 루프**입니다.

이 그림이 남는다면, 이제 새로운 agent system을 볼 때도:

- 어디가 ingress인지
- 어디가 brain인지
- 어디가 runtime인지
- 어디가 memory boundary인지
- 어디가 verification loop인지

구분해서 읽을 수 있습니다.

---

## 정리

이번 글의 핵심은 이겁니다.

- 가재는 단일 봇이 아니다
- ingress와 brain은 다르다
- lane과 session runtime이 있다
- supervision과 artifact boundary가 있다
- verification loop가 닫히는 maintainer system이다

즉 가재는 앞선 네 글에서 따로 본 층들이 **하나의 resident-agent topology**로 묶인 사례입니다.

그래서 이 사례를 잘 읽으면 agent system을 추상어가 아니라 **그릴 수 있는 구조**로 보게 됩니다.

---

## 한 줄 결론

> **Gajae는 답변하는 봇이 아니라, ingress부터 verification까지 닫힌 resident-agent system의 사례다.**

---

## 시리즈를 마치며

이 시리즈에서 계속 붙잡은 질문은 하나였습니다.

> "에이전트 시스템은 무엇으로 이루어지는가?"

지금은 그 답을 이렇게 말할 수 있습니다.

- LLM은 시작점이고
- agent는 행동 주체이고
- harness와 runtime은 운영 구조이고
- memory와 wiki는 연속성을 만들고
- ontology는 그걸 정리하며
- evaluator와 verifier는 품질을 붙들고
- self-improvement는 이 모든 것을 하나의 폐루프로 닫는다

즉 agent system의 핵심은 "더 똑똑한 답변"보다 **더 잘 닫히는 운영 구조**에 있습니다.

---

## 이전 글

- ← [Evaluator, Verifier, Self-Improvement — 시스템은 어떻게 자기 실수를 줄여가는가](/posts/agentic-ai-flow-ep4/)

# 요구사항 구체화: 질문과 답변 계약

이 문서는 미배포 소스 API를 설명합니다. 아래 기능은 npm `0.2.0`에 포함되지 않았습니다.

짧은 자연어 요청을 받아 필요한 질문을 제안하는 기능과, 사용자의 답변을 검증해 구조화된 요구사항으로 정리하는 기능을 분리했습니다. OSS는 서버나 필수 LangGraph를 제공하지 않습니다. 호스트가 각 함수를 원하는 LangGraph 노드에서 호출합니다.

## 호출 흐름

1. 호스트가 사용자 메시지, 실제 OAS 계약, 사용할 native 기능과 질문 예산을 제공합니다.
2. `clarifyWorkflowRequirements`가 모델을 한 번 호출해 요구사항·질문·선택지·근거·선택적 후속 제안을 받습니다.
3. Core가 출력과 출처를 검사하고 질문·선택지 ID를 발급합니다.
4. 호스트가 질문을 표시하고, `resolveWorkflowClarificationReplies`에 명시적인 답변을 전달합니다.
5. Core가 확정 사실 `facts`와 사람이 읽을 `requirementsPrompt`를 같은 답변에서 생성합니다. 원문 `sourceMessages`는 코드가 항상 보존하며, 모델이 질문만 반환해도 원래 요청을 잃지 않습니다.

질문이 필요 없으면 `categories: []`입니다. 회원번호처럼 실행에 필요한 실제 값이 없다는 이유만으로 이 단계에서 필수 질문을 만들도록 요구하지 않습니다. 실제 값은 이후 OAS 입력 슬롯에서 관리합니다. 모델이 이 지침을 올바르게 해석하는지는 별도 품질 평가 대상입니다.

## 설정과 입력

```ts
import {
  readClarificationQuestionLimits,
  resolveWorkflowClarificationReplies,
} from '@openapi-flow/core';
import { clarifyWorkflowRequirements } from '@openapi-flow/langchain';
import { describeN8nManualTrigger } from '@openapi-flow/n8n';

// 호스트 환경에 네 값을 명시적으로 설정합니다.
const limits = readClarificationQuestionLimits(process.env);
const context = {
  messages: [{
    id: 'user-message-1',
    text: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
  }],
  operations, // resolveApiOperations가 반환한 실제 계약
  capabilities, // 호스트가 제공하는 실제 native 구현
  entrypoint: describeN8nManualTrigger(), // 컴파일러가 이미 제공하는 시작점
};
const round = await clarifyWorkflowRequirements({
  model, context, limits,
  options: { includeExplanations: true, includeSuggestions: true },
});
```

초기 권장 설정은 다음과 같습니다. 라이브러리가 누락된 환경변수를 자동으로 채우지는 않습니다.

```dotenv
OPENAPI_FLOW_CLARIFY_MAX_CATEGORIES=4
OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_CATEGORY=3
OPENAPI_FLOW_CLARIFY_MAX_CHOICES_PER_QUESTION=5
OPENAPI_FLOW_CLARIFY_MAX_QUESTIONS_PER_ROUND=6
```

개수는 문서 수용 제한이 아니라 질문 화면의 예산입니다. 선택지 상한을 1로 정할 수도 있으며, 선택형 질문은 최소 1개부터 설정된 상한까지 받습니다. 예산을 초과한 출력은 오류로 처리하며 질문이나 선택지를 잘라내지 않습니다. 이유·근거와 후속 제안은 각각 기본 활성화된 선택 기능입니다. 비활성화하면 해당 필드를 모델의 출력 스키마에서도 제외합니다. 필수 출처 `sources`는 설명 표시 옵션과 무관하게 유지합니다.

`operations`와 `capabilities`를 생략하면 각각 빈 재료 목록입니다. Core/LangChain 패키지는 숨겨진 n8n registry를 불러오지 않습니다. 호스트는 `resolveN8nNativeFeatures`와 `N8nNativeFeature` enum으로 등록 기능 전체나 명시한 일부를 선택해 전달합니다. 정본 대화 예시에서는 선택 옵션 `nativeFeatures`로 생산자 계약이 나중에 준비되는 기능도 연결합니다. 코드가 실제 계약의 준비 상태를 확인하며, 없는 계약을 만들어 넣지 않습니다. [등록 기능 계약](native-feature-registry.md)과 [단계별 준비 처리](native-feature-planning.md)를 참고하세요. OAS가 없으면 임의의 HTTP API를 추가할 수 없습니다.

`entrypoint`는 선택할 native 기능과 별개로 호스트·컴파일러가 이미 제공하는 시작점 계약입니다. `describeN8nManualTrigger()`는 실제 SDK 시작점 생성과 같은 모듈에서 이 계약을 제공합니다. 생략하면 수동 시작점을 임의로 가정하지 않습니다. 새 시작점 노드를 LLM이 다시 생성하거나 등록하도록 요구할 필요가 없습니다.

## 답변과 보류

다음은 화면에 표시한 선택지 하나를 사용자가 명시적으로 선택한 경우입니다. `question`은 저장한 `round`에 실제로 존재하는 선택형 질문이어야 합니다.

```ts
const resolution = resolveWorkflowClarificationReplies({
  round,
  context,
  replies: [{
    kind: 'single-choice',
    questionId: question.id,
    choiceId: selectedChoice.id,
  }],
});
```

답변 종류는 `single-choice`, `multiple-choice`, `text`, `defer`입니다. `defer`를 제외하면 질문이 선언한 답변 종류와 일치해야 합니다. 자유로운 업무 변경 요청을 선택지 이름과 임의로 매칭하지 않습니다. 호스트는 그런 입력을 새 요구사항 변경 단계로 전달해야 합니다.

답변을 나누어 받을 때는 이전 `resolution`을 `previous`로 전달합니다. 미답변은 `pendingQuestionIds`, 명시적 보류는 `deferredQuestionIds`로 구분합니다. 보류한 질문은 나중에 답할 수 있지만 확정 답변을 덮어쓰지는 못합니다. 변경하려면 명시적인 요구사항 수정 단계가 필요합니다.

`readyForPlanning`은 해당 질문 라운드에 남은 미답변·보류가 없다는 뜻입니다. 워크플로우 실행 준비, 사용자 승인, 실제 입력값 준비 또는 업무 의미의 정확성을 보장하지 않습니다. 독립적인 부분을 먼저 설계할지와 보류 질문의 노드 범위는 이후 초안·호스트 단계에서 결정합니다.

## 출처와 상태의 소유권

- 모델은 메시지 근거의 실제 ID만 선택합니다. Zod 입력 스키마에는 `quote`가 없으며, 파싱할 때 코드가 캡처한 원문 전체를 붙입니다. Core의 직접 API는 기존처럼 ID·인용을 받고 원문 일치를 검사합니다. 없는 ID나 모델이 추가한 `quote`는 거절하며 인용문을 보정하지 않습니다.
- OAS 근거에서는 모델이 관련 후보 ID만 고릅니다. 코드는 원래 operation key·snapshot과 Operation Object 전체를 가리키는 루트 위치를 결합합니다. 이 단계에서는 LLM에게 JSON Pointer를 계산하도록 요구하지 않습니다. Core의 직접 근거 검사 API는 명시적으로 전달한 세부 위치도 검사합니다.
- Native 근거는 실제 제공된 capability 이름만 사용할 수 있습니다.
- 후속 제안은 사용자가 채택하기 전까지 `facts`나 `requirementsPrompt`에 포함하지 않습니다.

이 검사는 출처의 존재와 일치를 확인합니다. 인용이 모델의 주장을 의미상 충분히 뒷받침하는지는 자동으로 증명하지 못합니다. 모델의 이유는 사용자 검토용 짧은 설명이며 내부 추론 과정이 아닙니다.

호스트는 원본 `round`, 그때의 `context`, 이전 확정 답변을 보관해야 합니다. 화면에서는 답변만 받아야 합니다. 메시지·OAS·capability 선언이 바뀌면 기존 라운드는 오래된 상태로 거절됩니다. 답변을 처리할 때는 질문을 만들었던 context를 사용하고, 새 메시지나 재료를 반영한 재분석은 별도 라운드로 시작합니다.

ID와 fingerprint는 상태 일치 확인용이며 인증 서명이나 저장소가 아닙니다. 수정된 round 전체를 UI에서 받아 권위 있는 원본으로 취급하면 안 됩니다. 세션 소유권·만료·동시 요청·검토 정책과 LangGraph interrupt/resume은 호스트 책임입니다.

fingerprint는 직렬화된 메시지·OAS·시작점·native 입력 선언을 비교합니다. native 구현 함수의 본체나 모든 refinement의 동등성을 증명하지 않습니다. 호스트가 구현을 교체할 때는 그 변경에 맞게 보관한 상태도 관리해야 합니다.

## 검증 범위

`test/workflow-clarification.test.mjs`는 질문 예산, 출처, 코드 발급 ID, 부분 답변, 보류, 오래된 상태, 확정값 보존과 무단 제안 채택 방지를 검사합니다. `test/workflow-clarification-http.test.mjs`는 실제 ChatOpenAI 클라이언트를 로컬 HTTP 서버에 연결해 네 가지 선택 옵션 조합의 전송 스키마를 검사합니다. 모델의 의미 선택 품질을 검증하는 단위 테스트는 아닙니다.

첫 Chomsky 점검에서는 LangChain의 Zod 응답 포맷 변환이 만든 `$ref`와 `description`·`title`의 조합을 서버가 거절했습니다. 현재 전송 경계는 [Zod 공식 JSON Schema 변환](https://zod.dev/json-schema#reused)의 `reused: 'inline'`, `cycles: 'ref'`를 사용합니다. 메시지 ID에서 원문을 붙이는 근거 스키마에는 `io: 'input'`을 명시하며, 다른 스키마의 기존 출력 방향은 바꾸지 않습니다. 질문·의미 선택은 `draft-7`, 실제 OAS 값이 포함된 단계는 각 단계가 선언한 dialect를 유지합니다. 변환 결과를 순수 JSON으로 보내 프레임워크가 다시 직렬화하지 않게 하고, 응답은 원래 Zod 스키마로 검사합니다. 설명·타입·필드 제한을 삭제하거나 서버 거절 후 다른 방식으로 재시도하지 않습니다. OAS는 바꾸지 않습니다.

개발 중 실제 Chomsky에서 ICL의 짧은 요청, 명확한 API 지정, native-only 요청을 별도로 점검했습니다. 첫 전송 거절과 수정 후 결과는 따로 보존합니다. 이는 질문 구체화 단계의 개발 점검이며 전체 워크플로우의 의미 정확도나 실행 품질 평가를 대신하지 않습니다.

실제 비공개 OAS는 `integration/real-oas.mjs`에서 별도로 검사합니다. 이 경로는 업무 API를 호출하지 않습니다. 구현된 초안·호스트 연결과 남은 실제 모델 평가 범위는 [구현 기록](conversational-oss-implementation.md)을 확인하세요.

## 구조화된 요구사항을 초안에 연결하기

`requirementsPrompt`를 새 사용자 원문으로 다시 입력하지 않습니다. 아래 함수가 원본 라운드·답변·사실·답변 기록을 다시 검증해 이후 단계의 구조화된 입력으로 만듭니다.

```ts
import { prepareWorkflowDraftClarification } from '@openapi-flow/core';
import {
  analyzeWorkflowDraftEdit,
  planWorkflowDraftClarificationScopes,
} from '@openapi-flow/langchain';

const clarification = prepareWorkflowDraftClarification({ context, round, resolution });
const planningContext = {
  ...context,
  clarification,
  messages: [...context.messages, ...clarification.answerMessages],
};
const edit = {
  draft,
  context: planningContext,
  requestMessageIds: planningContext.messages.map((message) => message.id),
};
const plan = await analyzeWorkflowDraftEdit({ ...edit, model });
const clarificationScopes = await planWorkflowDraftClarificationScopes({
  ...edit, plan, model,
});
// 이후 재료 준비·staging·조립에는 원래 plan과 clarificationScopes를 함께 전달합니다.
```

사실·질문 ID, 내용, 상태, 출처와 `origin`은 코드가 만듭니다. 범위 선택 모델은 이미 정해진 요구사항 키에 대해 전체 워크플로우 또는 실제 선택한 노드 ID만 선택합니다. 아직 선택하지 않은 확장에 관한 미확정 질문에는 `unselected-work`를 선택할 수 있습니다. 이 질문을 처리하려고 가짜 API를 만들거나 독립적인 작업을 전부 막지 않습니다. 단, `pendingClarificationQuestionIds`가 남아 있으면 최종 채택·실행용 export는 허용하지 않습니다.

명확한 요청에는 질문 중단이 없습니다. 보류한 답변을 나중에 확정하면 이전 계획·독립 준비 결과를 이력에 남기고 명시적으로 재분석합니다. 오래된 재료를 새 계획으로 자동 재배치하지 않으므로 독립 단계도 다시 호출될 수 있습니다. 정확히 같은 입력의 안전한 재사용은 별도 최적화 과제입니다.

[LangGraph 호스트 예시](workflow-draft-conversation-host.md)는 이 경로를 `clarification` 옵션으로 제공합니다. 선택 옵션 `reviewSuggestions`를 켜면 실제 검토·질문 중단 지점마다 새 후속 제안을 제공합니다. 제안은 사용자가 채택한 뒤에만 새 요청이 되며 원래 계획에 자동으로 추가되지 않습니다. [검토 후속 제안](workflow-review-suggestions.md)과 [명시적인 요구사항 변경 이력](workflow-draft-requirement-history.md)은 구현되어 있습니다. 임의의 대화에서 요구사항의 의미·교체 의도를 항상 올바르게 판단하는지는 별도 품질 검증이 필요합니다.

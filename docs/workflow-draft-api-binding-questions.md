# API 입력 연결 질문과 명시적 답변

## 미배포 요청값 재계획의 소유 경계

독립 `generateApiArguments`는 한 번의 제안을 검증하고 결과 또는 원본 거절을
반환합니다. `createApiArgumentRejection`으로 만든 동일 입력의 피드백을 다음
호출에 제공할 수 있지만 OSS가 호출 횟수·시간·사용자 검토 정책을 정하지 않습니다.
선택적 `signal`은 리터럴 호출과 후속 enum 해석까지 전달하며 취소 뒤 늦게 도착한
값은 수용하지 않습니다. 취소 신호 자체는 프롬프트·지문·checkpoint에 넣지 않습니다.

공식 examples의 `createApiArgumentPlanningGraph`가 이 계약을 예산·저장·안전한
진행 콜백으로 조합합니다. 리터럴 형식·계약 거절만 반복하고 실제 미정 값은 부모가
입력을 확인합니다. Qoopilot 같은 호스트의 SSE·질문·화면 정책과 분리하며 기존
정본 초안 대화에 이 루프를 자동 삽입하지 않습니다.
[예제의 사용법과 검증 한계](../examples/langgraph-workflow/README.md#요청값-자동-재계획과-책임-경계-미배포)를 참고하세요.

선택된 API의 입력에 어떤 선행 응답을 연결할지 모호하면, 모델은 확인할
입력 위치와 출처 후보만 제안합니다. 질문 문장·작업 정보·입력 스키마·선택지
ID는 Core가 만듭니다. 사용자의 답변은 같은 계획에서 코드로 적용합니다.
이 기능은 미배포 소스이며 npm 0.2.0에는 없습니다.

## 요청 의도를 먼저 고정하는 선택 단계

OAS에 입력이 있다는 사실만으로 사용자가 그 입력을 요청한 것은 아닙니다.
`selectWorkflowDraftApiBindingInputs`는 선택된 API의 원본 요청 계약과 현재
질의를 보고, 선행 결과에서 받아야 하는 입력 포인터만 선택합니다. 출처·값·질문·
연결은 만들지 않습니다. 출처 계약은 이 선택 모델에 제공하지 않으므로 필드명이
같다는 이유로 바인딩을 고르는 단계와도 구분됩니다.

```ts
const inputIntent = await selectWorkflowDraftApiBindingInputs({
  ...selectedCall,
  model,
});
const bindingPlan = await planWorkflowDraftApiCallBindings({
  ...selectedCall,
  inputIntent,
  model,
});
const argumentsResult = await generateWorkflowDraftApiCallArguments({
  ...selectedCall,
  bindingPlan,
  model,
});
```

`selectedCall`은 원래 초안·context·계획·stepId·본문 형식으로 구성한 기존
`WorkflowDraftApiCallPlanningInput`입니다. Core의
`describeWorkflowDraftApiBindingIntent`, `createWorkflowDraftApiBindingIntentSchema`,
`resolveWorkflowDraftApiBindingIntent`를 직접 조합해 다른 선택기를 사용할 수도
있습니다. LangGraph나 별도 서버가 필수인 API는 아닙니다.

Core는 포인터가 원본 OAS에 허용되는지, 선택 대상이 중복·중첩되지 않는지와
원래 메시지·작업·본문 계약의 지문을 검사합니다. 바인딩 단계에서는 검증한
`inputIntent`를 다시 도출한 뒤 선택된 포인터만 출력 스키마의 enum으로 제공합니다.
모델 입력의 `bindingTargets`에도 그 포인터와 원래 대상 스키마만 담으며, 전체
요청 필드 목록은 다시 주지 않습니다. 범위 밖 바인딩·질문은 거절하고, 선택된
대상을 바인딩하거나 질문하지 않은 채 누락하는 것도 거절합니다. 값을 고치거나
질문을 조용히 삭제하는 방식은 사용하지 않습니다.

선택 대상이 비어 있으면 바인딩 모델을 호출하지 않습니다. 이후 값 생성·필수값
검사는 원래 OAS를 계속 사용합니다. 따라서 필수값 누락은 기존 입력 질문으로
남고, 사용자가 명시한 선택 파라미터의 리터럴 값도 유지됩니다. 사용자가 실제로
요청한 선택 파라미터의 선행 응답 연결 역시 대상에 포함할 수 있으며 필요한
출처 질문도 그대로 제공합니다. 동적 속성·배열·중첩·이스케이프 이름은 원래
포인터와 OAS 검사를 따르고, 서비스별 이름 목록이나 자동 연결 규칙은 없습니다.

정본 LangGraph 예제에서는 `planApiBindingInputs: true`로 이 체크포인트를
켭니다. `api-media` 뒤, `api-bindings` 앞에서 실행하고 결과를 bundle과
`stageResults`에 저장합니다. 질문 재개 시 이미 선택한 범위를 다시 모델에 묻지
않습니다. 옵션이나 `inputIntent`를 생략한 기존 호출 방식은 이 추가 선택과
범위 제한을 도입하지 않습니다. 예전 호출만으로 같은 보장이 생긴다고 해석하면
안 됩니다.

코드는 선택 이후의 범위·원본 계약·출처 존재를 보장합니다. 질의의 의미를 보고
첫 선택을 올바르게 하는지는 여전히 모델 평가 대상입니다. 출처가 존재한다는
검사만으로 사용자가 그 필드를 원했다는 사실까지 증명하지는 않습니다.

## 값이 미정인 선택 입력의 요청 추적

선행 응답 연결과 별도로, 사용자가 요청한 선택 입력의 리터럴 값도 추적할 수
있습니다. 예를 들어 “주소 조회에 addrType 필터도 적용해줘. 값은 아직 몰라”라는
질의에서 OAS가 `addrType`을 선택 항목으로 선언했더라도 그 요청을 누락하면 안 됩니다.

```ts
const argumentsResult = await generateWorkflowDraftApiCallArguments({
  ...selectedCall,
  bindingPlan,
  trackRequestedInputs: true,
  model,
});
```

기존 값 생성 호출의 출력 스키마에 `requestedInputs`를 추가합니다. 모델은
요청한 원본 OAS 포인터만 선택하고, 코드가 그 위치의 값·바인딩 존재 여부와
OAS 계약을 검사합니다. 호출을 하나 더 추가하거나 OAS의 `required`를 바꾸지 않습니다.
아래는 미배포 작업본의 모델 출력입니다. `trackRequestedInputs: true` 또는
`selectOasEnums: true`이면 실제 값의 존재 여부도 명시합니다. 값이 없을 때 모델이
빈 본문을 만들지 않도록 `not-provided` 분기에는 값·출처 필드를 허용하지 않습니다.

```json
{
  "literalInputs": { "state": "not-provided" },
  "requestedInputs": ["/query/addrType"]
}
```

이 분기를 검증한 뒤 코드가 내부의 빈 입력 목록을 구성합니다. 반면 사용자가
실제로 빈 객체를 지정했다면 `provided` 분기에 원래 값을 보존해야 합니다.
`values`는 해당 호출의 OAS 타입을 따르며, 빈 객체·빈 배열·`null`·빈 문자열·
`0`·`false`에도 실제 사용자 출처가 필요합니다. 출처 없는 `{ body: {} }`를
입력 미정으로 바꾸거나, OAS의 예제·기본값을 확정 사용자 값으로 복사하지 않습니다.
값 생성 대상이 있는 호출에서 `includeExplanations: true`이면 두 분기 모두 루트의
`explanation`도 요구합니다.

이 변경은 모델 전송 형식과 공개 `ApiLiteralGenerationOutput` 타입의 변경입니다.
기존 추적 모드의 `{ values, literalSources, requestedInputs }` 출력이나 이를 흉내 낸
사용자 모델·테스트 대역은 새 계약에 맞춰야 합니다. 옛 출력을 자동 변환하지 않습니다.
두 옵션을 모두 끈 기존 값 생성 모드는 `{ values }`를 유지하며, 최종 반환값인
`ApiCallArguments`와 Core의 OAS·출처 검사는 바뀌지 않습니다. 아직 공개 0.3.18에
포함된 기능이 아니며, 배포 시 호환성 안내와 버전 판단이 필요합니다.

책임도 구분합니다. OSS는 위 출력 스키마·값 검증·구조화된 실패 진단을 제공하고
자체 반복 호출은 하지 않습니다. Qoopilot 같은 호스트가 API별 결과 checkpoint,
실패한 호출만의 재계획, 예산·취소·질문·화면 표시를 담당합니다. 다른 LangChain
패키지 사본의 파싱 예외도 공식 `lc_error_code`로 식별하며, 오류 문구만으로
출력 오류를 추측하거나 잘못된 필드를 옮겨 보정하지 않습니다.

값이 없으면 `kind: "requested-input"` 질문으로 반환합니다. OAS 자체의 필수값
누락은 기존 `kind: "missing-input"`과 구분합니다. `allowRuntimeInputs: true`를
명시하면 같은 요구를 입력 슬롯으로 보존합니다. 선택 항목을 일괄 필수로 만들거나
임시 값·예제·기본값을 생성하지 않습니다. 호스트가 이미 요청 의도를 알고 있다면
Core의 `inspectApiArgumentRequirements`나 초안 API call에 `requestedInputs`를
직접 전달할 수 있으며 모델은 필요하지 않습니다.

상위 본문 객체 전체가 비어 있으면 원래 OAS의 부모 스키마로 질문하고, 사용자가
요청한 하위 포인터도 질문에 보존합니다. `{}`처럼 OAS에는 맞지만 요청한 하위
필드가 없는 답변은 거절합니다. 다른 하위 필드가 바인딩 소유라면 부모 전체를
되묻지 않고 그 소유권과 겹치지 않는 위치를 질문합니다. 배열의 빈 구간이나
실제 값을 만들어 채우지는 않습니다.

확정 답변·초안·실행 입력·한국어 안내·전송 직전 검사까지 같은 메타데이터를
전달합니다. `false`, `0`, `null`, 빈 문자열도 OAS 타입에 맞으면 실제 값입니다.
입력 슬롯의 OAS 스키마는 그대로 두고 사용자 요청의 존재 조건은 별도로 검사합니다.
상위 객체 바인딩이 완료된 뒤 요청한 하위 필드가 없다면, OAS가 그 필드를
선택 항목으로 허용하더라도 해당 HTTP 요청은 보내지 않습니다.

명시적인 입력 삭제는 값과 해당 위치·하위 위치의 요청 의도를 함께 철회합니다.
아직 값이 없는 입력이라도 선언된 요청 의도는 삭제할 수 있습니다. 없는 값과
없는 의도를 조용히 무시하지는 않습니다. API 교체에는 이전 작업의 요청 포인터를
복사하지 않고, 바인딩 소유권 변경만으로 요청 의도를 자동 철회하지도 않습니다.

정본 예제의 옵션 이름은 `trackRequestedApiInputs: true`입니다. 초기 생성과
답변 재개에서 같은 옵션을 전달하며, 답변 후 원래 계획을 다시 모델에 생성시키지
않습니다. 이 옵션과 `planApiBindingInputs`는 서로 독립적입니다. 생략한 기존
호출은 추가 요청 추적을 수행하지 않습니다. 최초 모델이 질의의 뜻을 정확히
읽었는지까지 코드가 증명하는 것은 아니므로 의미 선택 품질 평가는 여전히 필요합니다.

## 동일 입력의 거절된 값 제안 다시 계획하기 (미배포)

`createApiArgumentRejection`은 `generateApiArguments`의 실제 리터럴 출력·계약
오류에서만 비공개 피드백을 만듭니다. 다음 호출의 `rejectedProposals`에 전달하면
이전 제안·검증 사유를 현재 스키마와 함께 받습니다. 사용자 원문인 `scenario`는
바뀌지 않으며 거절된 값이나 사유를 새 입력 근거로 인용할 수 없습니다.

```ts
const rejection = createApiArgumentRejection({ ...originalInput, error });
if (rejection === undefined) throw error;

// The host first stores the rejection and checks its explicit budget/cancellation policy.
const result = await generateApiArguments({
  ...originalInput,
  model,
  rejectedProposals: [rejection],
});
```

이 예시는 호스트가 허용한 다음 호출이며 OSS 내부의 자동 반복이 아닙니다. 원문·
OAS·역할·바인딩·확정 입력·생성 옵션이 달라지면 피드백을 재사용하지 않습니다.
유효하지 않은 피드백은 모델 호출 전에 거절합니다. 비 JSON 출력을 바꿔 저장하거나
오류 문구에서 JSON을 추출해 복구하지 않습니다. 파서가 제공한 원래 출력은 원래
형식으로 보존하고, 없으면 다른 필드를 대체 출처로 쓰지 않습니다.

`ApiArgumentPlanningError`는 기존 `OpenApiFlowError`의 하위 타입으로 원래 진단·
`cause`와 `originalError`를 보존합니다. `toJSON()`에는 기존 안전한 진단만 포함하고
원래 출력·검증 사유·지문은 내보내지 않습니다. 잘못된 제안은 검증 전 데이터이므로
`output`은 `unknown`이며 피드백 스키마가 JSON 보존 가능성을 확인한 뒤에만 사용합니다.
전송·인증·timeout·모델 설정 오류는 이 재계획 대상으로 바꾸지 않습니다. 후속 enum
해석 오류도 리터럴 재계획으로 돌리지 않고 원래 단계의 오류를 유지합니다.

호스트가 반복 예산·취소·원인 단계 이동·checkpoint와 공개 진행 이벤트를 담당합니다.
현재 Qoopilot은 API별 결과 보존과 사용자가 요청한 실패 지점 재개를 제공하지만,
이 새 피드백 계약을 쓰는 자동 루프는 아직 연결하지 않았습니다. 공개 0.3.18에도
포함되지 않았습니다. 피드백은 비공개 checkpoint에서만 다루고 SSE·기본 화면·
n8n 실행 JSON에는 포함하지 않아야 합니다.

## 모델이 정하는 범위

`planWorkflowDraftApiCallBindings`는 현재 선택된 작업의 `requestSchema`와
`requestInputRoots`, 실제 출처 후보를 받습니다. 다른 API에 관한 요청 입력을
현재 작업의 질문으로 반환할 수 없습니다. 모델의 미확정 출력은 다음 형태입니다.

```json
{
  "decision": {
    "status": "needs-clarification",
    "mappings": [],
    "questions": [
      {
        "kind": "choose-source",
        "targetPointer": "/query/owner",
        "candidates": [
          { "sourceNodeId": "<actual-source-id>", "sourcePointer": "/email" },
          {
            "sourceNodeId": "<actual-source-id>",
            "sourcePointer": "/accountId"
          }
        ]
      }
    ],
    "sourceMessageIds": ["<actual-current-message-id>"]
  }
}
```

이미 정한 연결은 `mappings`에 보존합니다. 미확정 위치는 `questions`로 분리하며
전체 질문에 답하기 전에는 실행용 바인딩을 반환하지 않습니다. 값 출처가 없을
때는 출력 스키마에 `mappings`와 출처 선택 분기가 없습니다. 코드가 알고 있는
빈 연결 목록을 모델이 만들 필요가 없기 때문입니다.

요청 입력 자체가 없는 API는 질문 분기도 만들지 않습니다. 바인딩 모델 호출 없이
코드가 빈 연결을 확정하며, 실제로 불가능한 질문 배열의 스키마도 전송하지 않습니다.

질문은 두 종류입니다.

- `binding-intent`: 현재 입력에 선행 응답을 사용할지 확인
- `choose-source`: 현재 입력에 연결할 실제 출처 후보를 제시

모델 출력에 자유로운 `message`, 다른 작업 키, 질문 ID, 입력 타입, UI 선택지
이름을 넣으면 실패합니다. 선택적인 설명은 기존 설명 계약으로 따로 받습니다.
설명의 출처 존재 여부는 검사하지만 그 문장의 의미까지 증명하지는 않습니다.

## 원본 OAS 검사와 질문 생성

출력 스키마는 현재 요청의 실제 입력 루트를 기준으로 포인터 범위를 정합니다.
`GET /seed/{seedId}`에 `/path/seedId`만 있으면 다른 API의 `/query/owner` 질문은
그 스키마에 맞지 않습니다. 추가 속성·배열 같은 동적 하위 입력을 유한한
필드 목록으로 제한하지는 않습니다. 하위 포인터의 유효성은 원본 OAS로 검사합니다.

줄바꿈 등도 JSON 속성명에 포함될 수 있으며 JSON 문자열로 전송할 때 제어문자를
이스케이프해야 합니다. 하위 포인터를 일반 `.*`로 좁혀서 거절하지 않고 모든
문자를 수용한 뒤 원래 포인터·OAS 검사에 맡깁니다. 정규화나 금지 목록은 추가하지
않습니다. [RFC 8259의 문자열 규칙](https://www.rfc-editor.org/rfc/rfc8259.html#section-7)과
[RFC 6901의 포인터 문법](https://www.rfc-editor.org/rfc/rfc6901.html#section-3)을 따릅니다.

Core는 질문 대상이 실제 요청 입력인지, 이미 확정한 연결이나 다른 질문과
겹치지 않는지 확인합니다. 출처 후보는 일반 바인딩과 같은 검사로 실제 노드·
응답 포인터·타입 호환성을 검증합니다. 없는 출처나 타입이 맞지 않는 후보는
화면에 보내지 않습니다. 필드 이름이 같다고 연결하거나 값을 변환하지 않습니다.

반환 질문에는 원래 작업 키, 실제 대상 노드 ID, HTTP method·path, 입력 포인터와
원래 입력 스키마, 코드가 만든 질문·선택지 ID가 있습니다. 문장은 다음처럼
현재 작업과 입력을 명시합니다.

```text
GET /addresses의 /query/owner 입력에 연결할 선행 응답을 선택해 주세요.
```

예정된 API의 응답 계약을 선택지로 제시할 수도 있습니다. 이는 OAS에 응답이
정의됐다는 뜻이며 API 실행이나 요청값 준비를 뜻하지 않습니다. 최종 연결·
DAG 검사는 해당 출처가 실제 선행 노드인지 별도로 확인합니다.

## Core에서 답변 적용

답변은 호스트가 확인한 명시적 사용자 입력으로 전달합니다. 모델 출력 스키마에는
`answers`가 없으므로 모델이 사용자의 선택을 대신 확정할 수 없습니다.

```ts
import { resolveWorkflowDraftApiCallBindings } from '@openapi-flow/core';

const result = resolveWorkflowDraftApiCallBindings({
  ...originalInput,
  fingerprint: pending.fingerprint,
  proposal: pending.proposal,
  answers: [
    {
      kind: 'choose-source',
      questionId: submittedQuestionId,
      choiceId: submittedChoiceId,
    },
  ],
});
```

`originalInput`과 `pending`은 원래 계획 스냅샷입니다. 클라이언트가 보낸 객체로
바꾸거나 다른 단계의 결과를 자동으로 끼워 넣으면 안 됩니다.

- `choose-source`: 실제 질문의 선택지 ID를 선택
- `bind-source`: 실제 질문에 원본 출처 노드 ID·응답 포인터를 명시적으로 지정
- `no-binding`: 이 입력은 선행 응답에서 받지 않겠다고 명시

`bind-source`도 동일한 출처·OAS·타입 검사를 거칩니다. 모델이 제안하지 않은
연결도 사용자가 명시적으로 지정할 수 있지만 실제 계약을 벗어날 수는 없습니다.
`no-binding`은 입력값을 채우는 동작이 아닙니다. 이후 리터럴 생성·입력 질문·
명시적으로 켠 런타임 슬롯 경로가 원래 OAS에 맞는 값을 다룹니다.

여러 질문에는 누적 답변 배열을 전달합니다. 일부만 답하면 `needs-clarification`과
남은 질문을 반환하며 실행용 `bindings`는 없습니다. 모든 질문에 답하면
`ready`가 됩니다. 인자 생성 전에 원래 제안과 답변으로 결과를 재구성하므로
조작한 완료 상태·연결·답변이나 오래된 지문은 실패합니다.

## LangGraph 호스트 응답

[정본 대화 예시](workflow-draft-conversation-host.md)의 `api-binding` 질문은
원본 `bindingQuestion`을 함께 제공합니다. 현재 토큰과 새 사용자 동작 ID로 답합니다.

```json
{
  "action": "answer-api-bindings",
  "token": "<current-token>",
  "messageId": "<new-human-action-id>",
  "answers": [
    {
      "kind": "choose-source",
      "questionId": "<actual-question-id>",
      "choiceId": "<explicitly-selected-choice-id>"
    }
  ]
}
```

호스트는 현재 미확정 질문과 원래 계획 묶음을 확인합니다. 잘못된 답변은
문제를 화면에 돌려주고 원본 계획·모델 호출 횟수를 유지합니다. 답변을 적용하려고
의미 분석·바인딩 모델을 다시 호출하지 않습니다. 다중 API 답변 중 하나가 틀리면
다른 답변도 부분 적용하지 않습니다.

답변은 `typed-api-binding-answers` 기록과 단계 결과에 남습니다. 현재 계획의
입력 문맥을 바꾸지 않으므로 지문을 재발급하거나 옛 결과를 자동 재배치하지
않습니다. 이후 리터럴이 남으면 그 단계가 실행되고, 그래프 연결 모델과 최종
계약 검사·검토·SDK 컴파일은 계속 필요합니다. 전체 생성이 모델 무호출이라는
뜻은 아닙니다.

## 검증과 한계

```sh
npm run build
node --test test/workflow-draft-api-binding-questions*.test.mjs
npm run test:api-binding-questions-local-n8n
```

검사는 범위를 벗어난 질문·추가 UI 필드의 거절, 타입이 맞지 않는 출처, 부분
답변, 중복·오래된 답변, 동적 객체·배열, 실제 ChatOpenAI 전송 스키마와 같은
계획에서의 재개를 확인합니다.

질문할 필요가 있는지 판단하는 일은 여전히 모델의 의미 판단입니다. 현재 입력에
대해 불필요하게 확인할 가능성까지 없앤 것은 아닙니다. 입력 계약으로 질문 범위를
보장하며 모델이 항상 사용자의 의도를 정확히 읽는다고 주장하지 않습니다.
인증·동시 요청·세션 수명·표시 방식은 호스트 책임이고 ID는 인증 서명이 아닙니다.
이전 미배포 `{ status: 'needs-clarification', message }` 출력은 자동 변환하지 않습니다.
전체 구현·실제 모델 검증 상태는 [구현 기록](conversational-oss-implementation.md)에 남깁니다.

# API 선택의 이유와 원본 근거

이 기능은 미배포 소스에 있으며 npm `0.2.0`에는 포함되지 않았습니다.

`selectApiOperations`와 `analyzeApiSelection`에 `includeExplanations: true`를
전달하면 각 선택·결손·선택 질문의 이유를 기존 LLM 호출에서 함께 받습니다.
모델은 짧은 `reason`만 작성하고, Core가 실제 입력과 해당 결정의 후보 자료를
붙입니다. 설명 전용 호출이나 모델이 작성한 인용문은 없습니다.

## 독립 함수 사용

```ts
import {
  createApiCatalog,
  listApiOperations,
  validateApiSelectionExplanation,
} from '@openapi-flow/core';
import { selectApiOperations } from '@openapi-flow/langchain';

const catalog = await createApiCatalog(sources);
const context = {
  scenario: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
  operations: listApiOperations(catalog),
};
const selection = await selectApiOperations({
  ...context,
  model,
  includeExplanations: true,
});

for (const selected of selection.operations) {
  if (!selected.explanation) throw new Error('Expected selection explanation');
  validateApiSelectionExplanation({
    context,
    basis: { kind: 'candidates', operations: [selected.key] },
    explanation: selected.explanation,
  });
}
```

옵션을 생략하거나 `false`로 주면 설명 필드는 출력 스키마에 없습니다. 이 독립
함수의 기본 동작은 기존 선택 계약을 유지합니다. 대화형 초안 편집의 별도
`options.includeExplanations`와 혼동하지 않아야 합니다.

모델이 작성하는 선택 항목은 다음과 같습니다.

```json
{
  "candidateId": "candidate-1",
  "purpose": "회원 간단 정보 조회",
  "explanation": {
    "reason": "요청한 간단 조회 기능과 후보 설명이 일치합니다."
  }
}
```

최종 `SelectedApiOperation`의 `key`와 `explanation.evidence`는 코드가
구성합니다. `evidence`에는 시나리오 원문인 `{ kind: 'scenario', text }`와
후보 스냅샷인 `{ kind: 'discovery', candidates }`가 들어갑니다.

후보는 `key`, `source`, `operationRef`, `method`, `path`, 선택적
`operationId`, `summary`, `description`, `tags`를 보존합니다. 같은 경로라도
`documentId`, `snapshotId`, `operationRef`로 서비스·문서 버전을 구분합니다.
같은 API를 두 역할로 선택하면 두 호출의 목적·이유를 각각 유지합니다.
선택 순서는 실행 순서가 아닙니다.

## 결정별 근거 범위

- 선택된 API: 해당 후보
- 모호한 선택 질문: 제시한 대안들을 같은 순서로 보존
- API 결손: 전달한 전체 후보 목록

이 단계의 자료는 탐색용 메타데이터입니다. 요청 본문·응답·인증의 전체 OAS
계약을 검증했다는 뜻은 아닙니다. 상세 계약은 선택 후 `resolveApiOperations`와
각 입력·참조·그래프 검사 단계가 다룹니다. 결손 판단도 전달된 목록에 한정되며,
다른 곳에 API가 존재하지 않는다는 증명은 아닙니다.

코드가 근거 자료를 붙여도 모델의 의미 해석이 옳다는 사실까지 증명하지는
않습니다. 사용자 검토와 품질 평가는 여전히 필요합니다. 후보가 없으면 기존의
결정적 결손 결과를 반환하며, 모델 호출이나 모델 설명은 만들지 않습니다.

## 후보 검토와 호스트 연결

`analyzeApiSelection({ ...context, model, includeExplanations: true })`의
`questions[].explanation`으로 질문 이유와 실제 대안을 표시할 수 있습니다.
이후 `resolveApiSelectionAnswers`는 명시적인 사용자 선택을 적용합니다.
질문한 이유를 최종 사용자 선택의 모델 근거로 복사하지 않습니다. 호스트는
원래 `analysis`와 실제 답변을 검토 기록으로 보존해야 합니다.

기존 생성·대화 예시의 호스트 설정은 다음과 같습니다.

```ts
const graph = createConversationalWorkflowGenerationGraph({
  model,
  checkpointer,
  selectionOptions: { includeExplanations: true },
});
```

실제 `operation-choice` interrupt에도 설명을 전달합니다. 이 옵션은 탐색용
API 선택에만 적용되며, 뒤쪽 모든 계획 함수의 설명 지원을 뜻하지 않습니다.

## 검사와 보존

`describeApiSelectionContext`는 탐색 후보와 식별자를 검사하고 복사합니다.
중복 후보 등록, 빠진 식별자, 바깥쪽 `operationRef`와 `key.operationRef`의
불일치는 모델 호출 전에 실패합니다. 동일 API의 여러 호출 인스턴스 선택은
중복 후보 등록과 다르며 계속 허용합니다.

`createApiSelectionExplanation`은 명시한 `basis`에서 근거를 도출합니다.
`validateApiSelectionExplanation`은 같은 자료로 다시 도출한 결과와 비교해
바뀐 원문·메타데이터·문서 버전·대안 목록을 거절합니다. 호출 중 외부 입력을
수정해도 이미 전달한 스냅샷은 바뀌지 않습니다. 이 검사는 주어진 context와의
일치를 확인하며, 자료 제공자의 신원이나 서명을 검증하지는 않습니다.

시나리오 원문과 후보 설명을 포함하므로 호스트가 표시·저장·로그 정책을 정해야
합니다. 인증값은 시나리오나 후보 설명에 넣지 않아야 합니다.

구현과 검증 진입점:

- [Core 근거 생성](../packages/core/src/openapi/selection/evidence/create-api-selection-explanation.ts)
- [Core 원본 일치 검사](../packages/core/src/openapi/selection/evidence/validate-api-selection-explanation.ts)
- [독립 선택](../packages/langchain/src/selection/select-api-operations.ts)
- [질문 포함 선택](../packages/langchain/src/selection/analyze-api-selection.ts)
- [실제 ChatOpenAI 전송 검사](../test/api-selection-explanations-http.test.mjs)
- [실제 호스트 질문 검사](../test/api-selection-explanations-conversation.test.mjs)
- [격리 n8n 검증 진입점](../integration/api-selection-explanations-local-n8n.mjs)

본문 형식 선택은 [별도의 결정·근거 계약](request-media-decisions.md)으로 제공합니다.
독립 입력 생성은 [최초 제안·근거 계약](literal-generation-records.md)으로 제공합니다.
독립 바인딩·native·전체 그래프 계획과 자연어 답변 추출의 선택적 설명은
별도 남은 범위입니다. [전체 구현 기록](conversational-oss-implementation.md)에서
진행 상태를 관리합니다.

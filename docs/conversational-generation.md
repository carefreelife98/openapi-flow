# 짧은 요청에서 시작하는 대화형 생성

이 문서의 질문·확정값 계약은 공개 패키지 0.3.7에 포함된다. 라이브러리 자체가 화면·서버·n8n 인스턴스를 제공하는 것은 아니다. 호스트가 모델·OAS·상태 저장소를 제공하고, OSS의 질문·확정값 계약을 공식 LangGraph 예시로 연결한다.

## 책임과 구조

| 책임                            | 위치                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| 필수 입력·답변 검사·확정값 적용 | `packages/core/src/arguments/clarification/`                                         |
| 선택 답변과 OAS snapshot 검증   | `packages/core/src/openapi/selection/`                                               |
| API 역할 선택과 모호함 분석     | `packages/langchain/src/selection/analyze-api-selection.ts`                          |
| 자연어 값 추출·원문 대조        | `packages/langchain/src/arguments/`                                                  |
| 질문·재개·답변 적용             | example의 `graph/conversation/`                                                      |
| 공통 API 준비                   | example의 `graph/review/prepare-reviewable-api-calls.ts`, `types/api-preparation.ts` |
| 상태·응답 스키마·타입           | example의 `schemas/conversation-*.ts`, `types/workflow-conversation.ts`              |

core는 LangChain·LangGraph·n8n을 import하지 않는다. 화면, 권한, 대화 이력, 보관 기간과 운영용 checkpointer는 호스트 책임이다. 공식 예시는 [LangGraph interrupt와 resume](https://docs.langchain.com/oss/javascript/langgraph/interrupts)를 사용한다.

## 입력 정책

```text
짧은 요청 + 여러 OAS → API 분석 → 필요한 경우 API 선택 질문
→ 전체 계약 조회 → native·bindings 계획 → 코드가 필수 입력 계산
→ 질문 → 답변 검사 → 연결 계획 → 공식 SDK로 workflow JSON 생성
```

API가 여러 개 있다는 이유만으로 질문하지 않는다. 같은 요청 역할의 후보들이 의미 있게 다르고 요청으로 구별할 수 없을 때 질문하도록 모델에 요구한다. 모호함 판별의 의미적 정확성까지 스키마가 증명하지는 않는다. API 자체 부재는 입력 부족과 구분하고 기존 `needs-review` 경로를 유지한다.

대화형 예시는 `confirmed-only` 정책을 사용한다. 최초 요청에서 파라미터를 생성하는 모델 호출을 하지 않고, OAS 필수 입력에서 실행 시 제공될 bindings를 제외한 질문을 계산한다. 모델이 회원번호를 상상해 질문을 건너뛰지 못한다. 처음부터 값을 적은 긴 요청도 이 예시에서는 확인 질문을 받을 수 있다. 모든 선택 입력 추출·완성 후 업무 추가까지 처리하는 에이전트는 아니다. 그런 호스트는 아래 독립 함수를 조합해 확정값과 선택 입력을 전달한다. 기존 단발성 함수의 `scenario` 기반 생성·누락 시 오류 계약은 그대로다.

## 호스트 사용 예시

`model`과 `{ id, spec }` 형태의 `sources`는 호스트가 제공한다. `MemorySaver`는 로컬 예시이며 운영에서는 호스트의 영속 저장소를 사용한다.

```ts
import { randomUUID } from 'node:crypto';
import { MemorySaver, Command } from '@langchain/langgraph';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { createConversationalWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const graph = createConversationalWorkflowGenerationGraph({
  model,
  checkpointer: new MemorySaver(),
  capabilities: createN8nNativeCapabilities(),
});
const config = { configurable: { thread_id: randomUUID() } };
const state = await graph.invoke(
  {
    workflowId: 'member-test',
    workflowName: '회원 조회',
    scenario: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
    sources,
    trace: [],
  },
  config,
);
```

example 패키지는 private workspace 조합이며 npm에서 설치하는 네 번째 제품 패키지가 아니다. 실제 앱에서는 이 호스트 조합을 가져와 사용한다.

`state.__interrupt__`의 질문을 화면에 표시한 뒤 같은 `thread_id`로 재개한다. `request-input` 질문의 자연어 답변은 다음과 같다.

```ts
const resumed = await graph.invoke(
  new Command({
    resume: { action: 'reply', text: '회원번호는 "member-01"이야.' },
  }),
  config,
);
```

폼 답변은 `{ action: 'answer', answers: [{ requirementId, value }] }`이며 해석 LLM 호출이 없다. `operation-choice`에는 `{ action: 'choose', answers: [{ questionId, operation }] }`로 답한다. `operation`은 제시된 후보의 원래 key다. 첫 후보를 자동 선택하지 않는다. 질문 대기 중 `{ action: 'cancel' }`은 workflow 없이 종료한다.

화면은 `conversationStatus`, 질문 payload의 `questions`·`issues` 또는 `errors`를 표시한다. 최종 JSON은 기존 `workflow` 필드다. 주소·credential 생략 시 기존의 명시적 배포 placeholder 정책이 적용되므로 생성 완료가 즉시 실행 가능함을 뜻하지는 않는다.

## 검증과 재개

질문에는 호출 ID, 문서 ID·snapshot·operationRef, 요청 Pointer, OAS 스키마·버전이 들어 있다. 호스트는 checkpoint의 질문을 검증 근거로 보관해야 하며 클라이언트가 다시 보낸 스키마를 신뢰하면 안 된다.

틀린 타입은 변환하지 않고 `invalid-answer` 문제로 표시한다. 일부만 답하면 유효한 값은 보관하고 나머지만 질문한다. 미등록·중복 질문 ID와 오래된 문서 식별자는 자동 복구하지 않는다. 확정값은 모델 스키마에서 제외하고 코드로 합친다. 다른 값 덮어쓰기, bindings와의 중복, 희소 배열의 빈 칸 채우기는 오류다.

자연어 추출 모델은 코드가 제공한 JSON 후보 ID 또는 따옴표 밖 텍스트의 시작·끝 토큰 ID를 선택한다. `sourceFormat`·`sourceText`와 실제 값은 코드가 최초 원문에서 해석한다. 따옴표 문자열의 내부나 숫자 토큰의 일부는 독립 선택지로 제공하지 않는다. 역순·다른 텍스트 구간·알 수 없는 ID는 거절한다. 자연어 숫자를 변환하거나 여러 문장에서 객체를 새로 합성하지 않는다. 그런 경우 명시적 JSON이나 폼 답변이 필요하다. 원문 존재 검사가 필드 매핑의 의미적 정확성까지 증명하지는 않는다. [공통 추출 계약](api-input-answer-extraction.md)을 참고한다.

질문 node에는 모델 호출이 없다. 자연어 추출은 별도 checkpoint node에서 실행한다. interrupt 재개로 앞선 API 선택·native 계획·답변 추출을 다시 호출하지 않는다. 질문과 무관한 새 업무 요청을 기존 프롬프트에 몰래 붙이지 않는다. 업무 범위 변경·완성된 계획 수정은 호스트의 명시적 새 계획 요청으로 처리한다.

## 복수 API 선택 계약

0.3.7은 API 질문의 선택 방식과 개수 범위를 명시하는 계약을 제공한다. 소스·공개 배포·호스트 검증 범위는 [릴리스 기록](releases/0.3.7.md)에서 별도로 확인한다.

기존 `operation-choice`는 하나를 고르는 질문이다. 답변은 기존처럼 `{ questionId, operation }`이다. 새 `operation-multiple-choice`는 함께 사용할 API를 고르는 질문이며 `minSelections`와 `maxSelections`를 반드시 제공한다. 답변은 `{ questionId, operations: [...] }`이다. 각 operation은 질문에 제시된 원래 key를 사용한다.

예를 들어 후보가 네 개이고 범위가 3~4개라면 세 개 또는 네 개만 제출할 수 있다. 중복 후보, 오래된 snapshot, 다른 질문의 후보, 범위 밖 개수와 잘못된 답변 형식은 거절한다. 빈 선택은 원래 질문의 최소 개수가 0인 경우에만 허용한다. 선택 배열의 순서는 워크플로우 실행 순서를 뜻하지 않는다.

`resolveApiOperationChoiceAnswer({ question, answer })`는 해당 질문의 답변 형식·범위·중복·후보 일치를 동기적으로 검사한다. 호스트는 interrupt를 소비하기 전에 이 함수를 사용할 수 있다. 전체 카탈로그의 현재 snapshot 확인과 선택 적용은 `resolveApiSelectionAnswers`가 담당한다. 두 함수 모두 모델을 호출하지 않는다.

질문을 생성하는 모델은 단일·복수 선택을 구조화된 필드로 구분한다. 코드가 질문 문구를 분석해 복수 선택으로 바꾸거나 개수를 추측하지 않는다. 호스트는 그 필드에서 조작 방식과 개수 안내를 만든다. 기존에 저장된 단일 질문을 자동 변환하지 않으며, 질문 문구의 의미까지 스키마가 증명하지는 않는다.

## 독립 OSS API

- `analyzeApiSelection`: 기존 선택기와 별도로 선택 API·API 부재·역할 선택 질문을 반환한다.
- `resolveApiSelectionAnswers`: 제시한 후보와 현재 OAS snapshot을 확인한다.
- `inspectApiArgumentRequirements`: OAS·값·bindings에서 필수 입력과 질문 스키마를 계산한다.
- `validateApiInputAnswers`: 질문 ID·타입·제약을 검사해 확정 입력을 반환한다.
- `applyConfirmedApiInputs`: 호출·문서·Pointer를 확인하고 확정값을 충돌 없이 적용한다.
- `generateApiArguments`: 선택적 `confirmedInputs`를 받으며 남은 리터럴 결정만 모델에게 보낸다.
- `extractApiInputAnswers`, `createApiInputAnswersSchema`: OAS 답변 출력 계약과 원문 대조를 제공한다. 폼에는 필요 없다.

확정 입력 한 항목은 `{ callId, operation, targetPointer, value }`다. 호출 ID가 같아도 snapshot이 다르면 재사용하지 않는다. 일반 오류·잘못된 OAS·모델 출력 오류를 정상 질문으로 숨기지 않는다.

## 테스트의 의미

입력 확보와 업무 성공 기준 확보는 다르다. 짧은 조회 요청에 주소·로그인 이력 API를 붙이거나 모든 `code`를 0과 비교하지 않는다. 계약 검사·업무 비교 정책은 호스트가 명시한다. 모델이 만든 API·native 조건·bindings는 최종 검토한다.

회귀 검사는 잘못된 답변 재질문, 확정값 보존, OAS 변경, API 선택 질문, 취소, thread 분리와 재개 시 호출 수를 확인한다. 실제 모델·격리 n8n 결과는 별도로 기록하고 소규모 알려진 계약 사례를 일반 정확도로 확대하지 않는다.

### 2026-10-17 실제 모델·실행 확인

두 실제 OAS의 176개 후보를 제공하고 같은 짧은 회원 조회 요청을 세 가지 대화 경로로 확인했다. 최초 구현은 2/3이었다. 세 번째 실행에서 모델이 사용자가 주지 않은 식별자를 생성해 질문을 건너뛰었다. 그 실행은 실패로 보존했다.

대화형 입력을 `confirmed-only` 경계로 바꾸고 자연어 답변의 원문 대조를 추가한 뒤 별도 실행에서 폼·자연어·잘못된 타입 후 수정의 3/3 경로가 통과했다. 모델 호출은 각각 4·5·4회였으며 파라미터 생성 모델 호출은 없었다. 잘못된 폼 답변의 재질문에도 앞선 모델 단계를 반복하지 않았다. 세 workflow는 격리 n8n 2.37.10에서 계약 서버만 한 번씩 호출했다. 실서비스 호출이나 원격 n8n 변경은 없었다.

이는 같은 알려진 조회 계약의 대화 경로 검사다. 새로운 서비스의 일반 정확도, 임의의 업무 확장 대화, 모든 질문의 적절성을 증명하지 않는다. 최초 실패와 보강 후 결과를 합쳐 새 성공률로 표현하지 않는다. 모델 원문·사내 OAS·workflow와 실행 로그는 공개하지 않는다.

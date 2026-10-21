# 검토 경계의 후속 제안과 명시적 채택

기본 후속 제안은 공개 npm `0.3.3`부터 제공하며 출처 구분·사용자용 문장 지시는 공개 `0.3.4`에 포함되어 있습니다. 서버나 필수 LangGraph를 추가하지 않습니다. 호스트가 원하는 검토 지점에서 공통 함수를 호출합니다. 원래 선택지에서 답변을 도출하는 새 경로는 공개 `0.3.5`에 포함되어 있습니다. 게시·호스트 설치 상태는 [0.3.5 릴리스 기록](releases/0.3.5.md)에서 별도로 확인합니다.

`suggestWorkflowReviewFollowUps`는 현재 질문이나 검토 대상에 맞는 후속 메시지를 제안합니다. 제안을 표시하거나 워크플로우를 승인하는 것만으로는 그 제안을 채택하지 않습니다. 사용자가 실제 제안 ID를 선택하면 `adoptWorkflowReviewSuggestion`이 명시적인 채택 기록을 만들고, 호스트가 이를 요구사항 수정으로 전달합니다. 그 뒤 기존 OAS·native·입력·DAG 검사를 다시 거칩니다.

## OSS 호출 계약

```ts
import {
  readWorkflowReviewSuggestionLimits,
  adoptWorkflowReviewSuggestion,
} from '@openapi-flow/core';
import { suggestWorkflowReviewFollowUps } from '@openapi-flow/langchain';

const input = {
  context, // 원본 OAS·native 선언과 실제 대화 메시지
  boundary, // 호스트가 검증한 현재 검토 대상의 읽기 전용 데이터
  limits: readWorkflowReviewSuggestionLimits(process.env),
  options: { includeExplanations: true, includeExtensions: true },
};
const review = await suggestWorkflowReviewFollowUps({ ...input, model });

// userSelection은 화면에서 받은 현재 review의 실제 제안 ID입니다.
const adoption = adoptWorkflowReviewSuggestion({
  ...input,
  review,
  suggestionId: userSelection.suggestionId,
  messageId: userSelection.messageId,
});
// adoption은 수정 결과가 아닙니다. 호스트가 명시적인 후속 요청으로 처리합니다.
```

환경변수 예시는 `OPENAPI_FLOW_REVIEW_MAX_SUGGESTIONS=3`입니다. 환경변수가 없으면 오류를 내며 값을 대신 정하지 않습니다. 이는 화면의 제안 개수 예산이지 OAS·API 수용 제한이 아닙니다. 예산을 넘긴 결과는 거절하고 잘라내지 않습니다. 유용한 제안이 없으면 `suggestions: []`가 정상입니다.

설명과 관련 업무 확장은 각각 선택 옵션이며 기본값은 활성입니다. 설명을 끄면 모델 출력 스키마에서 `reason`을 뺍니다. 확장을 끄면 `extend-workflow` 분기를 뺍니다. 문장의 의미까지 이 분류에 맞는지는 별도 품질 평가가 필요합니다.

`boundary`에는 호스트 소유의 `key`, 검토 종류, 현재 `revision`, 실제 질문 목록과 읽기 전용 `data`를 전달합니다. 종류는 `requirements-clarification`, `selection-review`, `planning-questions`, `candidate-review`입니다. 이 데이터는 실행 계획이나 새 OAS 계약이 아닙니다. 호스트가 원래 단계 결과를 검증한 뒤 필요한 정보만 투영해야 합니다. Core는 제공된 검토 데이터·원본 재료·설정의 일치 여부를 검사하며, 출처 문장의 의미가 모든 주장을 입증한다고 보장하지 않습니다.

`0.3.4`의 모델 전송은 `boundary.contentRole: 'review-material-not-user-intent'`를 코드가 붙입니다. 현재 후보의 목적·대기 질문·미승인 초안은 검토 자료이며 사용자가 이미 요구한 사항이 아닙니다. 시스템 지시와 `text`·`reason` 필드 설명도 원래 메시지·확정 답변과 검토 자료를 구분하도록 명시합니다. 사용자용 문장은 요청 언어를 따르고 내부 후보·질문·메시지 ID는 구조화된 근거에서만 선택하도록 안내합니다. 실제 API 식별자·사용자 값은 바꾸지 않습니다. ID를 정규식으로 제거하거나 출력 문장·근거 인용을 고치지 않으며, 새로운 OAS 수용 제한·문자열 금지 규칙·추가 모델 호출도 넣지 않습니다. 이는 모델 지시 보강이지 의미 정확도나 내부 ID 미출력의 결정적 보증은 아닙니다.

## 모델과 코드의 역할

모델은 제안 문장, 종류, 관련 질문 ID, 근거와 선택적 이유만 만듭니다.

- `answer-question`: 현재 질문에 대한 답변 후보. 실제 질문 ID와 그 질문을 가리키는 근거가 필요합니다.
- `change-request`: 기존 요구의 명시적 수정 제안.
- `extend-workflow`: 제공된 OAS·native 재료에 근거한 관련 업무 확장 제안.

메시지 근거는 모델이 ID만 고르고 코드가 캡처한 원문을 붙입니다. OAS 근거는 후보 ID를 원래 문서·스냅샷·작업 키와 연결합니다. Native 근거는 실제 선언한 capability 이름만 허용합니다. `review-question`은 실제 미확정 질문을 가리키며, 사용자의 답변을 뜻하지 않습니다.

Core는 검토·제안 ID와 fingerprint를 발급합니다. 없는 질문·출처, 중복 제안·근거, 변경된 원문·재료·리비전, 수정된 제안 내용이나 ID는 거절합니다. 이유는 사용자에게 보여 줄 짧은 설명이며 내부 추론 과정이 아닙니다. 기본값·변환·인용문 보정·모델 재시도는 추가하지 않습니다.

`adoption.message`는 `user-adopted-workflow-review-suggestion` 종류의 JSON 기록입니다. 원래 사람이 직접 쓴 문장으로 위장하지 않으며, 어떤 검토에서 어떤 모델 제안을 사용자가 채택했는지 구분합니다. 채택 기록만으로 파라미터·바인딩·연결을 적용하거나 워크플로우를 실행하지 않습니다. 사용자의 인증과 선택 권한은 호스트 책임이며 ID·fingerprint는 인증 서명이 아닙니다.

## 원래 선택지에서 답변 도출 (0.3.5)

선택형 질문은 `WorkflowReviewQuestion.answer`로 원래 `single-choice` 또는 `multiple-choice` 계약을 전달할 수 있습니다. `choices`에는 원래 선택지의 `id`와 `label`만 전달합니다. 필드를 생략하면 선택형이라고 추측하지 않고 기존 자유 서술 경로를 유지합니다. API를 고르는 질문처럼 원래 계약이 다른 경우도 표시명만 보고 이 계약으로 바꾸지 않습니다.

모델 출력은 다음 형태입니다. ID는 설명용 예시이며 실제 전송 스키마는 전달받은 질문·선택지에서 생성합니다.

```json
{
  "suggestions": [
    {
      "kind": "answer-choice",
      "questionId": "current-question",
      "choiceIds": ["original-second-choice"]
    }
  ]
}
```

설명을 켜면 `reason`도 받습니다. 이 분기에는 모델이 `text`, `sources`, `labels`, `questionIds`, `choiceReply`를 작성할 필드가 없습니다. 단일 선택은 정확히 하나, 복수 선택은 원래 선택지 수 이내의 서로 다른 ID를 허용합니다. 선택지 ID와 개수는 전송 스키마에도 반영하고 중복 검사는 응답 수신 후 Zod 검증에서도 수행합니다. 유용한 제안이 없는 `suggestions: []`는 계속 정상입니다.

Core의 `createWorkflowReviewChoiceSuggestion`이 원래 질문·표시명으로 문구를 만들고, 원래 `WorkflowClarificationReply`에서 가져온 단일/복수 선택 타입으로 `choiceReply`를 만듭니다. `review-question` 출처도 코드가 붙입니다. `createWorkflowReviewSuggestions`는 문구·답변·출처가 같은 원본에서 도출됐는지 다시 검사합니다. 알 수 없는 ID, 변경된 선택지, 잘못된 개수나 덧붙인 모델 필드는 거절하며 추측·기본값·문자열 정리로 수정하지 않습니다. 원래 표시명에 ID처럼 보이는 문자열이나 공백이 있어도 그대로 보존합니다.

사용자가 제안 ID를 명시적으로 채택하면 수신 기록에도 `choiceReply`를 보존합니다. 제안 생성은 답변 제출이 아니며 채택 기록도 승인·실행·API 바인딩이 아닙니다. 호스트는 현재 검토 종류와 원래 답변 계약을 확인한 뒤 자신의 재개 경로를 호출해야 합니다. API 선택을 표시명과 매칭하거나 근거 문장의 API를 확정 선택으로 취급하지 않습니다. 공식 LangGraph 참고 예제는 초기 구체화 단계의 원래 선택지를 제안 입력에 전달하지만 기존 요구사항 수정·계획 검사를 유지합니다.

이 경로는 특정 서비스에 대한 예외가 아닙니다. 명시적으로 전달한 선택형 질문 전체에 적용되며 자유 서술·변경/확장 제안·이유의 의미 정확도까지 보장하지 않습니다. 별도 호스트는 공개 `0.3.5` 설치와 원래 선택지 전달 검사를 통과했습니다. 이후 같은 최초 요청·원본 34개 작업을 사용한 실제 모델·화면의 구체화 경계에서도 선택형 제안 3개의 내부 질문·선택지 ID 노출이 없었습니다. 일반/디버깅 표시·새로고침 뒤 캐시 재조회·추가 모델 호출과 상태 변경 없음도 확인했습니다. 이 한 관찰은 API 선정 의미 품질·정식 제안 채택·workflow 생성이나 실행을 검증한 결과가 아닙니다. 전체 호스트 287개 회귀와 실제 모델 두 호출도 구분합니다.

## 잘못된 모델 결과와 호스트 정책

후속 제안은 유효한 여러 선택·문장·빈 제안 목록을 허용합니다. 잘못된 출력은 `WorkflowReviewSuggestionPlanningError`의 `proposal-schema`, 변경된 원본·잘못된 출처는 `source-validation` 단계와 원래 출력·원인으로 구분합니다. 모델 HTTP 오류는 전송 오류로 유지합니다. 라이브러리는 원래 검토를 승인하거나 데이터를 고치지 않으며 자동 재시도·기본값 선택·다른 API 대체를 하지 않습니다. 상세 출력과 원인은 호스트의 비공개 진단용이며 화면에 원문을 그대로 보내면 안 됩니다.

호스트가 어떤 오류를 재계획할지, 몇 번 시도할지, 언제 중단할지 결정해야 합니다. 모델의 잘못된 계획과 실제 사용자 정보 부족은 구분해야 합니다. 원래 검토가 유효하면 후속 제안 실패만으로 검토를 승인하거나 제안을 필수화할 이유가 없습니다. 현재 코드가 이 구분의 오류 정보를 제공한다는 사실과 호스트의 일반 재계획 루프가 완성됐다는 주장은 다릅니다.

## LangGraph 예시 연결

[정본 초안 호스트](workflow-draft-conversation-host.md)의 선택 옵션은 다음과 같습니다.

```ts
const graph = createWorkflowDraftConversationGraph({
  context,
  model,
  checkpointer,
  name: '회원 조회',
  reviewPolicy: 'review',
  includeExplanations: true,
  reviewSuggestions: {
    limits: readWorkflowReviewSuggestionLimits(process.env),
    includeExtensions: true,
  },
});
```

호스트는 초기 질문·재료 선택·계획 중 질문·최종 검토의 실제 중단 지점마다 새 제안을 별도 노드에서 체크포인트에 저장합니다. `interrupt()` 노드는 모델을 호출하지 않습니다. 잘못된 답변이나 오래된 토큰으로 재개하면 같은 질문을 다시 표시하며 앞선 모델 호출을 반복하지 않습니다. 옵션을 생략하면 제안 모델을 호출하지 않고 기존 경로를 유지합니다. 자동 모드는 선택·최종 검토를 강제로 추가하지 않지만 미확정 질문에서는 계속 멈춥니다.

화면에는 `reviewSuggestions`와 다음 채택 응답을 제공합니다.

```json
{
  "action": "adopt-suggestion",
  "token": "<현재 검토 토큰>",
  "reviewId": "<표시된 검토 ID>",
  "suggestionId": "<사용자가 선택한 실제 제안 ID>",
  "messageId": "<새로운 사용자 동작 ID>"
}
```

호스트가 보관한 원본 제안으로 검증하므로 화면에서 제안 문장이나 계획 객체를 다시 제출하지 않습니다. `approve`, 초기 질문의 `answer-clarification`, 직접 수정하는 `revise`와는 별도 동작입니다. 선택하지 않은 확장 제안은 요구사항에 들어가지 않습니다.

채택 후에는 이전 계획·준비 결과를 보존하고 요구사항을 명시적으로 재분석합니다. `confirmedAnswerMessageIds`로 검증한 기존 질문의 확정 답변은 다음 요청에서도 출처와 함께 이어갑니다. `defer`는 여기에 포함하지 않습니다. 원문이나 라운드가 변경된 답변 기록도 거절합니다. 임의의 옛 결과를 새 계획에 재배치하거나 같은 이름의 필드를 자동 매핑하지 않습니다.

`reviewSuggestionHistory`에는 제안 원본과 당시 질문·검토 대상 `target`이, `suggestionAdoptions`에는 사용자의 명시적 채택이 남습니다. 재분석 후에도 질문 ID가 가리킨 원래 내용을 확인할 수 있습니다. 최종 JSON·한글 안내·입력 슬롯은 기존의 채택·검증을 통과한 같은 리비전에서 반환합니다. 이력이 있다고 프로세스 재시작 복구나 같은 thread의 동시 요청 안전성이 생기는 것은 아닙니다. 저장 수명·정리·동시 요청 제어는 호스트 책임입니다.

## 검증과 남은 범위

회귀 검사는 [Core·모델 경계](../test/workflow-review-suggestions.test.mjs), [실제 ChatOpenAI 전송](../test/workflow-review-suggestions-http.test.mjs), [MemorySaver 대화](../test/workflow-review-suggestions-conversation.test.mjs)에 있습니다. 결정적 대화는 두 번째 선택지를 명시적으로 채택하고 재분석·검토 후 원본 응답을 후속 요청에 전달합니다. `npm run test:review-suggestions-local-n8n`은 이 경로의 SDK JSON을 격리 n8n에서 실행합니다.

선택형 분기의 [집중 회귀](../test/workflow-review-choice-suggestions.test.mjs)는 단일/복수 선택·틀린 ID·중복·선택지 원문과 순서 보존·변경된 문구/원본 거절을 확인합니다. 실제 ChatOpenAI HTTP 전송 회귀는 표시 필드가 없는 동적 스키마와 중복 응답의 원인 보존·한 번 호출을 확인합니다. MemorySaver 회귀는 원래 선택 계약과 제안이 체크포인트에 저장되어도 답변·채택·승인으로 바뀌지 않음을 검사합니다.

2026-10-21 미게시 작업 소스의 별도 실제 Chomsky 평가에서는 이전 실패 때의 질문·세 선택지와 원본 34개 작업을 그대로 사용했습니다. 설명 켜기·끄기의 독립 호출 각 1회에서 선택형 제안 1개씩을 받아 코드가 표시 문구를 도출했고 관찰한 문구에는 내부 질문/선택지 ID가 없었습니다. 입력은 바뀌지 않았고 제안 채택·호스트 화면·API 선정·새 workflow·업무 API/n8n 실행은 하지 않았습니다. 두 관찰은 일반 선택 정확도나 모든 제안 문장의 안전성을 증명하지 않습니다. 원래 실패 결과는 유지했습니다.

같은 작업 소스와 최종 `0.3.5` 버전의 전체 회귀는 각각 1,171개 중 1,170개 통과이며 승인된 기존 Ajv `properties.__proto__` 실패 1개를 그대로 유지했습니다. 새 실패·건너뛰기·취소는 없습니다. 원본 OAS 기반 검사 52개, strict TypeScript·`skipLibCheck: false` 독립 tarball 소비자, 타입·lint·포맷·도식 검사가 통과했습니다. 독립 소비자는 새 공개 선택 스키마·타입·답변·채택 수신 기록도 검사합니다. 별도의 결정적 대화는 격리 n8n 2.37.10에서 합성 계약 서버 HTTP 2회까지 통과했으며 위 실제 모델 평가와 구분합니다. 사전 검증 시점에는 소스 동기화·새 버전 게시·Qoopilot 설치·화면 연결을 하지 않았으며 최신 상태는 릴리스 기록에서 구분합니다.

2026-10-21 공개 `0.3.3`을 사용한 별도 호스트 평가에서, 모델이 미승인 API 후보의 “캐시된 상품 정보” 설명을 사용자 요구처럼 인용하고 `candidate-20`을 제안 문장에 넣는 사례를 관찰했습니다. 변경되지 않은 실제 요청은 상품 한 개의 정보 조회만 요구했습니다. 검토·제안 조회의 불변성은 확인했으나 제안의 의미·표시 품질은 통과로 처리하지 않았습니다. 전송 회귀는 수정 전 지시 누락으로 실패한 뒤 수정 후 통과했고 Core·ChatOpenAI 전송·MemorySaver 집중 9개도 통과했습니다.

공개 `0.3.4`를 설치한 새 실제 모델·화면 평가에서도 구체화 제안 3개 모두 문장에 내부 질문 ID를 노출해 표시 품질은 실패했습니다. 선정 검토의 제안 1개는 내부 ID가 없었고 캐시 조회는 아직 확정되지 않았다고 이유에서 구분했으나, 이 관찰을 일반적인 성공률로 확대하지 않습니다. 같은 최초 요청·원본 34개 작업을 사용했고 검증용 명시적 상세 조회 답변 뒤에도 API 선정이 캐시 조회를 제안해 승인하지 않았습니다. 두 검토의 제안 조회·중복 조회·새로고침과 잘못된 대상 거절은 원래 대기 상태를 바꾸거나 모델을 추가 호출하지 않았습니다. 총 모델 4회 중 제안은 2회였으며 새 workflow·업무 API/n8n 실행은 없었습니다. 출력 보정·자동 재시도 없이 실패를 보존했습니다. [0.3.4 기록](releases/0.3.4.md)에서 게시·설치·회귀와 실제 품질을 구분합니다. 회사 원본 OAS·인증·호스트 소스는 이 공개 기록에 포함하지 않습니다.

제안의 의미 정확도, 모든 요구사항 교체의 수명주기, 변경하지 않은 단계의 안전한 재사용, 늦게 준비되는 native 재료와 넓은 실제 모델 품질 평가는 남아 있습니다. 현재 채택은 세부 결정을 모델 없이 곧바로 패치하는 방식이 아니라 명시적인 요구사항 수정입니다. 그래서 독립 단계도 다시 계획될 수 있습니다. [구현·검증 기록](conversational-oss-implementation.md)에서 실제 모델 실행과 결정적 테스트를 구분합니다.

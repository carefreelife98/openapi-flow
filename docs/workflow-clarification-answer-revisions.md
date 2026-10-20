# 확정 답변 변경과 질문 재개

현재 구체화 라운드에서 이미 확정한 답변을 바꾸거나 질문을 다시 엽니다.
상태 변경은 Core가 처리하며 LLM을 호출하지 않습니다. 이후 API 선택·값·연결의
재설계에는 기존 모델 단계를 사용합니다. npm 0.2.0에는 포함되지 않습니다.

## 호출 계약

`resolveWorkflowClarificationReplies`는 미답변·보류 질문에 답하는 함수입니다.
이미 확정한 답을 다시 보내면 실패합니다. 이를 바꾸려면
`reviseWorkflowClarificationAnswers`에 실제 현재 질문 ID와 변경 내용을 전달합니다.

- `replace-answer`: 원래 질문 형식에 맞는 새 답변으로 교체
- `reopen-question`: 기존 답변과 확정 사실을 현재 상태에서 제거하고 미답변으로 변경

`replace-answer`에 `kind: 'defer'`를 전달하면 명시적인 보류입니다.
질문 재개 후에는 원래 질문에 답하거나 보류해야 하며 코드가 이전 답이나
첫 선택지를 넣지 않습니다. 텍스트·단일·복수 선택은 원래 계약으로 검사합니다.

```ts
import {
  describeWorkflowClarificationAnswerRevision,
  reviseWorkflowClarificationAnswers,
  validateWorkflowClarificationAnswerRevision,
} from '@openapi-flow/core';

const description = describeWorkflowClarificationAnswerRevision(context);
const result = reviseWorkflowClarificationAnswers({
  context,
  fingerprint: description.fingerprint,
  messageId: submittedMessageId,
  changes: [{ kind: 'reopen-question', questionId: submittedQuestionId }],
});

// 저장한 기록도 호스트가 보관한 변경 전 원본 문맥으로 검증합니다.
validateWorkflowClarificationAnswerRevision({ context, revision: result.revision });
const nextContext = {
  ...context,
  messages: result.activeMessages,
  clarification: result.revision.after,
};
```

`context`에는 원래 질문 메시지와 현재 `clarification`·답변 근거가 있어야
합니다. 클라이언트가 보낸 `revision.before`로 신뢰할 수 있는 문맥을 대체하면
안 됩니다. 오래된 fingerprint, 없는 질문·선택지, 중복 대상, 같은 답을 다시
넣는 변경, 이미 사용한 메시지 ID는 실패합니다. 한 항목이 잘못되면 전체
변경을 반환하지 않으며 원본 문맥을 수정하지 않습니다.

`revision`에는 코드가 만든 ID, 변경 전·후 라운드와 해석 결과, 변경 명세,
사용자 변경 기록, 대체된 답변 근거 ID가 있습니다. 기록의 본문은
`explicit-clarification-answer-revision`이며 사용자가 직접 쓴 자연어가 아닙니다.
`activeMessages`는 대체된 정본 답변 근거를 제외하고 현재 근거·새 기록을
연결합니다. 호스트가 따로 만든 제출 봉투가 있다면 그 수명도 ID로 추적해야
합니다. 코드는 임의 대화문에서 옛 답을 추측하지 않습니다.

## LangGraph 예시

[정본 호스트](workflow-draft-conversation-host.md)는 현재 검토 토큰과 함께
다음 동작을 받습니다. 실제 현재 질문 ID와 새 메시지 ID를 사용합니다.

```json
{
  "action": "revise-clarification",
  "token": "<current-review-token>",
  "messageId": "<new-human-action-id>",
  "changes": [{ "kind": "reopen-question", "questionId": "<current-confirmed-question-id>" }]
}
```

원래 질문 화면·재료 선택·설계 중 질문·최종 후보 검토에서 현재 확정 답변을
바꿀 수 있습니다. 잘못된 입력은 문제를 화면에 돌려주며 모델 호출이나 계획
변경을 일으키지 않습니다. 질문 재개는 원래 질문 화면으로 돌아갑니다.

호스트는 전체 `messages`와 `clarificationAnswerRevisions`를 기록으로 유지합니다.
이전 정본 답변 근거·원래 답변 제출 메시지·이전 변경 메시지는
`inactiveClarificationMessageIds`로 추적해 현재 모델 입력에서 제외합니다.
설계 모델·다음 구체화의 배경·선택적 후속 제안 모델에 같은 규칙을 적용하며
필드명이나 본문 내용을 비교해 제거하지 않습니다.

새 답변을 확정할 때도 같은 수명 관리 함수를 사용합니다. 이미 처리한
`reopen-question` 제출 기록은 감사 이력에만 남기므로 모델이 새 확정 답변을
다시 미답변으로 해석하지 않도록 현재 근거에서 제외합니다. 여러 질문을
한 번에 제출한 경우에도 변경하지 않은 질문의 정본 답변 근거는 보존합니다.

같은 답을 명시적으로 다시 선택하면 같은 내용의 근거 ID가 재사용되고 다시
활성화될 수 있습니다. 별도 변경 ID와 전후 기록은 남으므로 답변 내용의 ID와
사용자 동작 이력을 구분합니다. 이전 준비 결과와 후보는 이력에 보존하고
현재 계획·후보·승인은 초기화합니다. 옛 후보를 적용하거나 연결을 자동 복구하지
않으며 최종 승인 전 OAS·범위·DAG 검사와 SDK 컴파일을 다시 거칩니다.

## 검증과 범위

회귀 검사는 포함 → 제외 → 질문 재개 → 명시적 포함, 무효 근거의 모델 입력
제외, 원본·제출 기록 보존, 잘못된 재개의 무호출과 원래 답변 계약을 검사합니다.

```sh
npm run build
node --test test/workflow-clarification-answer-revision*.test.mjs
npm run test:clarification-answer-revision-local-n8n
```

별도 호스트의 인증·대화 수명·동시 요청·제출 기록 관리는 호출자 책임입니다.
ID와 fingerprint는 상태 일치 검사이며 인증 서명이 아닙니다. 원본 OAS·질문·
선택지·본문 타입을 바꾸거나 새 workflow·실행값을 만들지 않습니다.

현재 라운드의 질문 답변 수명을 다룬 기능입니다. 완료된 이전 턴의 임의
요구사항을 자연어로 자동 대체하는 기능, 모든 사실·요구사항의 일반적인 교체
이력, 변경과 무관한 모델 단계의 안전한 재사용은
[전체 구현 기록](conversational-oss-implementation.md)에 남아 있습니다.

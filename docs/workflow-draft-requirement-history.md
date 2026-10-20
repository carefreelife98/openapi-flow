# 요구사항 변경 이력과 현재 근거

이 문서의 API는 미배포 소스이며 npm 0.2.0에는 없습니다.

`requirements`에는 현재 요구사항을 두고 `requirementHistory`에는 생성·수정·삭제·
복원을 기록합니다. 이력의 ID·버전·이전 항목·변경 전후 상태·메시지 인용은
Core가 실제 변경과 선언된 메시지에서 만듭니다. LLM의 출력 항목이 아닙니다.

## 현재 요구사항과 과거 상태

자연어 계획과 공식 대화 예시도 `restore-requirement`를 지원합니다. 마지막 이력이 삭제인 ID만 선택하고 새 필드는 명시적으로 확인받습니다. [복원 계약](workflow-draft-requirement-restoration.md)을 참고하세요.

`createWorkflowDraft`는 제공한 현재 요구사항에서 버전 0의 생성 이력을 만듭니다.
`applyDraftChangeSet`은 실제 요구사항 변경마다 이력을 추가합니다. 승인이나 API 값
변경만 있었다면 요구사항 이력의 버전 번호가 연속하지 않을 수 있습니다.
한 트랜잭션에서 여러 번 바꾼 경우에도 실제 순서대로 기록합니다.

`sourceMessageIds`는 현재 상태를 뒷받침하는 근거입니다. 수정 후 과거 ID를 여기에
자동으로 합치지 않습니다. 과거 문장·상태·범위·근거는 이전 이력에 남습니다.
`origin`은 최초 구체화 사실·질문의 생성 계보이며 최신 값의 근거를 대신하지 않습니다.

`remove-requirement`는 현재 목록에서 요구사항을 제거하고 삭제 이력을 남깁니다.
같은 ID를 명시적으로 다시 설정하면 복원으로 기록합니다. 복원할 문장·상태·범위와
근거는 호출자가 제공해야 하며 과거 값을 임의로 복사하지 않습니다.

```ts
const result = applyDraftChangeSet({
  draft,
  context, // 원래 근거와 철회 메시지가 모두 선언되어 있어야 합니다.
  changeSet: {
    baseRevision: draft.revision,
    changes: [{
      kind: 'remove-requirement',
      requirementId: selectedRequirementId,
      sourceMessageIds: [withdrawalMessageId],
    }],
  },
});

const audit = describeWorkflowDraftRequirementHistory({
  draft: result.draft,
  context,
});
// audit.entries, audit.current, audit.removed
```

이 함수는 API·native 노드·연결을 제거하지 않습니다. 그 변경에는 별도 결정을
제공해야 합니다. 영향 분석과 승인 무효화는 바뀐 요구사항의 기존·새 범위와
관련 소비자를 기준으로 계속 계산합니다.

## 전체 기록과 모델 입력의 분리

`context.messages`는 선언된 전체 기록입니다. `planningMessageIds`를 명시하면
그 ID만 계획 모델의 현재·배경 메시지와 근거 선택에 들어갑니다. 생략하면 기존
계약대로 제공한 메시지 전체를 허용합니다. 알 수 없는 ID나 중복은 실패합니다.
과거 기록의 빈 문자열은 그대로 보존하지만 실제 모델 입력으로 선택한 메시지의
본문은 비어 있으면 실패합니다. 전체 기록과 현재 입력에 서로 다른 계약을 적용합니다.

과거 메시지를 현재 모델 입력에서 제외하더라도 이력 검사에는 원문이 필요합니다.
감사 기록에서 그 메시지를 지우거나 같은 ID의 텍스트를 바꾸면 검사가 실패합니다.
요구사항 하나를 바꿨다고 메시지 전체를 자동으로 폐기하지 않습니다. 같은 메시지에
다른 요구가 있을 수 있기 때문입니다. 호스트는 알려진 답변 수명이나 명시적 정책으로
활성 목록을 관리합니다. 기본 대화 예시는 구체화 답변의 기존 수명 정책을 사용합니다.

```ts
const context = {
  operations,
  capabilities,
  messages: fullTranscript,
  planningMessageIds: currentEvidenceIds,
};
```

이력 검사는 변경 전 상태·직전 항목·현재 목록·원문 인용·ID·버전 순서를 재구성합니다.
해시는 일관성 검사이며 서명이나 사용자 인증이 아닙니다. 호스트가 원본 저장 상태와
접근 권한을 보호해야 합니다. 기록에는 사용자 문장이 있으므로 보관·삭제 정책도
호스트 책임입니다. 별도 DB를 요구하지는 않습니다.

## 계획을 바꾸지 않는 명시적 답변

요구사항 수정 단계의 `requirement` resolution에는 `answerMessageId`가 필요합니다.
Core가 그 ID와 실제 답변 필드에서 `typed-requirement-answer` 메시지를 만듭니다.
현재 요구사항은 수정 요청과 이 답변을 근거로 가지며, 과거 근거는 이력에 보존합니다.
범위는 원래 계획에서 선택한 실제 ID로 제한합니다. 아직 입력을 기다리는 신규 노드도
선택 목록에는 남으며 실행 준비 검사는 별도로 유지합니다. 설명·Zod 답변 스키마와
호스트 질문 형태는 [요구사항 수정 계약](workflow-draft-requirement-edits.md)을 참고하세요.

```ts
import type { PrepareWorkflowDraftEditInput } from '@openapi-flow/core';

const input = {
  ...originalEditInput,
  resolutions: [{
    stepId: selectedStepId,
    kind: 'requirement',
    answerMessageId: submittedHumanActionId,
    text: submittedText,
    state: submittedState,
    scope: submittedScope,
  }],
} satisfies PrepareWorkflowDraftEditInput;
const candidateContext = createWorkflowDraftEditCandidateContext(input);
const candidate = assembleWorkflowDraftEdit(input);
validateWorkflowDraft({ draft: candidate.draft, context: candidateContext });
```

답변 메시지를 감사 근거에 추가해도 원래 계획의 모델 입력 목록과 지문은 유지합니다.
Core는 원래 계획·단계·답변·메시지 충돌을 검사합니다. 이후 후보 검증·미리보기·승인에는
`candidateContext`를 사용합니다. 이 함수는 n8n 컴파일러가 있는 capability 같은 호출자
문맥의 구체적인 타입을 보존합니다.

기본 LangGraph 예시는 `answer-requirement`의 `messageId`를 연결합니다. 잘못된 범위·
단계·중복 ID는 원본 계획과 초안을 유지한 채 질문으로 돌아갑니다. 답변을 적용하려고
의미 분석 모델을 다시 호출하지 않습니다. 모델은 현재 요구사항 ID만 수정·철회 대상으로
선택하며 답변 필드나 이력 ID를 생성하지 않습니다.

## 보류와 실행 상태

필요한 수정 결과가 모두 있고 새 연결 계획이 필요 없는 경우에는 보류 상태를 정본
후보로 저장할 수 있습니다. n8n JSON의 Start는 분리되고 기존 노드·값·연결은 유지됩니다.
미완료 API/native 재료·수리·연결 계획을 완료한 것으로 바꾸지는 않습니다.

사용자가 요구사항만 명시적으로 철회하고 필요한 검토를 마치면 기존 워크플로우를
그대로 실행 가능한 형태로 내보낼 수 있습니다. 자연어 한 문장에서 어떤 조건을
철회하려는지의 의미 판단은 여전히 모델과 사용자 검토가 담당합니다.

## 저장 형식과 검증

새 미배포 정본 형식에는 `requirementHistory`가 필수입니다. `createWorkflowDraft`가
생성하지만 기존 저장 파일에 빠진 이력을 추측해서 채우지는 않습니다. 새 초안을
만드는 `content`에는 정본의 revision·승인·이력 메타데이터를 넣지 않습니다.
이전 미배포 저장 형식에는 명시적인 검토·이관이 필요합니다.

```sh
npm run typecheck
node --test test/workflow-draft-requirement-history*.test.mjs
npm run test:requirement-history-local-n8n
```

검사는 이력 순서·현재 상태·근거·변조 거절, 동일 트랜잭션의 여러 변경, 승인 영향,
현재 메시지 분리와 명시적 답변을 확인합니다. 실행 사례는 기존 native 노드 하나의
목적을 보류한 뒤 철회하는 두 턴 대화입니다. 광범위한 요구사항 의미 분석이나
모든 단계의 설명 품질까지 보장하지 않습니다. 실제 결과는
[구현 기록](conversational-oss-implementation.md)에 남깁니다.

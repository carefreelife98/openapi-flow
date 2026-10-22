# 요구사항 수정과 선택된 노드 범위

기본 API는 공개 0.3.8에 포함됩니다. 아래의 2026-10-22 공통 지시·출력 설명 보강은
아직 미배포 소스이며 설치된 Qoopilot에 적용하지 않았습니다.

## 요구사항 기록 편집을 선택하는 경우

API·native 노드나 입력값·연결을 바꾸는 요청과 요구사항 기록의 문장·상태·범위를
편집하는 요청은 구분합니다. 동작이 바뀌었다는 이유만으로 기록 편집을 덧붙이지
않도록 공통 모델 지시와 `revise-requirement` 출력 스키마 설명을 보강했습니다.
두 변경을 모두 명시한 요청에는 각각의 결정을 사용할 수 있습니다.

이는 자연어 의미 선택을 돕는 설명입니다. 모델이 모든 질의를 정확히 분류한다는
코드 보장은 아닙니다. 코드는 선택된 실제 단계·식별자·출처와 별도 사람 답변을
검사하며, 동작 변경 결정만으로 요구사항 교체 작업을 자동 생성하지 않습니다.
명시적 기록 수정·철회·복원 기능을 없애거나 모델의 결정을 몰래 삭제하지 않습니다.

원본 OAS의 선택 입력도 계약에 있다는 이유만으로 필수 질문이 되지 않습니다.
사용자가 요청한 선택 입력의 값이 미정인 경우에는 원래 API 입력 계획·검사를
유지합니다. 필수값·타입·출처 검사를 생략하거나 임의 값을 넣는 변경은 없습니다.

API를 선택하면 코드가 노드 ID와 원본 OAS 계약을 확정합니다. 요청값이 아직 없다고
그 ID가 없어지는 것은 아닙니다. native 노드도 선택 시점의 ID와 실제 설정·소스 계약의
준비 상태를 구분합니다. 요구사항 범위는 선택된 ID를 사용하고, 실행 준비는 별도로 검사합니다.

## Core가 제공하는 계약

`describeWorkflowDraftSelectedNodes`는 검증한 원본 계획에서 최종 선택된 노드를 설명합니다.
남길 기존 노드, 새 API/native 노드와 교체할 API의 새 OAS 계약을 포함하며 삭제할 노드는
제외합니다. API 요청값이나 native 파라미터를 만들지 않습니다.

`describeWorkflowDraftRequirementEdit`는 특정 `revise-requirement` 단계의 원래 요구사항과
선택된 노드 목록을 반환합니다. 잘못된 단계·오래된 계획·변조한 노드 ID는 실패합니다.
같은 목록과 범위 스키마를 기존 요구사항 구체화 단계에서도 사용합니다.

`createWorkflowDraftRequirementAnswerSchema`는 이 설명에서 명시적 답변용 Zod 스키마를
만듭니다. 범위는 전체 워크플로우 또는 실제 선택된 노드 ID의 목록입니다. 없는 ID,
삭제할 ID, 빈 목록과 중복 ID는 허용하지 않습니다. 별도 LLM 호출은 필요하지 않습니다.

```ts
import {
  describeWorkflowDraftRequirementEdit,
  createWorkflowDraftRequirementAnswerSchema,
  createWorkflowDraftEditCandidateContext,
  stageWorkflowDraftEdit,
} from '@openapi-flow/core';
import type { WorkflowDraftEditResolution } from '@openapi-flow/core';

const description = describeWorkflowDraftRequirementEdit({
  ...originalInput,
  stepId: selectedRequirementStepId,
});
// description.requirement: 원래 요구사항
// description.nodes: 기존·신규 노드의 실제 ID와 원본 계약
const answer = createWorkflowDraftRequirementAnswerSchema(description).parse({
  answerMessageId: submittedHumanActionId,
  text: submittedText,
  state: submittedState,
  scope: submittedScope,
});
const resolution = {
  kind: 'requirement',
  stepId: description.stepId,
  ...answer,
} satisfies WorkflowDraftEditResolution;
const input = {
  ...originalInput,
  resolutions: [...originalInput.resolutions, resolution],
};
const candidateContext = createWorkflowDraftEditCandidateContext(input);
const stage = stageWorkflowDraftEdit(input);
```

화면에서 받은 설명 객체나 스키마 자체를 변경 권한으로 신뢰하지 않습니다.
`createWorkflowDraftEditCandidateContext`와 조립 경계가 원래 계획에서 목록을 다시 만들고
답변을 검사합니다. 호출자가 설명 객체에 임의의 ID를 추가해도 적용 단계에서 거절합니다.
명시적 답변의 출처와 과거 상태는 [변경 이력 계약](workflow-draft-requirement-history.md)을 따릅니다.

## 입력이 없는 API의 예

새 `GET /records/{id}` 노드를 선택했지만 `id`가 없을 수 있습니다. 사용자는 그 새 노드의
코드 배정 ID를 요구사항 범위로 확정할 수 있습니다. 이때도 API 입력 질문은 남고 원래
초안은 바뀌지 않습니다. 미완성 stage는 실행 가능한 초안이나 n8n JSON이 아닙니다.

사람이 `id`를 명시적으로 답하면 원래 API 계약으로 값을 검사하고 같은 계획을 계속
진행합니다. 설정·연결·최종 검사와 검토를 마쳐야 후보를 채택합니다. 이 답변 때문에
API 선택·바인딩·요청값 모델을 다시 호출하지 않습니다. 필요한 연결 계획은 별도 단계입니다.

native 노드의 생산자 계약이 없다면 요구사항 범위를 확정해도 `native-materials` 질문은
계속 남습니다. 가짜 소스·빈 출력 계약·임의 요청값을 만들거나 검사를 생략하지 않습니다.
실행 주소를 제공하지 않은 경우에도 기존 배포 요구 목록과 Start 분리 동작을 유지합니다.

## 기본 LangGraph 예시의 질문

`requirement` 질문의 `requirementEdit`에 원래 요구사항과 실제 선택 목록을 제공합니다.
미배포 예시의 기존 `draftRequirement` 필드는 `requirementEdit.requirement`로 이동했습니다.
선택 목록은 실행 준비 목록이 아니므로 화면에서 이를 구분해 표시해야 합니다.

호스트는 현재 질문·계획·검토 토큰·메시지 ID를 검사한 뒤 Core 스키마를 사용합니다.
잘못된 답변은 원본 초안·계획·이력을 유지한 채 오류로 반환합니다. Core를 직접 사용하는
호출자도 같은 범위 검사를 받으며 LangGraph를 필수로 사용할 필요는 없습니다.

```sh
npm run typecheck
node --test test/workflow-draft-requirement-scope*.test.mjs
npm run test:requirement-scope-local-n8n
```

결정적 모델의 입력 대기·범위 답변·명시적 API 입력·검토·SDK·격리 n8n 실행과 실제 모델의
결과를 구분해 [구현 기록](conversational-oss-implementation.md)에 남깁니다. 실제 모델이
단계별 질문을 일반 질문으로 중복 생성하는 문제나 짧고 모호한 질의의 품질까지 이 계약이
해결한 것은 아닙니다.

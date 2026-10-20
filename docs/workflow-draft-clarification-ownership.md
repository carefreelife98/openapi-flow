# 질문의 담당 단계

이 문서의 API는 미배포 소스이며 npm 0.2.0에는 없습니다.

API의 필수 값이나 요구사항의 대체 문장을 물어야 한다고 해서 전체 업무 의미가
불명확한 것은 아닙니다. 이미 선택한 단계의 질문과 독립적인 의미 확인 질문을 구분합니다.
코드는 질문 문장을 비교하거나 필드 이름을 추측하지 않고 명시적인 소유 정보를 검사합니다.

## 의미 확인과 계획 단계의 구분

`needs-clarification` 결정에는 `owner`가 필수입니다.

- `{ kind: 'semantic', scope }`: 아직 결정하지 못한 업무 의미나 선택입니다. 기존 동작대로 해당 범위에 미확정 요구사항을 만들며, 관련 작업과 최종 실행을 차단합니다.
- `{ kind: 'planning-step', decisionIndex, stage }`: 이미 선택한 결정의 특정 단계가 질문을 담당합니다. 그 단계의 원래 입력·답변·검증 절차를 사용하고 별도의 전역 차단 요구사항을 만들지 않습니다.

`decisionIndex`는 같은 출력의 `decisions` 배열에서 담당 결정을 가리키는 0부터 시작하는
위치입니다. 반복 호출의 역할을 구분하는 참조이며 API 실행 순서가 아닙니다. 노드·단계 ID는
코드가 배정합니다. 없는 위치, 자기 자신, 다른 질문, 값을 계획하지 않는 결정은 거절합니다.

`stage`는 그 담당 결정이 실제로 가진 단계여야 합니다.

| stage | 담당 내용 |
| --- | --- |
| `api-bindings` | API 입력의 생산자·응답 참조 선택 |
| `api-arguments` | API 요청의 실제 리터럴 값 |
| `native-parameters` | native 노드 설정 |
| `requirements` | 요구사항의 명시적 대체 문장·상태·범위 |
| `connections` | 노드·포트 간 연결과 분기·합류 |

API 추가 결정을 `native-parameters` 단계의 담당자로 지정하는 것처럼 실제 계약에 없는
조합은 실패합니다. 검토·승인은 호스트의 별도 정책이며 이 참조가 사람의 승인을 대신하지 않습니다.
변경 때문에 파생되는 소비자 수리 작업도 원래 생산자의 직접 입력 단계와 구분합니다.
native 생산자를 바꿨다고 그 생산자가 API 입력 연결 질문의 담당자가 되지는 않습니다.
API 리터럴 수정은 실제 `revise-api-inputs` 결정, API 참조 수정은 실제
`revise-api-bindings` 결정이나 코드가 도출한 소비자 수리 경로가 담당합니다.

## 출력 형태

다음은 API 추가와 요구사항 수정을 선택한 뒤, 각각의 질문을 해당 단계에 연결한 예입니다.
공통 `sources`는 현재 사용자 요청의 실제 근거여야 합니다. 모델용 스키마에서는 코드가 인용문을 붙입니다.

```ts
import type { WorkflowDraftEditProposal } from '@openapi-flow/core';

const proposal = {
  decisions: [
    {
      kind: 'add-api-call',
      operation: selectedOperation.key,
      instruction: '독립적인 조회 역할을 추가한다.',
      sources,
    },
    {
      kind: 'revise-requirement',
      requirementId: selectedRequirementId,
      instruction: '요구사항을 명시적인 답변으로 수정한다.',
      sources,
    },
    {
      kind: 'needs-clarification',
      owner: {
        kind: 'planning-step',
        decisionIndex: 0,
        stage: 'api-arguments',
      },
      instruction: '누락된 필수 요청값을 사용자에게 받는다.',
      sources,
    },
    {
      kind: 'needs-clarification',
      owner: {
        kind: 'planning-step',
        decisionIndex: 1,
        stage: 'requirements',
      },
      instruction: '대체 문장·상태·범위를 명시적인 답변으로 받는다.',
      sources,
    },
  ],
} satisfies WorkflowDraftEditProposal;
```

전용 질문이 필요하다는 선언을 답변 완료나 실행 준비로 취급하지 않습니다. 요청값이
없으면 원래 OAS 입력 질문이 남고, 요구사항 수정 결과가 없으면 명시적 답변 단계가 남습니다.
재료가 없는 native 노드도 원래 생산자 계약을 계속 요구합니다.

## Core와 호스트의 사용

`describeWorkflowDraftClarificationOwnership`은 원래 계획을 검사하고 질문의 출처,
실제 담당 단계 ID·노드 ID·단계 종류와 지시를 반환합니다. 제공된 선택적 설명과 근거도
그대로 보존합니다. 질문의 답이나 준비 완료 상태를 생성하지 않습니다.

```ts
import { describeWorkflowDraftClarificationOwnership } from '@openapi-flow/core';

const all = describeWorkflowDraftClarificationOwnership(input);
const requestValueConcerns = describeWorkflowDraftClarificationOwnership({
  ...input,
  stepId: selectedApiStepId,
  stage: 'api-arguments',
});
```

필터를 생략하면 전체 질문 소유 목록을 설명합니다. 알 수 없는 단계 ID나 단계 종류는
실패하며 다른 값으로 대신하지 않습니다. `stageWorkflowDraftEdit`의
`clarificationOwnership`에도 전체 목록이 있습니다. 기본 LangGraph 예시는 질문 화면의
같은 필드로 이를 제공합니다.

LangChain 어댑터는 현재 담당 단계의 `planningClarifications`만 모델에 보냅니다.
값 생성 질문을 연결 모델에 다시 전달하지 않습니다. 전체 질문은 원래 계획과 stage에
남으므로 전달 필터가 기록 삭제를 뜻하지 않습니다. 연결 모델은 현재 API 요청값·참조와
native 설정을 받으며, 이전 질문을 새로운 입력 요구로 바꾸는 권한은 없습니다.

질문의 내용이 정말 해당 단계에 속하는지에 관한 의미 판단은 여전히 모델과 사용자
검토가 담당합니다. 코드는 선택된 대상·단계의 존재, 참조 무결성, 원본 계획 일치와
각 단계의 계약을 보장합니다. 이 경계가 자연어 의미의 정확성까지 증명하는 것은 아닙니다.

## 전체 변경 없음의 표현

`no-change`는 전체 요청에 변경이 없다는 뜻으로 하나만 반환합니다. 변경 목록에
유지할 기존 노드마다 `no-change`를 추가하지 않습니다. 관련 없는 노드·값·연결은 코드가 보존합니다.

공통 Zod 스키마와 실제 전송 JSON Schema 모두 다음 둘 중 하나만 받습니다.

- `no-change` 하나로 된 목록
- `no-change`를 포함하지 않는 실제 변경·질문 목록

후처리로 잘못된 항목을 지우지 않습니다. 이 조합은 모델 출력 스키마에서부터 거절하며,
직접 Core를 호출할 때도 같은 검사를 받습니다.

## 저장 형식과 검증

이전 미배포 결정의 최상위 `scope`는 `owner: { kind: 'semantic', scope }`로 이동했습니다.
소유 정보가 없는 예전 저장 계획을 추측해서 이관하거나 담당 단계를 자동 선택하지 않습니다.
소유 정보·순서·ID·지시·근거가 바뀌면 원래 계획 검증이 실패합니다.

```sh
npm run typecheck
node --test test/workflow-draft-clarification-ownership*.test.mjs
npm run test:clarification-ownership-local-n8n
```

관련 경계는 [요구사항 수정](workflow-draft-requirement-edits.md),
[변경 이력](workflow-draft-requirement-history.md),
[API 입력 연결 질문](workflow-draft-api-binding-questions.md)에 설명합니다.
실제 모델 시도와 결정적 검증의 결과는 [구현 기록](conversational-oss-implementation.md)에 구분해 남깁니다.

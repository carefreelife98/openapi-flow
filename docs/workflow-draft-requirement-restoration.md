# 철회한 요구사항의 명시적 복원

미배포 소스 기능이며 npm 0.2.0에는 포함되지 않습니다. 요구사항 이력에는 복원 상태가 있었지만 자연어 계획 스키마와 공식 대화 경로에는 복원 선택지가 없었습니다. 현재는 `restore-requirement` 결정으로 두 경로를 연결합니다.

## 대상과 책임

Core가 검증된 `requirementHistory`의 마지막 항목을 요구사항별로 확인합니다. 마지막 상태가 `removed`인 ID만 `describeWorkflowDraftEditContext(...).removedRequirements`에 포함합니다. 현재 살아 있는 ID, 한 번 복원되어 더는 철회 상태가 아닌 ID, 이력에 없는 ID는 복원 출력 스키마에서 선택할 수 없습니다. 과거에 한 번 삭제된 적이 있다는 사실만으로 대상이 되지는 않습니다.

모델은 현재 요청을 근거로 복원 대상 ID와 짧은 지시·이유만 선택합니다. 과거 문장·상태·범위는 검토용 참고 자료이며 현재 요구나 기본값이 아닙니다. 모델은 복원할 필드, 이력, 버전, 답변 메시지 ID를 생성하지 않습니다. 복원 결정은 API·native 노드·파라미터·연결을 바꾸지 않습니다. 해당 변경은 별도 결정이 필요합니다.

```ts
const plan = await analyzeWorkflowDraftEdit({
  draft,
  context,
  requestMessageIds: [requestId],
  model,
});

const restoration = plan.steps.find(
  (step) => step.decision.kind === 'restore-requirement',
);
```

코드가 생성한 단계 ID를 사용하며, `describeWorkflowDraftRequirementEdit`의 `action`은 복원에서 `restore`, 기존 수정에서 `revise`입니다. `requirement`에는 선택한 참고 상태가 있고, `nodes`에는 이번 계획에서 실제 선택한 범위 후보가 있습니다.

## 답변 전후의 상태

복원 대상이 정해져도 정본 요구사항을 즉시 되살리지 않습니다. `stageWorkflowDraftEdit`는 해당 단계를 `pendingResolutionStepIds`에 남기고 독립적인 계획 작업을 허용합니다. 필수 답변 없이 전체 적용을 시도하면 실패합니다.

복원할 `text`, `state`, `scope`, `answerMessageId`는 기존 요구사항 답변 스키마로 명시적으로 제출합니다. 이전 상태를 자동으로 복사하거나 누락 필드를 채우지 않습니다. 선택되지 않았거나 제거한 노드 ID를 범위에 넣으면 거절합니다. 이 질문의 소유 단계는 `requirements`이며 API 입력이나 전체 workflow 질문으로 중복 배정하지 않습니다.

```ts
const description = describeWorkflowDraftRequirementEdit({
  draft,
  context,
  requestMessageIds: [requestId],
  plan,
  stepId: restorationStepId,
});

const answer = createWorkflowDraftRequirementAnswerSchema(description).parse(
  submittedAnswer,
);
```

`createWorkflowDraftEditCandidateContext`는 제출한 필드에서 감사용 답변 메시지를 만들고 원래 계획의 지문은 유지합니다. `assembleWorkflowDraftEdit`는 검증된 계획과 답변으로 변경을 다시 계산합니다. 현재 요구사항은 이번 요청·새 답변만 근거로 삼고, 과거 문장·근거는 이력에 남습니다. 생성 계보인 기존 `origin`은 유지합니다.

변경 이력의 `restored`, 직전 삭제 항목 ID, 버전, 원문 근거는 Core가 생성합니다. 새 범위에 해당하는 승인만 무효화하고 관계없는 형제 노드의 승인은 유지합니다. 사용자가 복원 상태를 `deferred`로 지정하면 그 범위의 계획 준비 상태가 차단되고 내보낸 workflow의 Start가 분리됩니다. 준비가 되었다고 바꾸거나 기존 노드를 삭제하지 않습니다.

## 공식 대화 예시와 검증 범위

공식 `createWorkflowDraftConversationGraph`의 검토 모드는 복원 대상 선택 검토, 타입이 있는 필드 답변, 변경 후보 검토 순서로 진행합니다. 자동 모드에서도 필수 필드가 미확정이면 질문합니다. 잘못된 범위를 답한 뒤 정상 답변으로 재개해도 의미 분석 모델을 다시 호출하지 않습니다. 대기 중 원본 버전이 바뀌면 자동 재배치 없이 오래된 계획을 거절합니다.

확인된 실행 사례는 철회된 목적 요구사항을 명시적으로 복원하고, 사용자가 새 문장·확정 상태·실제 노드 범위를 제출하는 대화입니다. Chomsky가 의미 결정을 한 번 선택했으며, 나머지 검토·답변은 명시적인 테스트 UI 동작입니다. 기존 native 노드와 연결을 유지한 SDK JSON을 격리 n8n 2.37.10에서 실행했습니다. 이는 일반적인 요구사항 의미 해석·교체·철회 판단의 전체 품질이나 모든 단계 재사용을 검증한 결과는 아닙니다.

- [Core·공식 호스트 회귀](../test/workflow-draft-requirement-restoration.test.mjs)
- [실제 LangChain 전송 검사](../test/workflow-draft-requirement-restoration-http.test.mjs)
- [실행 시나리오](../test/fixtures/workflow-draft-requirement-restoration-fixture.mjs)
- [격리 n8n 실행 도구](../integration/requirement-restoration-local-n8n.mjs)
- [이력과 근거 정책](workflow-draft-requirement-history.md)
- [전체 구현 장부](conversational-oss-implementation.md)

# LangGraph 워크플로 생성 예제

정본 대화는 구현할 수 없는 요청을 `report-capability-gap`으로 선택해 초안의 `gapNodes`에 보존합니다. 독립적인 API·native 계획은 이어가고, 최종 JSON에는 한글 경고 영역과 실행 시 중단하는 대역 노드를 둡니다. 결손이 남으면 Start를 분리합니다. 이는 제공된 계약으로 충족하지 못했다는 판단이며 전체 서비스에 API가 없다는 증명은 아닙니다. [결손 계약](../../docs/workflow-draft-conversation-host.md#explicit-capability-gaps)을 참고하세요. 별도 모델 호출이나 새 그래프 노드를 추가하지 않습니다.

`trackRequestedApiInputs: true`를 지정하면 사용자가 요청했지만 값은 아직 없는 선택 입력도 질문이나 실행 입력 슬롯으로 보존합니다. 기존 값 생성 호출에 포인터 선택을 포함하며 모델 호출이나 그래프 노드를 추가하지 않습니다. OAS 필수 여부와 구분하고 답변·초안·전송 전 검사까지 전달합니다. [선택 입력 요청 추적](../../docs/workflow-draft-api-binding-questions.md#값이-미정인-선택-입력의-요청-추적)을 참고하세요.

`planApiBindingInputs: true`를 지정하면 선행 결과에서 받을 API 입력을 먼저 선택하고, 코드가 고정한 범위 안에서만 바인딩·질문을 계획합니다. 선택 대상이 없으면 바인딩 모델을 호출하지 않으며 OAS 필수값 질문은 유지합니다. 실제로 요청한 선택 파라미터도 사용할 수 있습니다. [입력 의도 선택과 범위 계약](../../docs/workflow-draft-api-binding-questions.md#요청-의도를-먼저-고정하는-선택-단계)을 참고하세요. 옵션을 생략한 기존 호출에는 이 추가 제한이 적용되지 않습니다.

자연어 멀티턴 앱을 만들 때는 [정본 대화 사용 예시](../../docs/workflow-draft-conversation-host.md)의 `createWorkflowDraftConversationGraph`부터 확인하세요. 질문·후보 검토·추가 요청·계획 수정·최종 JSON 반환을 같은 세션에서 연결하는 참조 예시입니다. 질문 수는 기존 `readClarificationQuestionLimits(process.env)`로 호스트 환경에서 설정하며, 이 기능을 끄면 해당 설정도 필요하지 않습니다. 아래의 단일 API CLI와 다른 factory들은 각각의 조합 방식을 보여주는 별도 예시입니다.

정본 대화의 API 입력 질문에는 `reply-inputs`로 자연어 답변을 제출할 수 있습니다. 기존 계획을 유지하고 원문 선택을 재검사한 뒤 구조화된 입력과 같은 경로로 적용합니다. [정본 자연어 입력 가이드](../../docs/canonical-natural-input-replies.md)를 참고하세요.

정본 초안 대화는 철회한 요구사항의 명시적 복원과 새 필드 확인·검토·재개를 지원합니다. [복원 계약](../../docs/workflow-draft-requirement-restoration.md)을 참고하세요.

정본 대화의 최종 결과는 `outcome`으로 구분합니다. 실제 JSON이 생성되면 `workflow-exported`, API·native·결손 인스턴스가 모두 없는 초안이면 `no-workflow`를 반환합니다. 후자는 현재 요청의 종료이며, 추가 대화는 새 요청으로 보냅니다. JSON 출력 성공도 실행 준비 완료를 뜻하지 않으므로 실제 artifact의 입력 슬롯·배포 설정·Trigger 연결 상태를 함께 확인해야 합니다. [반환 계약](../../docs/workflow-draft-conversation-host.md#output-outcomes)에 상세한 사용법이 있습니다.

자연어 필수 입력 답변은 `answerOptions.includeExplanations`로 같은 호출의 이유와 원문·OAS 근거 기록을 선택할 수 있습니다. [입력 답변 추출 가이드](../../docs/api-input-answer-extraction.md)를 참고하세요.

새 native 노드와 연결을 함께 계획하는 두 factory는 미배포 옵션
`graphOptions: { includeExplanations: true }`를 받습니다. 검토 콜백과 계획 상태에서
`graphPlanning`을 확인하며 실행 JSON에는 포함하지 않습니다.
[전체 그래프 가이드](../../docs/graph-planning-records.md)에서 적용 범위를 확인하세요.

연결 전용 단계를 사용하는 두 공식 factory는 미배포 옵션
`connectionOptions: { includeExplanations: true }`로 새 연결의 이유와 원본 근거를
제공합니다. `reviewPlan`과 `state.reviewPlan.connectionPlanning`에서 확인하며
실행 JSON에는 기록을 넣지 않습니다. 적용 범위는
[연결 계획 가이드](../../docs/connection-planning-records.md)를 참고하세요.

`openapi-flow`의 현재 공개 API를 사용하는 공식 예제 패키지다. CLI는 자연어 시나리오에서 API 하나를 고르고, 원본 OAS 타입에 맞는 요청값을 생성한 뒤 n8n import용 JSON을 저장한다. 다중 API에는 모델이 조건·연결까지 계획하는 factory와 호스트가 연결을 명시하는 factory를 제공한다. HTTP 서버나 API 실행기는 제공하지 않는다. 이 workspace는 `private: true`이며 npm에 배포하지 않는다. 미배포 개발 소스를 대상으로 하며 npm `0.2.0`과 구분한다.

## 현재 개발 범위

기존 orchestrated·conversational factory는 `nativeOptions.includeExplanations`를 받는다. `nativePlan.proposal`은 새 인스턴스와 원래 근거 기록이고 `nativePlan.nativeNodes`는 준비 노드까지 합친 실행 재료다. OAS 없이 `sources: []`로 native-only 계획을 만들 수 있으며 적용 대상이 아닌 API 선택은 건너뛴다. [native 계획의 이유와 입력 출처](../../docs/native-planning-records.md)를 참고한다.

기존 생성·대화 factory의 `bindingOptions.includeExplanations`는 같은 연결 계획 호출에서 호출별 짧은 이유를 받고 `bindingPlan.bindingPlanning`에 원래 OAS·native 계약을 보존한다. 실행용 연결에는 설명을 섞지 않으며 기존 연결 불가 사유도 그대로 유지한다. [바인딩 계획의 이유와 근거](../../docs/binding-planning-records.md)를 참고한다.

기존 생성 factory는 `argumentOptions.includeExplanations`로 최초 리터럴 제안과 확정 입력을 구분한 생성 기록을 제공한다. 선택된 API의 역할은 원래 계약과 함께 검사해 형식·바인딩·값·그래프 계획까지 전달하며, 같은 API의 여러 호출을 하나로 합치지 않는다. [입력 생성 근거와 호출 역할](../../docs/literal-generation-records.md)을 참고한다.

정본 대화의 본문 형식 단계는 코드 전용 결정·모델 선택·모델의 미지정 판단과 코드 기본값을 구분해 `stageResults`에 남긴다. 해당 계획의 설명 설정을 따르며 추가 설명 호출은 없다. 기존 factory는 별도 `requestMediaOptions.includeExplanations`를 받는다. [선택 경위와 원본 근거](../../docs/request-media-decisions.md)를 참고한다.

기존 생성·대화 factory에 `selectionOptions: { includeExplanations: true }`를 주면 최초 API 선택과 후보 질문에도 이유·원본 근거를 제공한다. 설명은 같은 모델 호출에서 받고 코드는 실제 원문·후보 스냅샷을 붙인다. 이 옵션은 탐색용 선택에만 적용된다. [사용법과 보장 범위](../../docs/api-selection-explanations.md)를 참고한다.

정본 대화 factory는 선택 옵션 `nativeFeatures`로 OSS enum 기능을 사용할 수 있다. `{}`는 전체 등록 기능, `features: []`는 선택 없음이다. 소스 의존 기능은 원래 정의를 고정한 채 생산자 준비 뒤 실제 계약을 결합한다. 소스가 없으면 독립 작업을 계속 계획하고 구조화된 질문을 반환한다. 옵션 생략 시 기존의 명시적 `context.capabilities` 계약을 유지한다. [정의·준비 상태·재개 설명](../../docs/native-feature-planning.md)을 참고한다.

정본 대화에는 `planNativeDependencies: true`로 새 native 노드의 생산자 선택을
별도 저장 단계로 둘 수 있다. 값 생성에는 선택한 실제 소스 계약만 전달하고,
Core 최종 조립도 같은 참조를 검사한다. 선택한 생산자가 아직 준비되지 않았으면
소비자를 보류하며 무관한 출력으로 대체하지 않는다. 이 옵션은 새 노드 추가에
적용하며 기존 노드의 설정 수정·참조 수선은 별도 API를 유지한다.
[사용법과 검증 경계](../../docs/workflow-draft-conversation-host.md#optional-producer-choices-for-new-native-roles)를 참고한다.

### 기존 생성 factory의 단계별 native 계획

미배포 소스의 `createOrchestratedWorkflowGenerationGraph`와
`createConversationalWorkflowGenerationGraph`는 선택 옵션
`nativePlanning: { mode: 'staged' }`를 받는다. 옵션을 생략하면 기존 compact
호출을 유지한다. 명시적으로 제공한 `capabilities`만 사용하며, 이 옵션이
전체 n8n 기능을 자동 등록하거나 정본 대화의 편집 기능을 대신하지는 않는다.

출력 계약에 의존하는 기능은 실제 계약이 준비된 뒤 값을 생성한다. 예를 들어
native 배열 분리 기능을 생산자보다 먼저 선택해도, 생성에 필요한 출력 계약이
없으면 보류하고 독립 생산자를 먼저 설정한다. 소비자의 출력 스키마와 참조 ID
목록은 실제 완료한 생산자에서 코드로 도출한다. 제공한 OAS 계약을 사용하는
응답 수집 기능도 같은 경계를 거친다. 필요한 계약도 질문도 없으면 값을
추측하지 않고 부족한 자료를 오류로 알린다.

기본 동작은 구현이 선언한 생성 전제조건 검사다. 필요한 생산자를 먼저 고르려면
`planDependencies: true`를 함께 지정한다. 모델은 선택된 실제 인스턴스 ID 중에서
각 노드가 참조할 생산자만 고른다. 코드는 없는 ID·자기 참조·순환을 거절하고,
선택한 생산자가 준비될 때까지 해당 소비자의 값 생성을 보류한다. 무관한 출력이
이미 있어도 대체하지 않는다. 실제 생성된 참조가 앞선 선택과 다르면 거절한다.
선행 노드를 완료된 설정으로 전달하는 경우에도 같은 검사를 한다.

질문 이후 완료된 생산자를 이전 질문의 근거에 자동 추가하지 않는다. 생산자
선택의 의미가 사용자 의도에 맞는지는 별도 검토·품질 평가 대상이다. 최종 실행
순서는 이 계획에서 만들지 않고 별도의 연결 계획과 DAG 검사로 정한다.

```ts
const graph = createOrchestratedWorkflowGenerationGraph({
  model,
  capabilities,
  checkpointer: new MemorySaver(),
  nativePlanning: {
    mode: 'staged',
    planDependencies: true,
    allowRuntimeParameters: true,
  },
  nativeInputs: { revision: 7 },
  nativeOptions: { includeExplanations: true },
});
```

각 단계는 `selectNativeInstances` → `scheduleNativeConfiguration` →
`generateNativeParameters`로 체크포인트에 저장된다. 값이 필요 없는 인스턴스는
모델을 호출하지 않는다. 질문이 생기면 다른 인스턴스의 설정을 먼저 계속 계획한
뒤 `askNativeConfiguration`에서 멈춘다. 이 작업 목록의 순서는 실행 순서가
아니다. API 바인딩과 실제 DAG 연결은 모든 native 설정을 확정한 뒤 별도 단계에서
계획한다.

`planDependencies: true`이면 선택과 스케줄링 사이에 `planNativeDependencies`가
추가된다. 결과는 `nativeDependencies`에 보존하며, 값 생성 재개 시 선택을
반복하지 않는다. 선택 가능한 생산자가 전혀 없으면 이 단계는 모델을 호출하지
않는다. 순환·잘못된 선택이나 전송 오류에 대한 숨은 재시도는 없다. 호스트가
명시적으로 재시도하면 실패한 단계만 재개한다. 옵션을 생략하면 이 호출과
새로운 생산자 선택 제약을 추가하지 않는다.

단계별 선택·질문·답변·값 제안 기록은 `nativeSelection`과
`nativeConfigurations`에서 확인한다. 최종 `nativePlan.proposal`은 이 결과를
검증해 모은 새 인스턴스 목록이며, compact 방식의 단일 호출 기록을 임의로
만들어 붙이지 않는다.

중단 응답의 `kind`는 `native-configuration`이다. `questions`에 표시된 질문을
골라 `Command({ resume: { action: 'reply', questionId, text } })`로 답한다.
`action: 'cancel'`은 생성 없이 종료한다. 다른 질문의 ID나 공백뿐인 답변은
오류를 기록하고 다시 질문하며 모델을 재호출하지 않는다. 답변은 원래 질문과
그 당시의 자료에만 붙고 시나리오를 다시 쓰지 않는다. 여러 질문에는 순서를 바꿔
답할 수 있으며 이미 완료한 선택과 설정을 반복하지 않는다.

값 생성이 실패하면 원래 오류와 체크포인트를 보존한다. 호스트가 명시적으로
재시도할 때 해당 값 단계만 재개한다. 시나리오·OAS·구현 계약이 바뀐 답변은
이전 계획에 자동 적용하지 않는다. `MemorySaver`는 프로세스 재시작 후 복구를
보장하지 않으며, 저장 수명·대화별 `thread_id`·동시 요청 관리는 호스트 책임이다.
많은 인스턴스나 질문에는 호출 설정의 `recursionLimit`도 호스트가 지정한다.

실행 입력을 허용하면 `nativeInputs.revision`을 명시해야 한다. 코드가 빈 값을
임의 값으로 채우지 않으며, 결과의 `nativeInputTemplate`에 슬롯·한글 안내·입력
준비 상태를 반환한다. API 노드도 이 생산자의 실제 SDK 출력 이름을 사용한다.
상세 계약은 [실행 입력 가이드](../../docs/native-runtime-inputs.md#staged-native-planning-in-existing-hosts)를 참고한다.

### 완성된 초안의 수정·검토·재개

미배포 소스의 `createWorkflowDraftConversationGraph`는 빈 초안과 기존 초안에서 같은 대화 경로를 사용한다. API·native 수정 단계를 따로 체크포인트에 저장하고, 계획 선택 검토와 최종 변경 검토를 거쳐 승인된 결과만 적용한다. 검토 모드와 자동 모드를 선택할 수 있으며, 자동 모드도 미확정 입력·구조는 질문한다.

UI는 질문 스키마, 변경 영향과 읽기 전용 SDK 미리보기를 받아 표시한다. `MemorySaver`로 DB 없이 재개할 수 있지만 프로세스 재시작 복구와 같은 thread의 동시 요청 제어는 호스트 책임이다. 새 단계의 출력·설명·근거는 `stageResults`에 남고, 최종 JSON·한글 안내·입력 슬롯은 같은 리비전으로 반환한다. 이 factory는 서버나 n8n 실행기가 아니며 npm 0.2.0에는 없다. [사용법과 아직 남은 범위](../../docs/workflow-draft-conversation-host.md)를 확인한다.

`clarification` 옵션에 명시적인 질문 예산을 전달하면 초기 요구사항 구체화도 같은 대화에서 진행한다. 실제 질문·선택지 ID로 답변하거나 보류할 수 있고, 독립적인 API는 먼저 준비한다. 답변을 확정하면 원래 사실·답변 출처와 준비 이력을 보존해 재분석하며, 모든 미확정 질문이 해결되기 전에는 실행용 결과로 채택하지 않는다. [질문·답변·범위 계약](../../docs/workflow-requirements-clarification.md)을 참고한다.

`reviewSuggestions` 옵션은 각 실제 검토·질문 경계에 후속 메시지를 제안한다. 사용자가 제안 ID를 명시적으로 채택해야 요구사항 수정으로 전달하며, 승인만으로 확장 제안을 추가하지 않는다. 잘못된 답변을 재개할 때 제안 모델을 다시 호출하지 않는다. [후속 제안과 채택 계약](../../docs/workflow-review-suggestions.md)을 참고한다.

### 미배포 멀티턴 예시

선행 응답의 출처가 모호한 API 입력은 `api-binding` 질문으로 반환한다.
사용자는 `answer-api-bindings`로 실제 질문·선택지 ID를 지정하고, 호스트는
같은 계획에 답을 적용한다. 이때 의미 분석·바인딩 모델을 다시 호출하지 않는다.
[현재 입력에 한정한 연결 질문](../../docs/workflow-draft-api-binding-questions.md)을 참고한다.

현재 라운드의 확정 답을 바꾸거나 질문을 다시 열 때는 `revise-clarification`을
사용한다. 변경 전후 기록은 유지하고 이전 답·제출 기록은 현재 모델 입력에서
제외한다. 상태 변경에는 LLM을 호출하지 않으며 변경된 계획은 기존 검사를
다시 거친다. [답변 변경과 질문 재개](../../docs/workflow-clarification-answer-revisions.md)를 참고한다.

현재 소스에는 `createConversationalWorkflowGenerationGraph`가 추가되어 있다. API 선택이 모호하면 후보를 묻고, 선택한 OAS의 필수 입력이 없으면 질문·답변 검증·재개를 수행한다. 질문에 답하기 전에는 workflow를 컴파일하지 않는다. 폼 답변은 모델 없이 검증하고 자연어 답변은 값 추출·원문 대조를 거친다. 질문 node에는 모델 호출이 없어 재개 시 앞선 계획을 다시 실행하지 않는다.

호스트가 checkpointer와 thread ID를 제공한다. UI·대화 저장소·권한·새 업무 추가는 호스트 책임이며 이 예시가 서버를 제공하지는 않는다. 이 추가 기능은 npm 0.2.0에 없고, example은 별도 공개 패키지가 아니다. [사용법과 입력 정책](../../docs/conversational-generation.md)을 참고한다.

Manual Trigger로 시작해 OAS에 정의된 REST API를 호출하는 워크플로우에 집중한다. 여러 API 선택, 요청값 생성, 선행 응답 바인딩과 제공된 native 기능을 사용한 조건·합류가 대상이다. 여러 item의 반복 실행은 이 범위에 남아 있는 과제다.

반복 실행의 기본 경로와 한 번의 실행 안에서 결과 수집·API 분기 합류를 구현했다. linked 모드의 중첩 배열 분리, 직렬 배치 반복과 배치 안의 완전한 API 분기·합류도 검증했다. 명시적인 IF 양쪽 경로의 재합류를 사용한 조건부 배치도 지원한다. item을 버리는 Filter의 배치 완료 처리, 중첩 배치 범위, 실행 간 합류·누적 수집과 자동 배치 범위 계획은 루트 README의 TODO에 남겨 두었다.

Webhook·callback의 추가 구현은 보류한다. 수신 요청의 인증·스키마 검사와 callback 등록·응답 연결도 당장은 구현하지 않는다. 기존 inbound 추출·legacy 생성 코드는 유지하며, 이 개발 범위 때문에 표준에 맞는 OAS 문서를 거절하지 않는다.

## 다중 API 선택 품질 평가

`npm run eval:selection`은 현재 공개 함수 `selectApiOperations`를 평가한다. 여러 OAS의 카탈로그와 시나리오만 모델에 보내고, 정답은 응답을 받은 뒤 코드가 대조한다. 요청값·응답 바인딩·native 설정·DAG·n8n 실행은 이 평가에 포함하지 않는다. API 다섯 개를 정확히 선택해도 의존 연결까지 맞게 설계했다는 뜻은 아니다.

공개 입력 예시는 [evaluation/api-selection.dataset.json](evaluation/api-selection.dataset.json)에 있다. 같은 공개 OAS를 두 문서 ID로 등록해 서비스 구분, 같은 API의 두 호출 인스턴스와 없는 API의 결손 탐지를 확인한다. 이 예시는 평가기 사용법을 위한 작은 입력이며 제품 품질을 대표하는 정답셋은 아니다. 실서비스 OAS·시나리오·응답 보고서는 비공개 경로에 보관한다.

저장소 루트에서 모델을 호출하지 않고 입력을 검사한다.

```sh
OPENAPI_FLOW_EVAL_CASES=examples/langgraph-workflow/evaluation/api-selection.dataset.json \
  npm run eval:selection -- --validate-only
```

`version: 2` 입력은 `repeats`, `sources`, `cases`를 갖는다. `sources`의 `specFile`은 입력 파일 기준 경로이며 `sha256`은 OAS 파일 원본 바이트의 SHA-256이다. 문서·사례 ID 중복, 해시 불일치, 표준에 맞지 않는 OAS와 카탈로그에 없는 정답 참조는 모델 호출 전에 실패한다. 이 해시는 평가 입력을 고정하기 위한 검사이며 OAS 수용 범위에 새 제한을 두지 않는다. OAS를 바꿨다면 정답을 검토한 뒤 해시도 명시적으로 갱신한다.

각 사례에는 `id`, `cohort`, `scenario`, `expectedOperations`, `expectedGap`이 필요하다. 정답 API는 `{ documentId, operationRef }`로 지정한다. 선택 스키마의 각 항목은 API 종류가 아닌 필요한 호출 한 번을 뜻한다. 같은 API를 다른 역할로 두 번 호출해야 하면 모델도 두 항목을 반환하고 정답에도 같은 참조를 두 번 적는다. 코드는 이 항목을 중복 제거하거나 부족한 호출을 복제하지 않는다. 선택 목록의 순서는 실행 순서가 아니므로 채점하지 않으며, 호출 목적의 의미도 자동 채점하지 않는다. `expectedGap`은 결손이 있는지만 비교한다. 결손 설명의 정확성이나 요구 충족 정도는 사람이 별도로 검토한다.

`development`는 프롬프트 개발에 사용하는 사례, `holdout`은 해당 실행 전까지 프롬프트 수정에 사용하지 않은 별도 사례 묶음이다. 이름만 붙였다고 미사용 상태가 보장되지는 않는다. 두 묶음을 분리하고 정답을 사람이 검토한 뒤 고정해야 한다. 평가 실패를 보고 프롬프트를 바꾸면 해당 사례를 더 이상 미사용 평가셋으로 취급하지 않는다.

실제 측정에는 `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`를 로컬 환경에 설정한다. 필요하면 `LLM_HEADERS_JSON`으로 모델 연결 헤더를 명시한다. 이 평가 CLI는 `.env`를 자동으로 읽지 않는다. 인증값을 명령 기록이나 평가 입력에 넣지 않는다. 결과는 아직 없는 새 파일 경로로 지정한다.

```sh
OPENAPI_FLOW_EVAL_CASES=examples/langgraph-workflow/evaluation/api-selection.dataset.json \
OPENAPI_FLOW_EVAL_OUTPUT=.local-artifacts/selection-quality/public-pilot-01.json \
  npm run eval:selection
```

CLI는 `temperature: 0`, `maxRetries: 0`, 호출당 60초 제한을 사용한다. 각 반복은 독립적인 첫 제안이며 재시도나 출력 보정은 하지 않는다. 같은 설정을 기록해 반복하더라도 모델 응답이 항상 같다는 보장은 없다. Chomsky의 토큰 발급 등 별도 인증은 호스트에서 처리하고 `SelectionEvaluationObserver`를 callbacks에 등록한 모델을 `runApiSelectionEvaluation`에 주입한다. 해당 함수도 답을 고치거나 재호출하지 않지만 모델 내부 재시도는 호출자가 꺼야 한다. 전달한 `modelSettings`는 호스트가 명시한 설정 기록이며 모델을 변경하지 않는다.

보고서는 시도별 선택·채점·모델 응답 텍스트와 표준 `usage_metadata`를 보관한다. 요청 헤더, 토큰과 분류하지 않은 전송 오류 본문은 저장하지 않는다. 생성된 텍스트에도 입력에서 유래한 정보가 있을 수 있으므로 보고서를 공개하지 않는다. `*.attempts.jsonl`을 각 시도 직후 기록하고 최종 JSON에 전체·묶음별 요약을 남긴다. 기존 결과 파일을 덮어쓰지 않는다.

채점 기준은 다음과 같다.

- `exactMatch`: 문서별 API와 호출 개수가 모두 맞고 결손 유무도 맞은 시도 수 / 실행한 시도 수.
- `firstProposalValidity`: 공개 함수가 수용한 첫 제안 수 / 실제 모델 호출이 시작된 시도 수. 수용은 정답이라는 뜻이 아니다.
- `apiPrecision`: 맞게 고른 API 호출 수 / 고른 API 호출 수. `apiRecall`은 맞게 고른 API 호출 수 / 정답 API 호출 수. 같은 API의 반복 호출도 각각 센다.
- `gapDetection`: 결손 유무가 맞은 시도 수 / 실행한 시도 수. 결손 설명의 의미를 평가하는 점수는 아니다.
- `averageDurationMs`: 실행한 시도의 평균 소요 시간. 거절된 시도도 포함한다. 모든 관측 응답에 사용량이 있고 시작 후 응답 없이 끝난 호출이 없을 때만 토큰 합계를 기록한다. 측정할 수 없는 값이나 분모가 0인 비율은 `null`이다.

스키마 거절도 실패로 기록하고 다음 독립 반복을 진행한다. HTTP 오류·연결 실패·시간 초과가 발생하면 그 시도를 기록한 뒤 실행을 중단하고 `complete: false`, `unattempted`로 남은 수를 표시한다. 미실행 사례를 성공이나 실패로 채점하지 않는다. `--validate-only`는 모델 품질 점수를 만들지 않는다. 측정 CLI는 중단·거절·오답이 있으면 종료 코드 1을 반환하지만, 제품 배포 기준은 평가 결과를 검토한 뒤 별도로 정한다.

타입은 `src/types/api-selection-evaluation.ts`, 입력 스키마는 `src/schemas/api-selection-evaluation-schema.ts`, 준비·호출·채점·집계는 `src/evaluation/selection/`에 분리했다. 이전 단일 API 평가기는 `npm run eval:selection:legacy`로만 실행한다.

### 2026-10-12 선택 단계의 초기 측정

비공개 Honeypot·ICL OAS의 37개 후보를 사용해 12개 시나리오를 3회씩 실제 Chomsky 모델로 평가했다. 초기 완전 일치는 34/36회였으며, 두 실패는 같은 API의 시작·종료 호출을 목록 한 항목으로 합친 경우였다. 선택 코드와 스키마는 반복 후보를 허용했지만, 모델 안내에는 API 기능 선택과 호출 인스턴스 선택의 구분이 명확하지 않았다.

프롬프트와 필드 설명에 항목별 호출·역할을 명시한 뒤 같은 사례의 재평가는 36/36회 일치했다. 코드의 호출 복제나 정답 주입은 없다. 초기 보고서와 실패 응답은 보존했다. 재평가 사례는 모두 `development`로 분류했으며, 미사용 평가셋의 품질 점수로 보고하지 않는다. 두 실행은 같은 모델 구성과 60초 제한, `maxRetries: 0`을 사용했다. 이 호스트는 temperature를 명시하지 않아 보고서의 값은 `null`이며, CLI의 `temperature: 0` 측정과 혼합하지 않는다.

이 정답셋은 소스 검토를 바탕으로 구성한 초기 입력이며 사용자 검토가 끝난 대표 평가셋은 아니다. 스키마 거절은 두 실행 모두 0회였지만, 그것만으로 시나리오를 충족한다고 판단하지 않는다. 이번 실행은 API 목록·호출 개수와 결손 유무만 측정했다. 업무 API와 n8n은 호출하지 않았다. 새 미사용 사례와 요청값·바인딩·native 조건·DAG·실행 평가가 남아 있다.

## native 출력 바인딩

### 2026-10-12 워크플로우 단계의 개발 사례 평가

현재 `createOrchestratedWorkflowGenerationGraph`로 기존 개발 사례 5개를 각각 3회 생성했다. 고정 Honeypot·ICL OAS는 모두 후보에 넣었지만 실제 실행 대상은 ICL 계약 서버다. 정답·준비된 native 노드·고정 연결은 모델에 주지 않았다. 모델이 API와 native 노드·설정·응답 바인딩·연결을 계획하고, 코드가 OAS 검사와 공식 SDK 컴파일을 수행했다. 실제 업무 API나 원격 n8n은 사용하지 않았다.

초기 결과는 8/15회 통과였다. 올바른 JSON 본문에 `Content-Type`이 빠졌고, 연결 모델에는 IF의 포트·의존성만 전달되어 실제 조건과 반대로 연결한 사례가 있었다. 본문 형식의 헤더를 OAS에서 도출하고 확정된 native 파라미터를 연결 입력에 전달한 뒤 새 15회 결과는 14/15회 통과였다. 응답값·모델 출력·기존 실패 보고서는 보정하지 않았다.

5개 API DAG는 수정 후 3회 모두 정상 응답 두 종류와 오류 대조군 세 종류를 통과했다. 최초 응답의 상품번호·캐시 값을 바꾸어 후속 요청의 실제 바인딩을 확인했고, 응답 ID 누락·실패 코드·가격 불일치에서는 기대한 요청 수와 중단을 확인했다. 수정 후 생성 결과로 격리 n8n 실행 총 26회를 수행했다. 이는 DAG의 독립 분기 연결을 검증한 것이며 병렬 처리 속도를 측정한 결과는 아니다.

남은 실패 1회는 모델이 명시된 독립 입력에 “바인딩이 필요 없다”는 설명을 `gaps`에 넣어 정상 조회까지 결손 처리한 경우다. 이 항목을 문자열 규칙으로 삭제하거나 정답 입력으로 바꾸지 않았다. 결손의 의미 정확도와 새 미사용 시나리오 평가가 필요하다. 이 작은 개발 사례의 14/15를 임의의 자연어·OAS에 대한 신뢰도나 출시 완료로 해석하지 않는다. 반복·native→API 생산자·다중 서비스 실행은 이 실행의 평가 범위가 아니다.

### 2026-10-12 결손 책임 구분과 새 문장 평가

바인딩 계획은 노드 응답에서 요청으로 값을 연결하는 작업만 맡는다. 독립 입력값은 다음 요청값 생성 단계의 책임이며, 연결이 필요 없다는 설명은 결손이 아니다. native 계획도 native 기능의 미충족 요구만 보고한다. 선택된 OAS API의 구현·요청값·바인딩·연결은 다른 단계가 처리하므로 native HTTP capability가 없다는 이유로 결손을 만들면 안 된다. 두 단계의 프롬프트와 구조화 출력 필드 설명에 이 구분을 명시했다. 검증기는 기존 계약을 유지하며 모델의 결손 문장을 읽고 삭제하는 코드는 넣지 않았다.

바인딩 설명만 수정한 중간 개발 사례 평가에서 이전 결손 오판은 3회 모두 재현되지 않았다. 원본 전체 결과는 12/15다. native 단계가 후속 API 구현·바인딩 작업을 결손으로 오인한 2회는 그래프 검증에서 거절됐다. 나머지 1회는 담당 에이전트가 평가 중 clean build를 실행해 런타임 파일이 잠시 삭제된 `ENOENT` 오류다. 환경 간섭이 있어 이 수치를 앞선 평가와 직접 비교하지 않는다. 실패 보고서는 보존했다.

native 설명도 보강한 뒤, 첫 호출 전에 새 문장 4개를 확정해 각각 3회 평가했다. 5개 API DAG 2/3, 조회 후 미구현 환불 2/3, 독립 JSON 배열 요청 3/3, 상품번호 누락 안내 3/3으로 총 10/12다. 모델 호출은 66회이고 격리 n8n 실행은 15회다. 통과한 DAG 두 개는 응답값을 바꾸는 정상 대조군 두 종류와 응답 ID 누락·업무 실패·가격 불일치 오류 대조군 세 종류를 모두 통과했다.

실패 한 건은 명시된 `/result/gdNo`·`/result/cached` 대신 `/result/result/gdNo`·`/result/result/cached`를 선택했다. 원본 OAS가 추가 속성을 닫지 않아 계약 검사만으로 실제 존재를 보장할 수 없다. 정답 대조가 이를 발견했고, 같은 제안으로 실제 fixture 값을 조립하면 `Missing response pointer`가 발생함을 별도로 재현했다. 다른 한 건은 기준 정답의 단건 GET 대신 한 상품을 담은 복수 POST를 선택했다. 질의에서 복수 방식의 금지가 충분히 명시됐는지도 정답 검토가 필요하며, 이 결과를 성공으로 바꾸거나 선택을 자동 교체하지 않았다.

이번 수정으로 모든 결손 의미 판단이나 응답 경로 선택을 보장하지 않는다. 새 문장이지만 기존 OAS·응답 fixture를 재사용했고 모델 재시도·출력 보정·정답 주입은 없다. 신규 서비스 명세, 세부 항목별 점수와 사용자 정답 검토, 반복·native→API 생산자 평가와 출시 기준은 남아 있다.

### 2026-10-12 응답 경로 근거와 평가 기준 검토

core의 `listApiResponsePointers(operation)`이 OAS에 명시된 응답 본문 경로·타입·설명을 추출하고, `planApiBindings`가 원본 계약과 함께 모델에 전달한다. 스키마 내부 위치와 실제 본문 경로를 구분하며, 합성·조건 분기는 각 위치를 유지한다. 열린 속성·패턴 키·배열 항목·미확장 참조는 별도 경계로 표시하고 임의 키나 인덱스를 만들지 않는다. 이 정보는 경로 선택의 근거이지 허용 목록이나 실제 필드 존재의 보장이 아니다. 표준 계약을 좁히거나 잘못된 출력 경로를 자동 교정하지 않았다.

이전 새 문장 사례 4개×3회로 실제 재평가를 시작했지만, 네 번째 시도의 모델 호출이 60초를 넘겨 중단됐다. 12회 중 4회만 시도했고 8회는 미실행이다. 원본 결과는 통과 2회, 평가 기준 거절 1회, 타임아웃 1회이며 새 정확도 수치를 확정하지 않는다. 총 호출 시작 19회 중 응답·사용량은 18개만 확인했으므로 완전한 토큰 총량으로 보고하지 않는다. 실패를 숨기는 재시도나 정답 교체는 없다.

평가 기준 거절은 Merge 입력을 정확히 4개로 고정한 검사에서 발생했다. 모델은 후속 네 응답과 최초 응답까지 입력 5개로 합류시켰고, 모든 API 바인딩은 명시된 올바른 본문 경로였다. 평가기를 모든 후속 응답이 합류한 뒤 검사로 이어지는지 확인하도록 바꾸었다. 입력 개수를 고정하는 대신 연결과 실제 실행을 함께 검사한다. 제품 compiler에 이 제한이 있었던 것은 아니다.

저장된 모델 선택·입력값·바인딩·그래프를 보존하고 테스트 배포 참조만 새 격리 환경에 연결해 공식 SDK로 재컴파일했다. 추가 모델 호출 없이 정상 응답 두 종류와 응답 ID 누락·업무 실패·가격 불일치 오류 대조군 세 종류가 통과했다. 이 별도 감사는 원본 실패 점수나 중단된 평가의 미실행 항목을 성공으로 바꾸지 않는다.

단건·복수 조회 선택의 정답 기준은 아직 사용자 확인이 필요하다. ICL 소스에서는 단건 결과가 DTO이고 복수 결과는 상품 키별 map이며 조회 구현도 별도다. 실서비스 동등성은 검증하지 않았으므로 둘을 자동으로 교체하거나 동일 API로 간주하지 않는다. 전체 반복 평가 완료와 정답 검토·출시 기준은 남아 있다.

### 분리된 계획과 optional 재료

자연어에서 native 생산자도 선택하려면 `createOrchestratedWorkflowGenerationGraph`를 사용한다. 기존 factory를 없애거나 특정 LangGraph를 OSS 패키지 내부에 강제하지 않는다.

```ts
const graph = createOrchestratedWorkflowGenerationGraph({
  model,
  capabilities: suppliedCapabilities, // 생략하면 native 기능을 주입하지 않는다.
  deployments: suppliedDeployments, // 기존 주소·credential 참조 정책 유지.
});
const result = await graph.invoke({
  workflowId: 'scenario-1',
  workflowName: 'Scenario 1',
  scenario,
  sources,
  trace: [],
});
// 검토 후 result.workflow를 import한다. factory가 실행하지는 않는다.
```

흐름은 OAS 카탈로그 → API 선택 → OAS 계약 조회 → 본문 형식 → native 선택·설정 → 코드의 출력 계약 도출 → API 바인딩·남은 요청값 → 연결 계획 → 코드 검사·공식 SDK JSON이다. native 인스턴스가 바인딩 전에 존재하므로 새 생산자의 실제 출력을 API 입력으로 지정할 수 있다. 전체 입력이 바인딩되면 literal 값 생성 모델 호출은 없다.

native IF·응답 검사 계획은 이번에 선택된 API 호출 ID만 참조하도록 동적 enum을 전달한다. API 종류가 같아도 호출 인스턴스가 다르면 각각 선택할 수 있다. API 재료가 없으면 응답 참조는 제공하지 않되 literal 비교와 다른 native 기능은 유지한다. 코드도 capability가 선언한 응답 참조를 검사하므로 잘못된 ID는 바인딩·연결 계획 전에 거절한다. 사용자 정의 capability는 `createPlanningParametersSchema({ apiCallIds })` hook으로 자기 출력 계약을 구체화할 수 있으며, hook이 없으면 기존 스키마를 바꾸지 않는다. 준비된 노드의 잘못된 응답 참조는 모델 호출 전에 오류다. ID 허용 목록은 응답 필드 존재·비교 의미·선행 실행을 보장하지 않으며 기존 OAS·DAG·실행 경로 검사는 유지한다.

각 OSS 함수도 따로 사용할 수 있다. `planNativeNodes`는 선택된 API 계약과 등록된 native 스키마에서 인스턴스·설정만 제안한다. 포트·출력 계약·결손 ID는 코드가 도출한다. `planWorkflowConnections`는 확정된 재료의 연결·결손만 제안하고 API 값이나 native 설정을 다시 생성하지 않는다. `orchestrateWorkflow`는 준비된 API 입력을 대상으로 이 두 함수를 조합하며 `materials`, `capabilities`, `preparedNativeNodes`, `gaps`, `edges`를 각각 생략할 수 있다. 주지 않은 기능·API를 선택하지 않고 기본 registry도 넣지 않는다. 준비된 native 노드가 있으면 그 구현 registry는 필요하다.

미배포 소스의 `selectNativeNodeInstances`와 `generateNativeNodeParameters`는 기능·역할 선택과 값 생성을 나누는 별도 경로다. 값 생성이 질문을 반환하면 원래 질문과 사용자 답변을 `replies`로 전달해 같은 선택 결과에서 재개할 수 있다. [질문·답변 계약](../../docs/native-runtime-inputs.md#answering-a-selected-instances-questions)의 LangGraph 체크포인트·실제 모델 검증을 참고한다. 위 기존 factory들은 아직 이 경로를 연결하지 않았으며 `nativeOptions`도 설명 옵션만 전달한다. 실행 시 native 입력을 함께 제공하려면 단계별 상태와 템플릿 입력 컴파일 경로를 연결하는 작업이 더 필요하다.

연결 단계에는 확정된 native 노드의 실제 조건·연산자·설정과 구현이 정의한 포트를 함께 전달한다. IF가 `code != 0`을 검사하면 true는 오류 경로이며, `code == 0`을 검사하면 true가 성공 경로다. 노드 이름이나 포트 이름만 보고 성공 분기를 추측하지 않는다. 이 설정은 읽기 전용 입력 문맥이며 연결 응답 스키마에는 native 파라미터가 없다. LLM이 만든 native 노드도 다음 단계에서는 확정된 재료로 다루며, 사용자가 미리 준비한 노드가 있어야 한다는 뜻은 아니다.

재료 묶음을 모두 생략해도 요구 결손을 보고할 수 있다. 없는 API나 native 기능을 대신 생성하지 않는다. native 호출에는 Zod에서 도출한 JSON Schema를 전달하고 원본 반환값을 직접 검사하므로, Zod의 default·coercion·transform이 값을 조용히 바꾸면 오류다. 이것은 OAS default 정책과 별개이며 native 구현 설정의 값 보존 경계를 다룬다.

새 native→API 데이터 참조가 필요할 때는 앞서 설명한 바인딩 전 계획을 사용한다. API 입력이 이미 확정된 뒤 `orchestrateWorkflow`에 native 기능을 추가한다고 기존 바인딩이 바뀌지는 않는다. 기존 edge도 그대로 보존하며 모델이 다시 반환하면 중복 오류다. 모자란 기능은 결손으로 남기고 기존 한글 경고 영역과 분리된 Start로 출력한다. 임의 보정·재시도는 없다.

실제 ICL OAS·격리 n8n 검증 명령은 다음과 같다. 기본 모델은 명시적으로 scripted 응답을 사용하며, 실제 Chomsky 모델은 검증 runner에 별도로 주입한다.

```sh
OPENAPI_FLOW_ICL_OAS_PATH=/absolute/path/to/icl.openapi.json npm run test:orchestration-local-n8n
```

### 이미 준비된 생산자의 경로

`createPlannedWorkflowGenerationGraph`와 `createReviewableWorkflowGenerationGraph`는 선택 사항인 `preparedNativeNodes`를 받는다. 호스트가 먼저 준비한 native 노드의 출력 계약을 OSS의 바인딩 함수에 전달하고, 최종 모델 호출은 그 노드의 값을 다시 생성하지 않고 연결을 계획한다. 타입이나 단위가 맞지 않으면 자동 보정하지 않는다. API의 OAS 계약은 그대로 유지한다.

모델 출력의 `additionalNativeNodes`에는 새로 추가할 노드만 담는다. 기존 노드는 파라미터와 실제 입력·출력 포트를 함께 전달하므로 다시 생성할 필요가 없다. 코드가 두 목록을 합쳐 반환 계획의 `nativeNodes`를 만들며, 기존 ID를 다시 제안하면 원본 출력과 원인을 담은 오류를 반환한다. 중복 노드를 삭제하거나 이전 출력 필드명을 alias로 받아들이지 않는다.

```ts
import { z } from 'zod';
import {
  createJsonOutputCapability,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';

const context = createJsonOutputCapability({
  name: 'request-context',
  description: 'User-supplied product ID, copied unchanged into a JSON item.',
  parametersSchema: z.strictObject({ productId: z.string() }),
});
const graph = createReviewableWorkflowGenerationGraph({
  model,
  capabilities: [...createN8nNativeCapabilities(), context],
  preparedNativeNodes: [
    {
      id: 'request-context',
      capability: 'request-context',
      parameters: { productId: '42' },
    },
  ],
});
```

이 예시는 기존 시나리오의 명시적인 값을 n8n Edit Fields(JSON)로 출력한다. 새로운 값을 추측하거나 API 응답을 수정하지 않는다. 사용자 시나리오가 이 값을 다음 API에 쓰도록 요구하면 모델은 `/productId`에서 대상 OAS 요청 필드로 바인딩하고 선행 연결을 설계한다. ID·생산자·입력 위치를 실제 계약과 대조하며, 단순히 필드명이 같다는 이유로 연결하지 않는다.

커스텀 native 기능은 `outputSchema(parameters)`로 JSON 출력 계약을 선언한다. 계약은 구현에서 도출하며 모델에게 생성시키지 않는다. 이 예시는 하나의 명확한 JSON item을 바인딩한다. 여러 item을 처리할 때는 아래의 명시적인 linked 모드를 사용하며, 첫 item을 임의로 고르지 않는다. 이 예시의 `preparedNativeNodes`는 호스트가 지정하지만 바인딩·검사·컴파일은 OSS의 공개 함수가 수행한다. 자연어에서 임의의 모든 native 생산자를 먼저 고르는 계획 단계까지 자동 제공하는 것은 아니다.

## item별 REST API 호출

API 계약을 조회한 뒤 `createResponseArrayCapability({ materials })`를 native 기능 목록에 등록한다. `materials`에는 호출별 `callId`와 원본 OAS 계약이 있다. `planNativeNodes`는 반복할 API의 ID와 배열의 JSON Pointer를 선택한다. 코드가 원본 응답 계약을 검사하고 item 스키마와 공식 Split Out 노드를 만든다. 출력은 `{ item: 원본 배열 항목 }`이며 값과 타입은 바꾸지 않는다.

```ts
const capabilities = [
  createResponseArrayCapability({ materials }),
  ...createN8nNativeCapabilities({ itemMode: 'linked' }),
];
// planNativeNodes → createNativeOutputContracts → planApiBindings
// → generateApiArguments → planWorkflowConnections 순으로 독립 호출한다.

const request = createHttpRequestNode({
  operation,
  arguments: plannedArguments,
  position: [600, 0],
  itemMode: 'linked',
  apiNodeNames,
  nativeOutputSources,
  apiResponseContracts, // callId → 해당 선행 API의 원본 OAS 계약
  baseUrl,
  credentialBindings,
});
```

`itemMode: 'linked'`는 현재 입력 item과 연결된 선행 결과를 `itemMatching(inputIndex)`로 읽는다. 출력의 `pairedItem`이 다음 노드에서도 이 연결을 유지한다. ID가 같은 항목이나 분기 후 순서가 바뀐 항목도 배열의 인덱스로 짝짓지 않는다. 빈 배열은 다음 API를 호출하지 않는다. 연결이 모호하거나 값이 계약과 다르면 실패하며 다른 값을 대신 넣지 않는다.

공식 graph factory에서 명시적인 반복 호출 범위는 `linkedItemCallIds`로 지정한다. API 원본 계약이 있어야 배열 기능을 등록할 수 있으므로, 동적인 등록이 필요한 호스트는 위의 독립 단계들을 LangGraph 노드로 구성한다. 기존 factory가 모든 반복 범위를 자동 계획한다고 주장하지 않는다. `Merge Append`만으로는 item별 zip·결과 수집을 보장하지 않는다. 아래의 전용 합류 기능은 원본 item 연결을 검사한다. 배치 실행에는 별도의 공개 컴파일 함수를 사용한다.

### IF와 assertion의 원본 응답 검사

조건이나 assertion이 API 응답을 읽으면 선택한 필드만 비교하기 전에 원본 OAS 응답 전체를 검사한다. 비교하지 않는 형제 필드가 잘못됐거나 status·Content-Type이 계약과 다르면 실패한다. IF 조건이 false가 될 응답도 검사에서 제외하지 않는다. 이는 모델이 예상 상태 코드를 정하는 단계가 아니라 실제 응답의 OAS 적합성 검사다.

공개 워크플로우 compiler는 `materials`에서 원본 응답 계약을 도출한다. 호스트가 같은 계약을 다시 작성하거나 LangGraph에 보정 단계를 넣을 필요는 없다. capability의 `compile`을 직접 호출할 때만 참조 API의 `apiResponseContracts`와 실제 `apiNodeNames`를 명시해야 한다. API 참조가 없는 literal 비교에는 응답 계약이 필요 없다.

IF는 Code 검사 노드 다음에 공식 IF 노드를 연결한다. 검사 노드는 원본 JSON·binary와 item 연결을 유지하고 가짜 item을 만들지 않는다. assertion도 같은 공통 reader를 사용한다. 타입은 `types/`, 공통 검사 생성은 `nodes/native/response-checks/`, IF·assertion 구현은 각각의 capability 파일에 있다.

`npm run test:array-iteration-local-n8n`은 신규 실패 사례 5개를 포함한 14개 실행을 검사한다. n8n 2.37.10은 `:`가 있는 오류의 표시 메시지를 잘라내는 문제가 있다. 원본 오류는 실행 stack에 남으므로 보고서에 두 값을 구분해 기록한다. 후속 호출 차단은 검증하지만 오류 표시 문제를 해결했다고 주장하지 않는다. 진단 메시지를 변형하는 우회도 추가하지 않았다.

### API 응답 배열의 중첩 반복

부모별 API 응답에 자식 배열이 있다면 `createResponseArrayCapability({ materials, itemMode: 'linked' })`로 등록한다. 이 모드는 각 입력 item에 연결된 API 응답 전체를 검사하고 배열을 분리한다. 처음 들어오는 단일 응답에도 같은 registry를 사용할 수 있다. 모드를 생략한 기존 경로는 한 개의 입력과 명확한 단일 응답만 허용한다.

```text
Manual Trigger → 부모 목록 API → 부모 Split Out
              → 부모별 자식 목록 API → 자식 Split Out
              → 부모·자식·중간 응답을 바인딩한 후속 API
```

모델은 제공된 API의 `sourceNodeId`와 배열 `pointer`만 선택한다. 실행 모드는 호스트가 정하고 코드가 배열 계약과 item 연결을 만든다. 자식 배열이 빈 부모는 후속 요청을 만들지 않으며 다른 부모의 연결에도 영향을 주지 않는다. 값·타입을 변환하거나 ID가 같다는 이유로 결과를 합치지 않는다. 실행 간 누적 수집은 아직 구현하지 않았다. 배치 실행은 아래의 별도 컴파일 경로다.

`npm run test:nested-array-iteration-local-n8n`은 API 다섯 개와 두 단계 Split Out을 실행한다. IF로 부모를 걸러내는 예시를 포함한 import JSON과 8개 사례의 보고서는 `.local-artifacts/nested-array-iteration/`에 저장된다. 계획은 회귀 테스트가 지정한다. 실제 모델의 중첩 반복 선택 정확도는 별도 평가가 필요하다. 예시에는 종료된 임시 계약 서버 주소가 있으므로 다시 실행하려면 주소와 서버를 구성한다.

선행 API 응답 검증에는 `apiResponseContracts`를 제공한다. linked 모드의 API 응답 바인딩에는 이 계약이 필수다. 실제 상태 코드와 Content-Type으로 OAS 응답 스키마를 고르고 본문 전체를 검사한 뒤 요청값을 조립한다. 모델에게 예상 상태 코드를 생성시키는 로직이 아니다. 기존 단일 item 경로에서 이 계약을 생략하면 요청값 검증만 수행하며, 선행 응답 전체를 검증했다고 볼 수 없다.

`npm run test:array-iteration-local-n8n`은 공개 계약 서버에서 기본 반복, item별 IF·assertion, 빈 배열과 실패 사례를 검증한다. import 가능한 JSON은 `.local-artifacts/array-iteration/workflow.json`과 `conditional-workflow.json`에 저장된다. 실제 ICL OAS를 사용한 로컬 검증 산출물은 비공개 `.local-artifacts/real-array-iteration/`에 남는다. 이 실행 검증은 실제 모델의 선택 정확도 평가나 실서비스 호출 검증과 다르다.

### Native 출력 배열의 반복

API 응답이 아닌 native 노드의 JSON 출력 배열은 `createNativeArrayCapability`로 분리한다. 호스트가 실제 producer에서 출력 계약과 컴파일된 노드 이름을 도출해 `sources`로 전달한다. 모델은 그 목록의 `sourceNodeId`와 배열 `pointer`만 선택한다. 코드가 출력 스키마를 만들고 원본 전체를 검사한 뒤 공식 Split Out 노드를 조립한다. API 응답의 pointer는 본문 기준이고 native 출력의 pointer는 JSON 루트 기준이다.

```ts
import {
  createNativeArrayCapability,
  createN8nNativeOutputSources,
} from '@openapi-flow/n8n';

// producerCapability와 producerPlan은 앞선 계획 단계의 실제 결과다.
const sources = createN8nNativeOutputSources({
  nativeNodes: [producerPlan],
  capabilities: [producerCapability],
  apiNodeNames: {},
});
const arrayCapability = createNativeArrayCapability({
  sources,
  itemMode: 'linked',
});
// 다음 planNativeNodes 호출의 capabilities에 arrayCapability를 전달한다.
```

원본이 `{ groups: [...] }`이면 모델은 `/groups`를 선택하고 각 출력은 `{ item: 원래 group }`이 된다. 다음 단계가 `/item/children`을 분리한다면 먼저 부모 Split Out의 출력 계약을 `createN8nNativeOutputSources`로 도출한다. 그 계약과 원래 producer의 계약을 다음 단계 registry에 전달한다. 같은 이름의 capability를 중복 등록하지 않고 해당 단계의 registry 항목을 교체한다. 이 단계 구성은 호스트가 맡으며 OSS가 반복 범위를 자동 탐색한 결과는 아니다.

linked 모드는 각 입력에 연결된 producer를 읽으므로 부모·자식의 연결을 유지한다. 빈 배열은 자식을 만들지 않는다. 값을 펼치거나 타입을 바꾸지 않으며 ID·값이 같아도 합치지 않는다. 모드를 생략하면 한 입력과 명확한 단일 producer 출력만 허용한다. 누락된 pointer나 잘못된 원본 필드·item은 후속 API 호출 전에 실패한다.

`npm run test:native-array-iteration-local-n8n`은 두 단계 Split Out과 서로 다른 REST API 다섯 개를 조립해 20개 사례를 실행한다. 기존 inline 계약과 재귀 `$defs`·`$ref` producer 계약으로 같은 10개 사례를 각각 검사한다. 정상 사례는 중간의 빈 부모를 건너뛰고 요청 13회를 수행하며 분기·연결 기준 합류·수집 뒤 배열 본문을 보낸다. 원래 값은 바꾸지 않는다. import JSON과 보고서는 `.local-artifacts/native-array-iteration/five-api-workflow.json`, `five-api-references-workflow.json`과 `report.json`에 저장한다. 전체 구성은 `test/fixtures/native-array-iteration-fixture.mjs`에서 확인한다. 임시 서버 주소가 포함되므로 다시 실행하려면 서버와 주소를 구성해야 한다. 지정된 계획의 회귀 검사이며 Chomsky의 선택 정확도나 실서비스 동작을 입증하지 않는다.

이전에 발견한 로컬 `$defs`·`$ref` 참조 결손은 원본 검사와 item 계약 도출 양쪽에서 수정했다. 각 producer의 원본 스키마를 독립된 루트로 검사하며, item·pointer 계약은 원본 resource를 보관한 표준 compound schema에서 원래 위치를 참조한다. Ajv의 공개 `addSchema`·`getSchema`와 fast-uri로 참조를 조회한다. `$id`가 없는 resource에는 코드가 결정적인 오프라인 조회 URI를 부여한다. 외부 서버에서 스키마를 가져오거나 사용자 데이터에 기본값을 넣는 동작은 없다.

원본 계약·값·타입은 유지하며 `$ref`와 같은 위치의 제약도 함께 적용한다. 이름이 같은 `$defs`를 사용하는 producer도 각각의 원본으로 검사한다. JavaScript에서 같은 스키마 객체를 여러 위치에 재사용하면 JSON의 각 위치를 복제해 참조 기준을 구분하고, JSON이 아닌 값이나 객체 순환은 필드를 버리지 않고 오류로 알린다. `const` 안의 `$ref`처럼 보이는 데이터는 스키마 참조로 해석하지 않는다.

`npm run test:native-schema-references`는 이제 원본 compiler와 재사용 가능한 item 계약의 정상·실패 값을 검사하는 통과 회귀 검사다. 재귀 참조, anchor, 중첩 상대 `$id`, 특수문자 pointer와 JSON 저장·복원도 검사한다. 외부 resource registry 주입, 동적 참조 범위의 projection 검증과 모든 복합 계약의 포함 관계 증명은 남아 있으므로 모든 native JSON Schema 지원이 끝났다고 보지는 않는다.

### 반복 결과 수집

`createResponseCollectionCapability({ materials })`를 등록하면 모델이 `collect-api-responses`의 `sourceNodeId`와 응답 본문 `pointer`를 선택한다. 코드가 실제 연결된 응답을 각각 원본 OAS로 검사하고 공식 Aggregate 노드를 만든다. 출력은 `{ items: 수집한 값의 배열 }`이다. `null`, 중복 값, 중첩 배열을 유지하며 다음 API의 배열 입력에는 `/items`를 바인딩한다. 수집 뒤의 API는 하나의 배열을 받으므로 일반 단일 item 모드를 사용한다.

이 기능은 한 번의 노드 실행에 들어온 item을 모으며 네트워크 응답 도착 순서를 보장하지 않는다. 배치 범위 뒤에 배치 완료 출력이 연결되면 모든 처리 item을 한 번에 받는다. reader가 각 item의 연결로 여러 실행 회차의 원본 API 응답을 읽는다. 빈 스트림에서는 수집 노드가 실행되지 않으며 빈 결과나 후속 호출을 임의로 만들지 않는다. item별 분기 합류 기능으로 사용해서도 안 된다. 수집한 값은 n8n 입력 item의 순서를 유지한다.

`.local-artifacts/array-iteration/collection-workflow.json`은 item별 검사 뒤 결과를 모아 다음 API로 보내는 예시다. `conditional-collection-workflow.json`은 IF의 조건을 통과한 결과만 모은다. 두 예시의 계획은 회귀 테스트가 지정하며, 실제 모델 품질 평가 결과는 아니다.

### 명시적인 배치 실행

OAS 계약·요청값·바인딩·native 설정·연결 계획을 만든 뒤 `compileBatchedN8nWorkflow`를 호출한다. 아래의 `completePlanInput`은 일반 `compilePlannedN8nWorkflow`와 같은 입력이다. 배치 크기와 범위는 호스트가 제공하며 모델에게 실행 JavaScript나 순환 연결을 생성시키지 않는다.

```ts
import { compileBatchedN8nWorkflow } from '@openapi-flow/n8n';

const result = compileBatchedN8nWorkflow({
  ...completePlanInput,
  batchScopes: [
    {
      id: 'process-record-batches',
      batchSize: 2,
      nodeIds: ['details', 'confirm', 'audit', 'verify-item'],
      entryNodeId: 'details',
      exitNodeId: 'verify-item',
    },
  ],
});
// 검토 후 result.workflow를 import한다. 이 함수는 실행하지 않는다.
```

기존 DAG의 경로는 `목록 → Split Out → details → confirm → audit → verify-item → 수집 → submit`이다. 코드는 원본 계획을 검사하고 공식 SDK로 Loop Over Items를 추가한다. `loop`는 details로 들어가고 verify-item은 제어 노드로 돌아온다. 모든 배치가 끝나면 `done`으로 수집·submit을 한 번 실행한다. linked 요청·검증은 각 item의 원본 응답 연결을 유지하고 OAS로 값을 검사한다. 원본 DAG 자체에 순환을 허용하는 것은 아니다.

배치 범위는 하나의 입구와 출구를 두고 입력 item마다 연결된 결과 하나를 내거나 오류로 끝나야 한다. linked 요청과 linked assertion은 `preservesInputItems`로 이 계약을 선언한다. 완전한 병렬 분기는 아래의 ancestry 합류로 묶는다. 사용자 compiler도 선언한 계약을 지켜야 하며 검사가 임의 JavaScript의 동작까지 증명하지는 않는다. IF의 한쪽을 버리는 경로, Split Out·Aggregate·일반 Merge Append는 완전한 반환 계약이 없다. 빈 출력 때문에 반환 연결이 실행되지 않으면 남은 배치가 중단될 수 있다. 이 검사는 OAS 문서 수용 제한이 아니다. Split Out은 범위 앞에, 수집은 완료 뒤에 둔다. item을 제거하는 Filter의 완료 처리, 중첩 범위와 자동 범위 계획은 남은 작업이다.

`npm run test:batch-iteration-local-n8n`은 API 다섯 개, 배치 크기 1·2·10, 연속 배치 범위, 시작점의 배치, 완료 후 수집과 오류 중단을 포함한 10개 사례를 실행한다. import JSON과 보고서는 `.local-artifacts/batch-iteration/`에 저장한다. 비공개 ICL OAS 계약 서버는 기존 설정에 `OPENAPI_FLOW_ITERATION_BATCH_SIZE=2`를 추가해 검사하며 산출물은 `.local-artifacts/real-array-iteration/batch-2/`에 남는다. 임시 서버 주소가 포함돼 다시 실행하려면 서버와 주소를 구성해야 한다. 실제 모델 품질 평가나 실서비스 호출 검증은 아니다.

### 배치 안의 조건과 건너뛰기

`createExclusiveBranchMergeCapability()`를 registry에 명시적으로 추가하면 `rejoin-exclusive-branches`를 사용할 수 있다. 모델이 정하는 설정은 기존 IF의 `sourceNodeId`뿐이며 Merge의 버전·모드·입력 개수는 코드가 만든다. IF의 두 경로를 서로 다른 `input1`·`input2`로 연결한다. 조건에 맞지 않는 item에 업무 호출이 필요 없다면 `createPassThroughCapability()`로 실제 입력을 그대로 반환하는 경로를 계획한다. 두 capability 모두 기본 registry에 자동 추가하지 않는다.

```text
details → eligible IF ─ true → confirm → audit → verify-item ┐
                     └ false → skip-business-call ──────────┤
                                       returned-items Merge → 배치 반환
배치 완료 → details의 원본 /input 수집 → submit
```

core는 같은 IF의 서로 다른 두 대안이 모두 합류하는지 검사한다. 배치 compiler는 각 대안의 중간 노드가 item 하나당 연결된 출력 하나를 유지하고 같은 범위 안에서 돌아오는지도 확인한다. 한쪽의 누락·중복, 독립 분기 혼합과 잘못된 소스는 오류다. 일반 `merge-append`의 독립 분기 계약은 유지한다. true에서만 실행한 audit 응답을 false나 합류 뒤에서 무조건 읽을 수 있게 만들지도 않는다.

실행은 공식 Merge 3.2 Append와 `executionOrder: 'v1'`을 사용한다. n8n 2.37.10의 대기 노드 처리를 실제 실행으로 확인했다. 한 대안이 비어 있어도 다른 대안의 실제 item을 그대로 반환하며 빈 완료 item·`alwaysOutputData`·값 보정은 넣지 않았다. item을 없애는 Filter를 지원한 결과로 해석하면 안 된다. 모든 item을 건너뛰어도 완료되지만 반환 경로에는 원래 item이 남는다.

`npm run test:conditional-batch-local-n8n`은 크기 1·2·10에서 전부 통과·일부 통과·전부 건너뛰기와 빈 입력·원본/응답/media type/assertion 오류를 포함한 14개 사례를 검사한다. API 다섯 개가 있지만 confirm·audit은 조건에 맞는 item만 호출한다. 수집 대상은 모든 item의 원본 details `/input`이며 건너뛴 item을 업무 API 성공 응답으로 표시하지 않는다. import 예시는 `.local-artifacts/conditional-batch/workflow-conditional-batch-1-3.json`, 보고서는 같은 폴더의 `report.json`이다. 다시 실행하려면 종료된 임시 서버와 주소를 구성해야 한다. 지정 계획의 계약 서버 검증이며 실제 Chomsky 품질 평가나 업무 서비스 호출은 수행하지 않는다.

### 배치 안의 API 분기와 합류

각 분기가 모든 입력 item의 결과를 하나씩 내면 배치 안에서도 분기·합류한다. 목록 응답을 `each-record`로 나눈 뒤 공통 입구에서 alpha·beta·gamma API로 나눠 보내고, `joined`에서 같은 원본 item의 응답을 합쳐 consume API에 전달하는 경로다. 마지막 배치까지 처리하면 완료 출력으로 결과를 한 번 수집한다.

```text
records → each-record → [배치 입구 → alpha ┐
                                 → beta  ├→ joined → consume] → 수집
                                 → gamma ┘
```

공통 입구가 필요하면 `createPassThroughCapability()`를 등록하고 `{ id: 'batch-entry', capability: 'pass-through', parameters: {} }`를 계획에 둔다. 공식 [No Operation 노드](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop/)로 입력을 그대로 전달한다. 결손 API의 대역이나 빈 배치의 완료 신호를 만드는 기능은 아니며 기본 registry에 자동 등록하지 않는다. 이미 있는 item 보존 노드를 입구로 써도 된다.

아래 `completePlanInput`에는 위의 입구·분기·합류·후속 호출·수집 연결과 각 API의 원본 계약이 있어야 한다. `join-api-items`는 아래 절의 방식으로 등록하며, 공유 scope는 실제 `each-record` 출력이다.

```ts
import {
  compileBatchedN8nWorkflow,
  createPassThroughCapability,
} from '@openapi-flow/n8n';

const result = compileBatchedN8nWorkflow({
  ...completePlanInput,
  capabilities: [
    ...completePlanInput.capabilities,
    createPassThroughCapability(),
  ],
  batchScopes: [
    {
      id: 'process-branch-batches',
      batchSize: 2,
      nodeIds: ['batch-entry', 'alpha', 'beta', 'gamma', 'joined', 'consume'],
      entryNodeId: 'batch-entry',
      exitNodeId: 'consume',
    },
  ],
});
```

코드는 `joinsInputItemsByAncestry: { scopeNodeId }` 선언과 분기별 조상 연결을 검사한다. 이 합류 선언은 단일 입력을 보존한다는 `preservesInputItems`와 구분한다. 분기 순서나 같은 ID·값으로 짝짓지 않는다. 배치 앞의 item 보존 relay도 원본 연결을 유지하지만, 앞선 별도 배치의 완료 출력을 원본 출구 노드의 마지막 실행 결과로 간주하지는 않는다. 조건으로 일부 item을 빼는 배치, 중첩 배치와 서로 다른 scope 실행의 합류는 아직 지원 완료 범위가 아니다.

`npm run test:batch-item-join-local-n8n`은 배치 크기 1·2·10, 분기 2·3개, 순서를 뒤집은 분기, 같은 ID·값, 빈 입력과 계약·media type 오류를 포함한 8개 사례를 실행한다. `.local-artifacts/batch-item-join/five-api-workflow.json`은 API 다섯 개로 원본 item 세 개에 요청 13회를 수행한 예시다. 합류는 배치마다 하고 수집은 완료 뒤 한 번만 한다. 중간 오류는 이후 배치와 최종 수집을 중단하지만 이미 완료한 API 호출을 되돌리지는 않는다. 임시 서버 주소를 쓰는 지정 회귀 계획이므로 실제 모델 품질이나 실서비스 동작을 입증하지는 않는다.

### item별 API 분기 합류

API 계약과 배열 분리 노드를 정한 뒤, 실제로 컴파일된 scope 출력으로 합류 기능을 등록한다. 호스트가 제공한 scope와 API 중에서 모델이 `scopeNodeId`와 `sourceCallIds`를 선택한다. 소스 순서는 `input1`, `input2` 등 입력 포트의 순서를 뜻하며 호출 순서나 배열 위치로 결과를 짝짓는 규칙이 아니다.

```ts
const scopeOutputs = createN8nNativeOutputSources({
  nativeNodes: scopeNodes,
  capabilities: [arrayCapability],
  apiNodeNames,
});
const joinCapability = createItemJoinCapability({
  materials: selectedApiMaterials,
  scopes: scopeOutputs,
});
// 두 함수는 @openapi-flow/n8n에서 가져온다.
// joinCapability를 native 계획 단계의 capabilities에 명시적으로 제공한다.
```

코드는 각 분기의 OAS 응답을 검사하고 n8n의 item 연결로 같은 원본 item의 결과만 합친다. ID나 JSON 값이 같아도 별도 item으로 유지한다. 한 분기의 순서가 달라져도 합류되며, 참여한 item의 분기 응답이 빠지거나 중복되면 후속 API를 호출하기 전에 실패한다. 모든 분기가 같은 item을 제외하면 그 item은 출력하지 않는다. 이는 모든 원본 item이 반드시 처리됐다는 보장을 뜻하지는 않는다.

출력은 `{ responses: { callId: 원본 응답 본문 } }`이다. 후속 API는 linked 모드에서 이 출력과 기존 API·scope 값에 바인딩한다. `pairedItem`은 합류에 참여한 입력 모두를 보존한다. 한 번의 실행 안에서 합류하며, 위의 명시적인 배치에서는 배치별 실행마다 완전한 분기를 합친다. 중첩 배치와 다른 scope 실행의 합류는 지원 완료 범위가 아니다.

`npm run test:item-join-local-n8n`의 `.local-artifacts/item-join/five-api-workflow.json`은 목록 API 하나, 독립 분기 API 세 개, 합류 뒤 API 하나를 사용하는 import 예시다. 원본과 분기의 순서·동일 값·필터·결손을 검사하는 지정 계획이며, 실제 모델 품질 평가나 실서비스 실행 결과로 해석하면 안 된다.

실제 ICL OAS를 사용한 재현 명령은 다음과 같다. 모델 응답을 스크립트로 지정하는 기본 검사이며 실제 ICL 서비스는 호출하지 않는다. 실제 LangChain 모델은 검증 함수에 별도로 주입할 수 있다.

```sh
OPENAPI_FLOW_ICL_OAS_PATH=/absolute/path/to/icl.openapi.json npm run test:native-output-bindings-local-n8n
```

## CLI 실행

Node.js 24 이상에서 저장소 루트를 기준으로 실행한다.

```sh
npm ci
npm run build
cd examples/langgraph-workflow
cp .env.example .env
mkdir -p artifacts
# .env의 LLM 연결 정보와 OAS·시나리오를 수정한다. 실행 주소·credential 참조는 선택 사항이다.
npm run generate
```

`.env`와 `artifacts/`는 Git에서 제외한다. `LLM_API_KEY`는 로컬 환경에만 저장한다. 모델은 JSON Schema 기반 선택과 OAS에서 만든 Zod schema의 function calling을 지원해야 한다. OpenAI 호환 endpoint는 CLI에서 연결하고, 다른 LangChain 모델이나 Chomsky 토큰 발급은 호출자가 구성한 모델을 graph factory에 주입한다. 내부 endpoint·토큰 발급 방식은 이 패키지에 넣지 않는다.

`OAS_SOURCES_JSON`은 문서 ID와 파일 경로 목록이다. CLI는 JSON을 읽어 표준 OAS인지 검사한다. `DEPLOYMENTS_JSON`은 선택 사항이며, 문서 ID별 실행 주소와 기존 n8n credential 참조를 받는다. 배열 전체·문서별 항목·개별 `baseUrl`·`credentialBindings`를 생략할 수 있다. 생략한 주소는 `https://replace_me.invalid`, 필요한 credential 참조는 `REPLACE_ME:<documentId>:<schemeName>`으로 표시한다. 모델 연결·OAS·시나리오 등 다른 필수 설정은 유지하고, 기존 출력 파일도 덮어쓰지 않는다.

```ts
const graph = createPlannedWorkflowGenerationGraph({
  model,
  capabilities: createN8nNativeCapabilities(),
  deployments: [
    { documentId: 'inventory', baseUrl: 'https://inventory.example.test' },
    { documentId: 'billing' },
  ],
});
// deployments 자체를 생략해도 import용 템플릿을 생성한다.
```

미설정 항목은 노드의 `notes`와 `notesInFlow`로 표시한다. OAS의 `servers`에서 실행 주소를 자동 선택하거나 credential 비밀값을 JSON에 넣지 않는다. OAS가 인증을 요구하지 않으면 credential placeholder도 만들지 않는다. 잘못 입력한 URL·credential, 중복·없는 문서 ID, 필수 요청값 누락은 오류다. 현재 지원하지 않는 인증 조합을 임의의 Bearer로 바꾸지도 않는다.

템플릿은 import할 수 있지만 실제 설정을 연결하기 전에는 실행용 결과가 아니다. 주소·credential을 넣어 다시 생성하거나 JSON의 placeholder를 교체한 뒤 기존 n8n credential을 선택한다. 응답 바인딩이 있는 요청의 주소는 `Materialize` 노드 설정에도 들어 있으므로 HTTP Request 노드만 수정해서는 충분하지 않다. `baseUrl`을 제공해 재생성하면 이 설정을 함께 반영한다.

### OAS 인증과 credential 참조

인증 종류는 LLM이 고르지 않는다. core의 `resolveOpenApiSecurity`가 OAS의 인증 요구와 scope를 읽고, n8n의 `resolveHttpRequestAuthentication`이 기존 credential 종류로 매핑한다. 직접 입력한 요청값과 선행 응답 바인딩은 같은 인증 경로를 사용한다.

| OAS security scheme | n8n credential type |
| ------------------- | ------------------- |
| `http / bearer`     | `httpBearerAuth`    |
| `http / basic`      | `httpBasicAuth`     |
| `http / digest`     | `httpDigestAuth`    |
| `apiKey / header`   | `httpHeaderAuth`    |
| `apiKey / query`    | `httpQueryAuth`     |
| `oauth2`            | `oAuth2Api`         |

호출자는 OAS scheme 이름을 키로 기존 credential의 ID·이름을 제공한다. API key의 header/query 이름은 OAS의 `name`과 같아야 한다. OAuth2의 grant·token URL·scope는 n8n credential에 설정한다. 비밀값은 workflow JSON이나 모델 입력에 넣지 않는다. 노드 안내에 OAS 요구를 표시하지만, 라이브러리가 n8n credential 저장소의 실제 설정까지 검사하는 것은 아니다. 설정 방법은 [n8n 공식 HTTP Request credential 문서](https://docs.n8n.io/integrations/builtin/credentials/httprequest)를 따른다.

`security` 배열에 인증 대안이 여러 개면 0부터 시작하는 `securityRequirementIndex`를 명시해야 한다. 첫 대안을 자동 선택하지 않는다. `{}` 대안을 명시적으로 선택하면 익명 요청이다. factory의 문서별 deployment에 넣은 index는 해당 문서의 선택된 API 모두에 적용된다. API별 선택이 다르면 독립 함수 `createHttpRequestNode`에 각각 전달한다. 여러 scheme을 동시에 요구하는 AND 조합, cookie API key, OpenID Connect, mutual TLS의 변환은 남은 작업이다. 해당 기능이 있는 표준 OAS의 수용 자체를 거절하지는 않는다.

`npm run test:http-authentication-local-n8n`은 격리 n8n 2.37.10에서 위 6종을 직접 입력·선행 응답 바인딩으로 각각 실행한다. 로컬 서버가 인증 전송, Digest challenge 응답, OAuth2 client-credentials 토큰 발급을 확인한다. 다른 OAuth2 grant나 실제 서비스 권한까지 검증한 결과는 아니다. 임시 credential은 검증 후 n8n volume과 함께 제거한다.

## 실제 코드 흐름

```text
buildCatalog → selectOperations(LLM) → resolveContracts
             → generateArguments(LLM) → compileWorkflow → END
```

| 파일                                                        | 역할                                     |
| ----------------------------------------------------------- | ---------------------------------------- |
| `src/graph/create-dag-workflow-generation-graph.ts`         | 다중 선택·요청값 생성과 호스트 DAG 조립  |
| `src/graph/create-single-call-workflow-generation-graph.ts` | CLI용 단일 호출 조합                     |
| `src/schemas/workflow-state-schema.ts`                      | 단계 사이에 전달할 상태 정의             |
| `src/types/workflow-graph.ts`                               | 모델·배포 정보 주입 타입                 |
| `src/model/create-openai-compatible-model.ts`               | CLI용 모델 연결                          |
| `src/cli/generate-workflow.ts`                              | 설정·OAS 입력과 JSON 파일 출력           |
| `specs/inventory.openapi.json`                              | 공개용 상품 조회·복수 조회·가격 조회 OAS |

카탈로그에는 여러 서비스의 OAS를 넣을 수 있다. 선택 결과는 문서 ID·snapshot·operation pointer로 원본 계약과 연결한다. 두 번째 LLM 호출은 계약에서 만든 structured-output schema에 맞춰 값만 생성한다. HTTP method·path·schema·credential·상태 코드 기대값은 모델이 만들지 않는다. graph state의 `z.custom`은 이미 검증한 라이브러리 객체를 전달하는 타입 채널이며 LLM 출력 schema가 아니다.

`createWorkflowGenerationGraph`는 단일 호출만 조립한다. 여러 API를 골랐다면 명시적인 DAG 설계가 필요하다는 오류를 낸다. 다중 호출에는 `createDagWorkflowGenerationGraph`를 사용한다. 두 경로 모두 선택 배열의 순서를 실행 순서로 사용하지 않는다. API가 부족하거나 필수 값이 없을 때도 오류로 알리고, 추측하거나 정답 값으로 교체하지 않는다. 자동 재시도·HITL·자가개선은 내장하지 않았다.

## 권장 사용 경계

workspace 안에서는 아래처럼 graph factory를 호출한다. `model`은 호출자가 만든 LangChain 모델이고, `serviceSpec`은 읽어 둔 OAS 문서다. 이 예제 패키지 이름은 workspace 연결용이며 npm에서 설치할 수 있는 배포 패키지가 아니다. 별도 앱에서는 예제의 조합 코드를 가져와 자신의 graph로 구성한다.

```ts
import { createWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const graph = createWorkflowGenerationGraph({
  model,
  deployments: [
    {
      documentId: 'inventory',
      baseUrl: trustedInventoryUrl,
      credentialBindings: { bearer: existingN8nBearerCredential },
    },
  ],
});
const result = await graph.invoke({
  workflowId: 'price-review',
  workflowName: 'Product price review',
  scenario: 'Read the price of item-1. Do not use the cache.',
  sources: [{ id: 'inventory', spec: serviceSpec }],
  trace: [],
});
// Review result.selection, result.arguments and result.workflow before execution.
```

LLM은 graph 의존성으로 주입하고 state에는 넣지 않는다. credential의 ID·이름만 JSON에 기록한다. 실제 ICL Bearer 토큰과 n8n 인스턴스 관리 키는 서로 다른 인증값이며 어느 것도 모델 입력에 넣지 않는다. 새 HTTP Request 경로는 위 6종 인증을 매핑한다. `/legacy`의 단일 Bearer 계약은 유지하며, 모든 OAS 인증을 변환하는 것은 아니다.

출력 JSON의 API·값·배포 주소를 검토한 뒤, 별도의 승인 단계에서 n8n으로 import·실행한다. 이 예제는 JSON을 생성할 뿐 실제 endpoint를 호출하거나 원격 n8n을 수정하지 않는다. 호스트는 승인·재질의·LangGraph `interrupt`와 checkpointer·실행 권한을 별도로 구성해야 한다. SDK 검증 통과와 실제 API 성공도 구분한다.

개인·사내 검증 코드는 이 workspace의 `public-api.ts`를 import하고, OAS·Chomsky 연결·로컬 계약 서버를 저장소 밖에서 주입할 수 있다. 공개 회귀 테스트는 `test/langgraph-example.test.mjs`에 있으며 실제 LLM이나 n8n 없이 graph의 조립 흐름과 실패 경계를 검사한다. 외부 호출 검증은 별도로 수행해야 한다.

LangGraph 구성 방식은 [공식 Graph API 문서](https://docs.langchain.com/oss/javascript/langgraph/graph-api)를 따른다. 예제는 저장소의 MIT 라이선스를 따르며 n8n SDK 의존성의 별도 라이선스도 적용된다.

## 다중 API와 n8n 자체 노드

`createDagWorkflowGenerationGraph`는 같은 독립 단계를 재사용한다. 모델은 API 목록을 선택하고 각 API의 OAS schema에 맞는 요청값만 만든다. `reviewSelection`은 요청값 생성 전에 선택을 검사하는 동기 호스트 hook이다. 실제 HITL 중단·재개를 제공하는 hook은 아니므로 비동기 승인은 호출자의 LangGraph 단계로 구성한다.

`composeDag`는 계약·요청값·HTTP Request fragment 목록을 받아 `nodes`, `edges`, `starts`를 반환한다. API의 문서 ID와 operationRef로 역할을 연결하고, n8n SDK로 만든 제어 노드를 더한다. 선택 배열의 인덱스는 호출 ID를 구분할 뿐 연결 순서를 결정하지 않는다. 선택한 API가 topology에서 빠지면 실패한다.

```ts
import { createDagWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const graph = createDagWorkflowGenerationGraph({
  model,
  deployments,
  reviewSelection: reviewExpectedOperations,
  composeDag: composeApprovedScenario,
});
// Same invoke input as the single-call graph.
// composeApprovedScenario returns explicit nodes, named-port edges and starts.
```

일반적인 구성은 아래와 같다. 두 갈래는 그래프 구조이며 네트워크 요청을 동시에 실행한다는 뜻은 아니다.

```text
Start → 코어 조회 → IF ─ false → Stop And Error
                     └ true ─┬→ 단건 가격 → 복수 가격 A ─┐
                              └→ 복수 코어 → 복수 가격 B ─┴→ Merge → Code 검사
```

`IF` fragment의 `true`, `false` 출력은 각각 SDK 출력 index `0`, `1`이다. `Merge`는 두 입력을 `0`, `1`로 따로 연결한다. [n8n Merge 공식 문서](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)의 Append 동작대로 양쪽 입력을 받은 뒤 아이템을 합친다. 호스트는 실행 설정의 `executionOrder: 'v1'`도 명시해야 한다.

현재 HTTP Request compiler는 full response를 반환한다. 응답 본문의 성공 값은 `$json.body.code`로 읽으며, `$json.code`가 아니다. 응답 전체는 `{ body, headers, statusCode, statusMessage }` 구조다. Code 노드의 비교 코드는 호스트가 검토한 정적 코드로 구성하고 모델이 임의 JavaScript를 작성하게 하지 않는다. SDK `update({ name })`은 인스턴스의 기존 이름을 유지하므로 이름을 바꿀 때는 원본 config를 사용해 새 SDK node를 생성해야 한다.

공개 회귀 테스트 `test/langgraph-dag-example.test.mjs`는 API 5개와 `IF`, `Merge`, `Code`, `Stop And Error`의 JSON 조립, 역순 선택에도 유지되는 연결, 선택 검토·필수 입력·선택 API 누락 실패를 검사한다. 이 테스트는 실제 노드 실행 검증과 구분한다. 사내 OAS·모델 연결·실행 로그는 공개 예제에 넣지 않는다.

## 다음 확장

필요한 추가 n8n 기능의 매퍼, item을 제거하는 Filter의 배치 완료 처리, 중첩 배치 범위와 실행 간 합류·수집은 남은 작업이다. 조건의 두 경로를 명시적으로 다시 합치는 배치는 위의 별도 기능으로 지원한다. 응답값의 의미·타입을 자동으로 바꾸지 않는다. Code·IF의 응답 비교와 API 요청값의 응답 바인딩은 각각 별도 단계로 구현했다. 의존성 보안 경고의 해결은 실행 검증과 별개다. 자동 `npm audit fix --force`는 사용하지 않는다.

## 자연어에서 조건·연결까지 계획하기

`createPlannedWorkflowGenerationGraph`는 `composeDag` 없이 최종 그래프를 만든다. API 선택 1회, 응답 바인딩 계획 1회, 선택한 API별 리터럴 요청값 생성, 그래프 계획 1회를 각각 호출한다. 리터럴 schema가 비어 있는 호출은 코드가 `{values: {}}`를 확정하므로 LLM을 부르지 않는다. 모델은 API 재료와 자체 노드의 설명·Zod schema를 받아 자체 노드 설정, 조건·검증 항목, `edges`, `gaps`를 반환한다. `starts`는 core의 `createWorkflowGraphPlan`이 들어오는 연결선이 없는 노드에서 계산하고, 잘못된 연결·순환·응답 의존성은 계속 거절한다. HTTP method·URL·credential·n8n 노드 버전과 실행 JavaScript는 모델이 만들지 않는다.

```text
catalog → select(LLM) → resolve → bindings(LLM) → arguments(LLM, 호출별)
        → graph-plan(LLM) → validate/compile → import용 JSON
```

```ts
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { createPlannedWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const graph = createPlannedWorkflowGenerationGraph({
  model,
  deployments,
  capabilities: createN8nNativeCapabilities(),
});
const result = await graph.invoke({
  workflowId: 'planned-review',
  workflowName: 'Planned review',
  scenario,
  sources,
  trace: [],
});
// 승인 전에 result.graphPlan과 result.workflow를 검토한다.
```

기본 registry는 IF, Merge Append, 응답 검증용 Code, StopAndError를 등록한다. 각 매퍼는 `packages/n8n/src/nodes/native/`의 별도 파일이며 공통 fragment·응답 참조 처리는 `common/`에 둔다. Code는 모델의 JavaScript가 아니라 타입 있는 비교 항목을 라이브러리가 변환한 코드다. 응답 참조는 `{source: 'response', nodeId, pointer: '/result/...'}`로 표현하며 `pointer`는 OAS 응답 본문 기준이다. n8n의 `body` envelope와 SDK 노드 이름은 컴파일러가 연결한다.

독립적으로는 `planApiBindings`, `generateApiArguments`, `planWorkflowGraph`, `compilePlannedN8nWorkflow`를 나누어 호출한다. 응답 바인딩은 `{kind: 'node-output', sourceNodeId, sourcePointer: '/result/id', targetPointer: '/path/id'}`처럼 OAS 본문·요청 기준 Pointer로 표현한다. `reviewBindings` hook에서 검토할 수 있다. 모델의 리터럴 출력 스키마에서는 바인딩 필드를 제외하고, 실행 시 Code가 실제 값을 읽어 완성된 요청을 OAS schema로 검사한다. 일반 단일 item 모드는 여러 응답 중 첫 값을 고르지 않고 중단한다. 반복 범위에는 위의 linked 모드를 사용하며 native 출력 바인딩도 명시적인 계약으로 제공한다.

리터럴 생성은 core의 `createApiArgumentGenerationContract`에서 Zod 출력 schema·모델 입력 설명·호출 필요 여부를 함께 만든다. 바인딩된 요청 필드의 원본 정의나 바인딩 계획을 이 단계의 모델에 다시 보내지 않는다. 열린 객체에서도 바인딩 대상은 생성 금지 제약으로 차단하며 나머지 추가 속성은 OAS대로 허용한다. 생성할 값이 없는 중첩된 닫힌 body와 전체 body 바인딩은 모델을 호출하지 않는다. OAS가 허용한 선택 필드라도 시나리오가 생략을 요구했다면 그 요구를 따라야 하며, 시나리오 검증 실패와 OAS 검증 실패는 별개다.

호스트는 capability의 설명·설정 schema·포트·분기 의미·응답 참조 추출기·컴파일러를 등록해 확장한다. n8n의 모든 노드를 자동 지원한다는 뜻은 아니다. 자체 비교 노드도 일반 모드에서는 명확한 단일 응답을 요구하며 linked 모드에서는 현재 item의 연결된 응답을 검사한다.

검사는 존재하지 않는 노드·포트, 중복 ID·연결, 잘못된 시작점, 순환, 앞서 실행되지 않은 API 응답 참조, 서로 배타적인 IF 분기의 Merge를 거절한다. 응답 필드의 모든 OAS dialect·타입을 정적으로 증명하지는 않는다. 실행 중 없는 필드를 읽으면 오류를 내며 다른 값으로 채우지 않는다. 시나리오 요구를 빠짐없이 계획했는지는 사람 검토와 정상·실패 fixture 검증으로 확인해야 한다.

`planWorkflowGraph`는 충족하지 못한 요구를 `gaps`로 반환한다. `createPlannedWorkflowGenerationGraph`는 결손이 있으면 오류로 중단한다. 검토용 JSON도 필요하다면 아래의 `createReviewableWorkflowGenerationGraph`를 선택한다. 호출자는 독립 계획 함수를 LangGraph의 승인·재계획 단계에 넣을 수 있다. `reviewPlan` 비동기 hook도 제공하지만 checkpointer·`interrupt`·자동 재시도를 내장한 것은 아니다.

반환된 모델 출력의 검사 실패는 `@openapi-flow/langchain`의 `WorkflowGraphPlanningError`로 전달한다. `failure.stage`는 `proposal-schema` 또는 `graph-validation`이며, `failure.output`에 거절된 출력을 보존한다. schema 검사 전의 출력은 `unknown`, schema를 통과한 그래프 제안은 `WorkflowGraphProposal`이다. 호출자는 이 오류를 잡아 비공개 기록이나 사람 검토 단계에 전달할 수 있다. 통신 오류와 모델 호출 내부의 파싱 실패는 반환된 제안이 없어 원래 오류로 전파된다. 라이브러리는 실패한 출력을 보정하거나 재시도하지 않는다.

구조 회귀는 `test/planned-workflow.test.mjs`에서 확인한다. 실제 n8n의 [IF](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.if/)와 [Merge Append](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/) 동작은 별도 실행 검증이 필요하며 SDK 검사만으로 성공을 판단하지 않는다.

## 결손 검토용 JSON

`createReviewableWorkflowGenerationGraph`는 결손 유무와 관계없이 `result.workflow`에 n8n import용 JSON을 반환한다. 결손이 있어도 확인된 API의 바인딩·입력 생성과 내부 DAG 계획을 이어간다. 정상 노드는 그대로 두고, 구현하지 못한 단계와 그 단계의 결과가 필요한 API 호출만 실패하는 대역 노드로 표시한다. 검토 경로는 `src/graph/review/`에, 기존 strict 경로는 `src/graph/build-planned-workflow-graph.ts`에 분리했다. 카탈로그·선택·계약 조회는 공통 단계를 사용한다.

```ts
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { createReviewableWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';

const graph = createReviewableWorkflowGenerationGraph({
  model,
  capabilities: createN8nNativeCapabilities(),
  // deployments is optional; omitted settings produce visible placeholders.
});
const result = await graph.invoke({
  workflowId: 'review-requirements',
  workflowName: 'Inventory and pricing review',
  scenario,
  sources,
  trace: [],
});
if (!result.workflow) throw new Error('Generation returned no workflow');
// Save/import result.workflow. Both statuses use the same JSON output key.
if (result.status === 'needs-review') {
  // Display result.diagnostics and result.reviewPlan; do not auto-connect Start.
}
// Review deployment placeholders and approve execution separately.
```

결손이 있는 compiler 결과는 `{ status: 'needs-review', workflow, diagnostics }`다. HTTP Request와 n8n 자체 노드, 응답값 조립용 내부 연결을 유지한다. 결손은 입출력 `main` 포트가 있는 Code 노드와 설명용 Sticky Note로 표현한다. Code는 실행되면 `OPENAPI_FLOW_UNRESOLVED_STEP` 오류를 내며, 없는 API의 method·path·요청값·응답은 만들지 않는다. 내부 DAG의 실제 root는 계획에 남기되, 최종 JSON에는 모든 `Start → root` 연결을 넣지 않고 `active: false`를 표시한다. 결손이 없는 결과는 같은 strict compiler를 사용해 Start를 연결한다.

독립 조합에서도 같은 경로를 쓸 수 있다. `core`의 `ReviewableWorkflowApiMaterial`은 실제 입력이 있는 `ready`와, 원본 OAS·바인딩·원인 결손 ID만 있는 `blocked`를 구분한다. `langchain`의 `planReviewableWorkflowGraph`가 `additionalNativeNodes`, `edges`, `additionalGaps`, `blockedCalls`를 제안하고, 코드는 기존 노드와 추가 노드를 반환 계획의 `nativeNodes`로 조립한다. Core가 root·참조·포트·순환·합류·응답 가용성을 검사한다. `n8n`의 `compileReviewableN8nWorkflow({id, name, materials, plan, apiNodes, capabilities})`는 unblocked ready 호출의 실제 fragment만 받아 SDK로 조립한다. 각 함수를 사용자의 LangGraph에 따로 배치할 수 있다. 예전 미배포 notes-only preview API는 제거했으며 alias를 두지 않았다.

선택 결손은 명시적인 ID로, 바인딩 결손은 `{ callId, targetPointer, description }`로 추적한다. 바인딩 결손의 대상은 요청 OAS에 존재해야 한다. 확정된 응답 바인딩을 통해 결손 호출에 의존하는 호출도 원인 ID를 이어받아 `blocked`가 되고, 이 호출에는 리터럴 입력 생성 LLM을 호출하지 않는다. 이름이 같은 필드를 자동 연결하는 로직은 없다. 그래프 단계에서 추가로 드러난 선행 작업 결손은 모델이 해당 호출을 `blockedCalls`로 명시해야 하며, blocked 응답을 사용하는 정상 노드는 검사에서 거부한다.

잘못된 OAS·모델 출력·연결 구조, 빠진 필수 리터럴 값, 정상 호출의 미지원 인증·compiler 오류는 임의의 결손으로 바꾸지 않는다. 자동 보정·재시도도 하지 않는다. 새 factory는 이전 `workflow`, `status`, `diagnostics`, `reviewMaterials`, `reviewPlan`이 들어 있는 입력을 거부한다. 검토·재개 루프는 독립 함수를 호출자의 LangGraph에 조합한다. CLI의 단일 호출 경로와 기존 strict factory의 fail-fast 동작은 유지한다.

Start 분리는 생성 정책이지 보안 경계가 아니다. 사용자가 Start를 다시 연결하면 결손 이전의 실제 API는 호출될 수 있다. `active: false`도 수동 실행을 막지는 않는다. 부분 실행·편집·실행 승인과 credential 통제는 호스트가 맡는다. 결과에는 요청값·배포 주소·credential 참조·결손 설명이 포함될 수 있으므로 공유 전에 확인한다. 결손 보고가 API 부재나 전체 시나리오 충족을 증명하는 것은 아니다.

`npm run test:workflow-review-local-n8n`은 공개 다중 OAS와 scripted model을 사용한다. 세 결손 단계와 독립 root 사례의 JSON을 로컬 n8n 2.37.10에 import·export해 실제 노드·설정·내부 연결을 확인한다. 분리된 상태에서는 Start만 실행되고 API 호출이 0건인지 검사한다. 한 사례는 의도적으로 Start를 다시 연결해 로컬 계약 서버가 선행 API 호출 1건만 받고 결손 노드에서 멈추는지 확인한다. 실제 LLM·실서비스·브라우저 부분 실행은 검증하지 않는다. JSON과 개인정보를 제외한 실행 요약은 `.local-artifacts/workflow-review/`에 저장한다.

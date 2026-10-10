# LangGraph 워크플로 생성 예제

`openapi-flow`의 현재 공개 API를 사용하는 공식 예제 패키지다. CLI는 자연어 시나리오에서 API 하나를 고르고, 원본 OAS 타입에 맞는 요청값을 생성한 뒤 n8n import용 JSON을 저장한다. 다중 API에는 모델이 조건·연결까지 계획하는 factory와 호스트가 연결을 명시하는 factory를 제공한다. HTTP 서버나 API 실행기는 제공하지 않는다. 이 workspace는 `private: true`이며 npm에 배포하지 않는다. 아직 배포하지 않은 `0.2.0` 소스를 대상으로 한다.

## 현재 개발 범위

Manual Trigger로 시작해 OAS에 정의된 REST API를 호출하는 워크플로우에 집중한다. 여러 API 선택, 요청값 생성, 선행 응답 바인딩과 제공된 native 기능을 사용한 조건·합류가 대상이다. 여러 item의 반복 실행은 이 범위에 남아 있는 과제다.

반복 실행의 기본 경로와 한 번의 실행 안에서 결과 수집·API 분기 합류를 구현했다. linked 모드의 중첩 배열 분리, 직렬 배치 반복과 배치 안의 완전한 API 분기·합류도 검증했다. 아래의 item별 REST API 호출과 합류 기능을 사용한다. 조건·필터를 포함한 배치 경로, 중첩 배치 범위, 실행 간 합류·누적 수집과 자동 배치 범위 계획은 루트 README의 TODO에 남겨 두었다.

Webhook·callback의 추가 구현은 보류한다. 수신 요청의 인증·스키마 검사와 callback 등록·응답 연결도 당장은 구현하지 않는다. 기존 inbound 추출·legacy 생성 코드는 유지하며, 이 개발 범위 때문에 표준에 맞는 OAS 문서를 거절하지 않는다.

## native 출력 바인딩

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

각 OSS 함수도 따로 사용할 수 있다. `planNativeNodes`는 선택된 API 계약과 등록된 native 스키마에서 인스턴스·설정만 제안한다. 포트·출력 계약·결손 ID는 코드가 도출한다. `planWorkflowConnections`는 확정된 재료의 연결·결손만 제안하고 API 값이나 native 설정을 다시 생성하지 않는다. `orchestrateWorkflow`는 준비된 API 입력을 대상으로 이 두 함수를 조합하며 `materials`, `capabilities`, `preparedNativeNodes`, `gaps`, `edges`를 각각 생략할 수 있다. 주지 않은 기능·API를 선택하지 않고 기본 registry도 넣지 않는다. 준비된 native 노드가 있으면 그 구현 registry는 필요하다.

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

배치 범위는 하나의 입구와 출구를 두고 입력 item마다 연결된 결과 하나를 내거나 오류로 끝나야 한다. linked 요청과 linked assertion은 `preservesInputItems`로 이 계약을 선언한다. 완전한 분기는 아래의 명시적인 ancestry 합류로 묶는다. 사용자 compiler도 선언한 계약을 지켜야 하며, 검사가 임의 JavaScript의 동작까지 증명하지는 않는다. IF·Split Out·Aggregate·일반 Merge Append는 배치 반환 계약이 없어 범위 안에 넣으면 거절한다. 빈 출력 때문에 반환 연결이 실행되지 않으면 남은 배치가 중단될 수 있다. 이 검사는 OAS 문서 수용 제한이 아니다. Split Out은 범위 앞에, 수집은 완료 뒤에 둔다. 조건·필터 경로, 중첩 범위와 자동 범위 계획은 남은 작업이다.

`npm run test:batch-iteration-local-n8n`은 API 다섯 개, 배치 크기 1·2·10, 연속 배치 범위, 시작점의 배치, 완료 후 수집과 오류 중단을 포함한 10개 사례를 실행한다. import JSON과 보고서는 `.local-artifacts/batch-iteration/`에 저장한다. 비공개 ICL OAS 계약 서버는 기존 설정에 `OPENAPI_FLOW_ITERATION_BATCH_SIZE=2`를 추가해 검사하며 산출물은 `.local-artifacts/real-array-iteration/batch-2/`에 남는다. 임시 서버 주소가 포함돼 다시 실행하려면 서버와 주소를 구성해야 한다. 실제 모델 품질 평가나 실서비스 호출 검증은 아니다.

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

필요한 추가 n8n 기능의 매퍼, 조건·필터를 포함한 배치 경로, 중첩 배치 범위와 실행 간 합류·수집은 남은 작업이다. 응답값의 의미·타입을 자동으로 바꾸지 않는다. Code·IF의 응답 비교와 API 요청값의 응답 바인딩은 각각 별도 단계로 구현했다. 의존성 보안 경고의 해결은 실행 검증과 별개다. 자동 `npm audit fix --force`는 사용하지 않는다.

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

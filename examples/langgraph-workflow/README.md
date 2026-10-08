# LangGraph 워크플로 생성 예제

`openapi-flow`의 현재 공개 API를 사용하는 공식 예제 패키지다. CLI는 자연어 시나리오에서 API 하나를 고르고, 원본 OAS 타입에 맞는 요청값을 생성한 뒤 n8n import용 JSON을 저장한다. 다중 API에는 모델이 조건·연결까지 계획하는 factory와 호스트가 연결을 명시하는 factory를 제공한다. HTTP 서버나 API 실행기는 제공하지 않는다. 이 workspace는 `private: true`이며 npm에 배포하지 않는다. 아직 배포하지 않은 `0.2.0` 소스를 대상으로 한다.

## native 출력 바인딩

`createPlannedWorkflowGenerationGraph`와 `createReviewableWorkflowGenerationGraph`는 선택 사항인 `preparedNativeNodes`를 받는다. 호스트가 먼저 준비한 native 노드의 출력 계약을 OSS의 바인딩 함수에 전달하고, 최종 모델 호출은 그 노드의 값을 다시 생성하지 않고 연결을 계획한다. 타입이나 단위가 맞지 않으면 자동 보정하지 않는다. API의 OAS 계약은 그대로 유지한다.

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

커스텀 native 기능은 `outputSchema(parameters)`로 JSON 출력 계약을 선언한다. 계약은 구현에서 도출하며 모델에게 생성시키지 않는다. 현재는 하나의 명확한 JSON item을 바인딩한다. 여러 item 중 하나를 임의로 고르는 동작과 항목별 반복은 제공하지 않는다. 이 예시의 `preparedNativeNodes`는 호스트가 지정하지만 바인딩·검사·컴파일은 OSS의 공개 함수가 수행한다. 자연어에서 임의의 모든 native 생산자를 먼저 고르는 계획 단계까지 자동 제공하는 것은 아니다.

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

`OAS_SOURCES_JSON`은 문서 ID와 파일 경로 목록이다. CLI는 JSON을 읽어 표준 OAS인지 검사한다. `DEPLOYMENTS_JSON`은 선택 사항이며, 문서 ID별 실행 주소와 기존 n8n credential 참조를 받는다. 배열 전체·문서별 항목·개별 `baseUrl`·`credentialBindings`를 생략할 수 있다. 생략한 주소는 `https://replace_me.invalid`, 필요한 Bearer 참조는 `REPLACE_ME:<documentId>:<schemeName>`으로 표시한다. 모델 연결·OAS·시나리오 등 다른 필수 설정은 유지하고, 기존 출력 파일도 덮어쓰지 않는다.

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

LLM은 graph 의존성으로 주입하고 state에는 넣지 않는다. credential의 ID·이름만 JSON에 기록한다. 실제 ICL Bearer 토큰과 n8n 인스턴스 관리 키는 서로 다른 인증값이며 어느 것도 모델 입력에 넣지 않는다. 현재 n8n 인증 매핑은 단일 HTTP Bearer다. 다른 OAS 인증을 모두 변환하는 것은 아니다.

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

다른 n8n 자체 기능의 매퍼, 응답값 변환·아이템별 반복은 남은 작업이다. Code·IF의 응답 비교와 API 요청값의 응답 바인딩은 각각 별도 단계로 구현했다. 의존성 보안 경고의 해결은 실행 검증과 별개다. 자동 `npm audit fix --force`는 사용하지 않는다.

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

독립적으로는 `planApiBindings`, `generateApiArguments`, `planWorkflowGraph`, `compilePlannedN8nWorkflow`를 나누어 호출한다. 응답 바인딩은 `{kind: 'node-output', sourceNodeId, sourcePointer: '/result/id', targetPointer: '/path/id'}`처럼 OAS 본문·요청 기준 Pointer로 표현한다. `reviewBindings` hook에서 검토할 수 있다. 모델의 리터럴 출력 스키마에서는 바인딩 필드를 제외하고, 실행 시 Code가 실제 값을 읽어 완성된 요청을 OAS schema로 검사한다. 단일 API 호출 응답이 여러 아이템으로 나뉘면 임의로 첫 아이템을 고르지 않고 중단한다. 아이템별 반복과 자체 노드 출력 바인딩은 아직 별도 구현이 필요하다.

리터럴 생성은 core의 `createApiArgumentGenerationContract`에서 Zod 출력 schema·모델 입력 설명·호출 필요 여부를 함께 만든다. 바인딩된 요청 필드의 원본 정의나 바인딩 계획을 이 단계의 모델에 다시 보내지 않는다. 열린 객체에서도 바인딩 대상은 생성 금지 제약으로 차단하며 나머지 추가 속성은 OAS대로 허용한다. 생성할 값이 없는 중첩된 닫힌 body와 전체 body 바인딩은 모델을 호출하지 않는다. OAS가 허용한 선택 필드라도 시나리오가 생략을 요구했다면 그 요구를 따라야 하며, 시나리오 검증 실패와 OAS 검증 실패는 별개다.

호스트는 capability의 설명·설정 schema·포트·분기 의미·응답 참조 추출기·컴파일러를 등록해 확장한다. n8n의 모든 노드를 자동 지원한다는 뜻은 아니다. 자체 비교 노드는 현재 첫 응답 아이템의 본문을 대상으로 한다.

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

독립 조합에서도 같은 경로를 쓸 수 있다. `core`의 `ReviewableWorkflowApiMaterial`은 실제 입력이 있는 `ready`와, 원본 OAS·바인딩·원인 결손 ID만 있는 `blocked`를 구분한다. `langchain`의 `planReviewableWorkflowGraph`가 `nativeNodes`, `edges`, `additionalGaps`, `blockedCalls`를 제안하고, core가 root·참조·포트·순환·합류·응답 가용성을 검사한다. `n8n`의 `compileReviewableN8nWorkflow({id, name, materials, plan, apiNodes, capabilities})`는 unblocked ready 호출의 실제 fragment만 받아 SDK로 조립한다. 각 함수를 사용자의 LangGraph에 따로 배치할 수 있다. 예전 미배포 notes-only preview API는 제거했으며 alias를 두지 않았다.

선택 결손은 명시적인 ID로, 바인딩 결손은 `{ callId, targetPointer, description }`로 추적한다. 바인딩 결손의 대상은 요청 OAS에 존재해야 한다. 확정된 응답 바인딩을 통해 결손 호출에 의존하는 호출도 원인 ID를 이어받아 `blocked`가 되고, 이 호출에는 리터럴 입력 생성 LLM을 호출하지 않는다. 이름이 같은 필드를 자동 연결하는 로직은 없다. 그래프 단계에서 추가로 드러난 선행 작업 결손은 모델이 해당 호출을 `blockedCalls`로 명시해야 하며, blocked 응답을 사용하는 정상 노드는 검사에서 거부한다.

잘못된 OAS·모델 출력·연결 구조, 빠진 필수 리터럴 값, 정상 호출의 미지원 인증·compiler 오류는 임의의 결손으로 바꾸지 않는다. 자동 보정·재시도도 하지 않는다. 새 factory는 이전 `workflow`, `status`, `diagnostics`, `reviewMaterials`, `reviewPlan`이 들어 있는 입력을 거부한다. 검토·재개 루프는 독립 함수를 호출자의 LangGraph에 조합한다. CLI의 단일 호출 경로와 기존 strict factory의 fail-fast 동작은 유지한다.

Start 분리는 생성 정책이지 보안 경계가 아니다. 사용자가 Start를 다시 연결하면 결손 이전의 실제 API는 호출될 수 있다. `active: false`도 수동 실행을 막지는 않는다. 부분 실행·편집·실행 승인과 credential 통제는 호스트가 맡는다. 결과에는 요청값·배포 주소·credential 참조·결손 설명이 포함될 수 있으므로 공유 전에 확인한다. 결손 보고가 API 부재나 전체 시나리오 충족을 증명하는 것은 아니다.

`npm run test:workflow-review-local-n8n`은 공개 다중 OAS와 scripted model을 사용한다. 세 결손 단계와 독립 root 사례의 JSON을 로컬 n8n 2.37.10에 import·export해 실제 노드·설정·내부 연결을 확인한다. 분리된 상태에서는 Start만 실행되고 API 호출이 0건인지 검사한다. 한 사례는 의도적으로 Start를 다시 연결해 로컬 계약 서버가 선행 API 호출 1건만 받고 결손 노드에서 멈추는지 확인한다. 실제 LLM·실서비스·브라우저 부분 실행은 검증하지 않는다. JSON과 개인정보를 제외한 실행 요약은 `.local-artifacts/workflow-review/`에 저장한다.

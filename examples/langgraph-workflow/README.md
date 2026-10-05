# LangGraph 워크플로 생성 예제

`openapi-flow`의 현재 공개 API를 사용하는 공식 예제 패키지다. CLI는 자연어 시나리오에서 API 하나를 고르고, 원본 OAS 타입에 맞는 요청값을 생성한 뒤 n8n import용 JSON을 저장한다. 다중 API는 별도의 DAG factory에서 호스트가 연결을 명시해 조립한다. HTTP 서버나 API 실행기는 제공하지 않는다. 이 workspace는 `private: true`이며 npm에 배포하지 않는다. 아직 배포하지 않은 `0.2.0` 소스를 대상으로 한다.

## 실행

Node.js 24 이상에서 저장소 루트를 기준으로 실행한다.

```sh
npm ci
npm run build
cd examples/langgraph-workflow
cp .env.example .env
mkdir -p artifacts
# .env의 LLM 연결 정보와 실제 n8n credential ID·이름을 수정한다.
npm run generate
```

`.env`와 `artifacts/`는 Git에서 제외한다. `LLM_API_KEY`는 로컬 환경에만 저장한다. 모델은 JSON Schema 기반 선택과 OAS에서 만든 Zod schema의 function calling을 지원해야 한다. OpenAI 호환 endpoint는 CLI에서 연결하고, 다른 LangChain 모델이나 Chomsky 토큰 발급은 호출자가 구성한 모델을 graph factory에 주입한다. 내부 endpoint·토큰 발급 방식은 이 패키지에 넣지 않는다.

`OAS_SOURCES_JSON`은 문서 ID와 파일 경로 목록이다. CLI는 JSON을 읽어 표준 OAS인지 검사한다. `DEPLOYMENTS_JSON`은 문서 ID별 신뢰할 서버 주소와 기존 n8n credential 참조다. OAS의 `servers`나 모델 출력에서 실행 주소를 추측하지 않는다. 필수 설정이 없으면 실패하며, 기존 출력 파일을 덮어쓰지 않는다.

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

호스트가 명시한 다중 API·제어 노드 DAG는 조립할 수 있다. 자연어에서 연결 구조까지 생성하는 DAG planner, 범용 제어 노드 registry/compiler, 새 요청 compiler의 선행 응답 바인딩 실행은 아직 구현하지 않았다. Code 노드가 앞선 응답을 읽는 예제와 API 요청값에 응답을 바인딩하는 기능도 서로 다르다. 의존성 보안 경고의 해결은 실행 검증과 별개다. 자동 `npm audit fix --force`는 사용하지 않는다.

# openapi-flow 독립 API 코드 따라가기

이 문서는 패키지를 분리한 저장소 소스를 기준으로 한다. 아직 npm에 배포하지 않은 `0.2.0` 작업이며, 기존 전체 생성 경로는 [이전 가이드](legacy-code-walkthrough.ko.md)와 `legacy` 코드에 남아 있다.

## 진입점과 호출 흐름

호스트는 OAS 수집, 모델 설정, LangGraph의 재시도·사람 검토, 실제 import·실행을 맡는다. OSS는 각 단계의 함수를 제공한다. 아래 화살표는 호출 예제이지 라이브러리에 고정된 실행 순서가 아니다.

```text
문서별 {id, spec}
  → core: createApiCatalog → listApiOperations
  → langchain: selectApiOperations       모델 호출: 후보와 사용 목적 선택
  → core: resolveApiOperations           모델 없음: 선택된 전체 OAS 계약 조회
  → langchain: generateApiArguments      모델 호출: 호출별 요청값만 생성
  → n8n: createHttpRequestNode           모델 없음: 요청 노드 생성
  → n8n: assembleN8nWorkflow             모델 없음: 호스트가 지정한 DAG 조립
```

하나의 문서도 같은 배열 입력을 쓴다. 선택 결과의 순서가 API 실행 순서는 아니다. 실제 연결은 `edges`, 시작점은 `starts`로 지정한다. 같은 Operation을 여러 번 호출하려면 서로 다른 `callId`를 준다.

| 단계        | 직접 열어 볼 파일                                                                             | 확인할 내용                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 카탈로그    | [create-api-catalog.ts](../packages/core/src/openapi/catalog/create-api-catalog.ts)           | Scalar 검증·참조 해석, 문서 ID와 snapshot hash, 후보 메타데이터                                        |
| 선택        | [select-api-operations.ts](../packages/langchain/src/selection/select-api-operations.ts)      | 후보 enum으로 structured output 생성, `SystemMessage`·`HumanMessage`, 모델 선택을 원래 작업 key로 연결 |
| 계약 조회   | [resolve-api-operations.ts](../packages/core/src/openapi/resolve-api-operations.ts)           | 문서·스냅샷 확인, 전체 Operation 보존, parameter override와 security/server 상속                       |
| 값 스키마   | [create-api-arguments-schema.ts](../packages/core/src/schemas/create-api-arguments-schema.ts) | 선택한 OAS의 parameter/body 제약을 보존한 Zod 검증·출력 계약 생성                                      |
| 값 생성     | [generate-api-arguments.ts](../packages/langchain/src/arguments/generate-api-arguments.ts)    | 한 호출의 시나리오 값 생성, Zod 파싱, 미해결 입력 반환                                                 |
| OAS 검사    | [validate-api-arguments.ts](../packages/core/src/arguments/validate-api-arguments.ts)         | 선언되지 않은 값·타입·원본 제약 검사, 빠진 필수값 Pointer                                              |
| 노드 생성   | [create-http-request-node.ts](../packages/n8n/src/nodes/request/create-http-request-node.ts)  | 어댑터 경계의 직렬화·credential 연결, SDK HTTP Request 노드                                            |
| 그래프 조립 | [assemble-n8n-workflow.ts](../packages/n8n/src/workflow/assemble-n8n-workflow.ts)             | 노드·port·edge·root·순환 검사, SDK 연결과 JSON 출력                                                    |

각 패키지의 `public-api.ts`가 실제 공개 함수 목록이다. core에는 모델이나 n8n SDK import가 없고, langchain과 n8n은 서로 의존하지 않는다. 외부 입력과 반환 타입은 각 패키지의 `types/`, structured-output 정의는 `schemas/`, 모델 지침은 `prompts/`에서 찾는다.

## OAS별 선택 실행 설정과 placeholder

`createHttpRequestNode`의 `baseUrl`·`credentialBindings`는 선택 사항이다. 공식 LangGraph 예제의 `deployments`도 생략할 수 있고, 문서 ID별로 일부 설정만 제공해도 된다. [resolve-http-request-deployment.ts](../packages/n8n/src/nodes/request/deployment/resolve-http-request-deployment.ts)는 제공한 값을 검사하고 미제공 주소에는 `https://replace_me.invalid`, 필요한 credential 참조에는 `REPLACE_ME:<documentId>:<schemeName>`을 넣는다. 원본 OAS의 `servers`나 모델 출력으로 실제 실행 환경을 추측하지 않는다.

설정 타입은 [request-deployment.ts](../packages/n8n/src/types/request-deployment.ts), 검사 schema는 [request-deployment-schema.ts](../packages/n8n/src/schemas/request-deployment-schema.ts), 미설정 안내는 [create-request-deployment-notes.ts](../packages/n8n/src/nodes/request/deployment/create-request-deployment-notes.ts)에 있다. 주소·credential 참조는 LLM에 전달하지 않는다. 인증 없는 API에는 credential을 추가하지 않으며, 잘못 제공한 값·필수 요청값 누락·미지원 인증은 기존처럼 실패한다. placeholder 허용 범위는 미제공 실행 설정뿐이다.

템플릿 JSON의 노드에는 `notes`와 `notesInFlow`로 교체할 항목을 표시한다. 실행하려면 실제 설정을 넣어 재생성하거나 placeholder를 교체해야 한다. 바인딩 요청의 주소는 `Materialize` 노드 설정에도 포함돼 있으므로 HTTP Request 노드만 바꾸면 안 된다. 기존 `/legacy` compiler의 필수 실행 설정은 변경하지 않았다.

## 조건·연결을 자동 계획하는 경로

자동 조합은 [create-planned-workflow-generation-graph.ts](../examples/langgraph-workflow/src/graph/create-planned-workflow-generation-graph.ts)를 연다. 이 진입점이 호출하는 [build-planned-workflow-graph.ts](../examples/langgraph-workflow/src/graph/build-planned-workflow-graph.ts)에 실제 단계 등록·연결이 있다. 공통 API 준비 단계 뒤 `planGraph`를 호출하고, `compileWorkflow`에서 계획을 n8n JSON으로 변환한다. 기존 호스트 명시 DAG와 이 경로의 공통 단계는 [prepare-api-workflow.ts](../examples/langgraph-workflow/src/graph/prepare-api-workflow.ts)에 있다.

[plan-workflow-graph.ts](../packages/langchain/src/workflow/plan-workflow-graph.ts)는 선택한 OAS 계약·요청값과 자체 기능 설명을 모델에 전달한다. [workflow-graph-proposal-schema.ts](../packages/langchain/src/schemas/workflow-graph-proposal-schema.ts)는 등록된 설정 schema로 자체 노드, 조건·검증, `edges`, `gaps`를 받는다. 모델은 API 노드 JSON이나 JavaScript를 생성하지 않는다.

[create-workflow-graph-plan.ts](../packages/core/src/workflow/create-workflow-graph-plan.ts)는 들어오는 연결선이 없는 노드 목록을 `starts`로 계산한다. 이 값은 연결 구조에서 정해지는 메타데이터이므로 모델이 별도로 고르지 않는다. 연결선을 추가하거나 바꾸지는 않는다. 선행 응답이 필요한 노드가 연결되지 않았다면 시작점으로 계산돼도 응답 가용성 검사에서 실패한다. 결손 보고는 `starts: []`로 반환하며 컴파일할 수 없다. 호스트가 직접 완성된 `WorkflowGraphPlan`을 제공하는 경로에서는 명시한 시작점과 실제 root가 일치해야 한다.

[workflow-graph-planning-error.ts](../packages/langchain/src/workflow/workflow-graph-planning-error.ts)의 `WorkflowGraphPlanningError`는 반환된 모델 출력의 검사 실패를 구분한다. `failure.stage`가 `proposal-schema`이면 `failure.output`은 아직 검증되지 않은 `unknown`이고, `graph-validation`이면 schema를 통과한 `WorkflowGraphProposal`이다. 후자도 실행 가능한 계획으로 승인된 것은 아니다. 호출자는 이 오류를 잡아 비공개 진단 기록이나 사람 검토 단계로 넘길 수 있다. 자동 재시도·출력 보정은 없으며, 모델 호출 내부의 통신·파싱 오류는 반환된 계획이 없어 이 오류 타입으로 감싸지 않는다.

[validate-workflow-graph-plan.ts](../packages/core/src/workflow/validate-workflow-graph-plan.ts)는 모든 경로에서 선행 API 응답이 존재하는지, Merge 입력 분기가 함께 실행 가능한지까지 검사한다. [create-native-capabilities.ts](../packages/n8n/src/nodes/native/create-native-capabilities.ts)는 IF·Merge·검증·중단의 별도 매퍼를 등록하고, [compile-planned-n8n-workflow.ts](../packages/n8n/src/workflow/compile-planned-n8n-workflow.ts)는 이를 SDK JSON으로 조립한다. 본문 pointer와 n8n full-response envelope를 연결하는 코드는 `nodes/native/response-check-code.ts`에 있다.

현재 응답 pointer의 모든 OAS 타입을 정적으로 증명하는 것은 아니며, 없는 필드는 런타임 오류로 드러낸다. API 요청의 응답 바인딩과 조건·검증용 응답 읽기는 별도 단계다.

## 선행 응답을 후속 요청에 넣는 경로

자동 예제의 실제 단계는 `catalog → select → resolve → bindings → arguments → graph-plan → compile`이다. 단일 API 예제는 기존 선택·값 생성 경로를 유지한다.

1. [plan-api-bindings.ts](../packages/langchain/src/bindings/plan-api-bindings.ts)는 선택된 전체 OAS 계약과 시나리오를 받아 API 사이의 `{sourceNodeId, sourcePointer, targetPointer}`만 계획한다. 조건·응답 단언은 이 단계가 생성하지 않는다.
2. [validate-api-binding-plan.ts](../packages/core/src/bindings/validate-api-binding-plan.ts)는 호출 ID·OAS 필드·알려진 비호환 타입·중복 대상·순환을 검사한다. JSON Pointer는 응답 본문 기준이며 n8n의 `body` envelope를 모델이 넣지 않는다.
3. [create-api-argument-generation-contract.ts](../packages/core/src/schemas/create-api-argument-generation-contract.ts)는 리터럴 생성용 Zod schema·동일한 JSON Schema·LLM 호출 필요 여부를 함께 만든다. `generateApiArguments`는 원본 요청 정의와 바인딩 계획 대신 이 생성용 schema와 호출 메타데이터를 전달한다. 바인딩 대상의 원래 타입 설명은 제거하고 생성 금지 제약만 남긴다. 추가 속성이 열린 객체에서도 해당 경로를 다시 생성할 수 없다. 생성할 리터럴이 없으면 빈 `values`를 반환하고 LLM 호출을 생략한다. 중첩된 닫힌 body와 전체 body 바인딩도 이 기준을 따른다. OAS가 추가 속성을 허용하면 그 영역은 남겨 두며, 같은 DTO를 쓰는 다른 API의 값을 복사하지 않도록 호출별 시나리오를 해석한다.
4. 그래프 계획·검사는 데이터 생산자가 모든 실행 경로에서 소비자보다 먼저 완료되는지 확인한다. 독립 호출은 별도 가지로 두고, 여러 결과를 사용하는 호출은 합류 뒤에 둔다. 시나리오에 별도 실행 순서나 조건이 있으면 함께 지킨다.
5. [create-bound-request-fragment.ts](../packages/n8n/src/nodes/request/bindings/create-bound-request-fragment.ts)는 `Materialize callId` Code와 `Request callId` HTTP Request를 만든다. 내부 연결은 fragment의 `internalEdges`, 외부 연결은 논리 호출 ID의 entry·exit로 구분한다.
6. [materialize-api-arguments.ts](../packages/core/src/bindings/materialize-api-arguments.ts)는 실제 응답값을 타입 변경 없이 복사한다. 필요한 객체·배열 구분은 OAS가 정하며, 숫자 필드명만 보고 배열로 추측하지 않는다. 모호한 schema에는 명시적 리터럴 컨테이너가 필요하다.
7. [compile-request-validator.ts](../packages/n8n/src/nodes/request/bindings/compile-request-validator.ts)는 전체 OAS 요청 schema를 호스트에서 Ajv standalone 코드로 컴파일한다. [materialize-http-request.ts](../packages/n8n/src/nodes/request/runtime/materialize-http-request.ts)가 완성된 값의 원본 제약을 검사한 뒤, `serialization/serialize-http-request.ts`의 공통 직렬화로 path·query·header·cookie·body를 만든다. 값 누락·타입 오류·리터럴 충돌은 HTTP 전 오류로 드러낸다.

`core/bindings/`는 데이터 계약, `langchain/bindings/`는 모델 호출, `n8n/nodes/request/bindings/`는 SDK fragment 생성, `runtime/`은 실행 시 값 검사, `serialization/`은 공통 요청 변환을 맡는다. 타입·schema·prompt는 각 패키지의 기존 전용 폴더에 둔다. 독립 함수들은 호출자의 LangGraph에서 재조합할 수 있다.

독립 가지가 곧 네트워크 동시 실행을 보장하지는 않는다. [n8n 실행 순서 문서](https://docs.n8n.io/build/flow-logic/understand-execution-order/)에 따르면 `v1`은 가지를 순서대로 처리한다. 여기서 검증하는 DAG는 불필요한 직렬 의존선을 만들지 않는 구조다.

## 두 번째 모델 호출을 확인하는 법

`generateApiArguments`는 선택된 전체 계약을 받아 `createApiArgumentGenerationContract`를 호출한다. 예를 들어 `POST /items`의 body가 `{name: string, quantity: integer}`이면 모델 출력도 `values.body.name`, `values.body.quantity`를 그 타입으로 받는다. 모델이 OAS나 JSON Schema 문자열을 생성하는 것이 아니다. `createApiArgumentsSchema`는 같은 계약의 Zod schema만 받으려는 호출자를 위한 공개 함수다.

[create-oas-value-schema.ts](../packages/core/src/schemas/create-oas-value-schema.ts)는 실험적 `z.fromJSONSchema`를 사용하지 않는다. 동적 OAS 제약을 Zod의 개별 타입으로 재구성하면 `type` 없는 제한이나 `enum` 옆의 제한이 빠질 수 있기 때문이다. 공개 API인 `superRefine`으로 Scalar 검증기를 연결하고, `meta`에 같은 스키마를 등록해 모델에게도 해당 제약을 전달한다. 내부의 범용 입력은 JSON 값 검사를 거쳐 `ZodType<JsonValue>`로 반환하며, 바깥 응답은 기존 `ApiArgumentProposal` 타입을 유지한다. 원본 OAS는 바꾸지 않는다.

[normalize-oas-value-schema.ts](../packages/core/src/openapi/common/normalize-oas-value-schema.ts)는 OAS 3.0의 `nullable`과 boolean 배타적 경계만 JSON Schema 2020-12 표현으로 옮긴다. 타입을 추측하거나 enum에 null을 추가하지 않으며, format·설명·example 데이터도 유지한다. 스키마별 `$id`는 내부 `$ref`의 범위를 보존하는 식별자이지 API 요청값이 아니다. [create-oas-value-validator.ts](../packages/core/src/openapi/common/create-oas-value-validator.ts)는 이 계약을 컴파일하고 실패하면 출처를 포함한 오류를 낸다. `validateApiArguments`와 최종 요청의 `createApiRequestSchema`도 같은 변환을 사용하므로 모델의 부분 입력과 바인딩 후 필수값 검사가 서로 다른 버전 해석을 쓰지 않는다. 모델 공급자가 특정 JSON Schema 표현을 지원하는지는 별도 경계이며, 그 이유로 제약을 조용히 제거하지 않는다.

실행 시 가져올 `enableCache`가 바인딩되었다면 모델에 원래 boolean 정의와 응답 참조 계획을 다시 보내지 않는다. 생성용 schema에는 이 필드를 받을 수 없다는 `false` 또는 `{not: {}}` 제약이 남을 수 있다. 이는 OAS에서 필드를 삭제하거나 금지하는 것이 아니라, 이미 다른 노드가 공급하기로 정한 값을 리터럴 생성 단계가 덮어쓰지 못하게 하는 계약이다. 모델이 이를 어기면 값 삭제·치환 없이 schema 경계에서 실패한다.

생성용 schema는 아직 조립되지 않은 부분 입력을 검사한다. 따라서 바인딩이 공급할 속성·배열 길이를 부분 입력의 최소 조건에 다시 요구하지 않는다. `oneOf`의 구분 필드가 바인딩되면 생성 단계는 가능한 분기의 나머지 값을 받으며, 정확히 한 분기를 만족하는지는 실제 응답값과 조립한 뒤 원본 OAS로 검사한다. 원본의 필수 조건·개수 제한·분기 조건은 바꾸지 않는다.

OAS 적합성과 테스트 시나리오 준수는 구분한다. OAS에서 허용한 선택 필드를 시나리오가 특정 호출에서 생략하라고 했다면, 그 필드를 넣은 요청은 OAS에는 맞아도 시나리오 검사에서 실패한다. 라이브러리는 해당 필드를 모든 API에서 금지하지 않는다. 또한 OAS가 `additionalProperties`를 허용하면 선언된 필드가 전부 바인딩되어도 추가 리터럴의 가능성이 남는다. 이 경우를 닫힌 객체의 완전 바인딩과 혼동하지 않는다.

검증 노드의 `$('Node').first()`는 n8n의 공식 런타임 API다. SDK의 [`nodeJson()`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/workflow-sdk/src/expression/index.ts)은 `.item` 참조 표현식을 만들고, [`runOnceForAllItems()`](https://github.com/n8n-io/n8n/blob/master/packages/%40n8n/workflow-sdk/src/utils/code-helpers.ts)은 Code 함수 본문을 추출한다. 둘 다 OAS 본문의 JSON Pointer 해석·누락 검사·시나리오 비교를 대신 수행하는 함수는 아니다. 현재 라이브러리는 이 비교 의미를 직접 구현하며 SDK의 아이템 연결 방식으로 임의 교체하지 않는다.

시나리오가 이름만 주면 모델은 `{values: {body: {name: "demo"}}}`처럼 일부 값만 제안할 수 있다. 코드가 원본 OAS에서 필수인 `quantity`를 확인해 반환값의 `unresolvedInputs`에 `/body/quantity`를 기록한다. 이 누락 목록은 LLM 출력에 넣지 않으며, 생략한 선택 필드와 별도로 관리하는 credential을 요청값 누락으로 판단하지 않는다. 값이 없는 상태로 노드 컴파일을 요청하면 즉시 오류가 난다. 임의 수량이나 다른 필드에서 가져온 값으로 채우지 않는다.

모델용 스키마는 미해결 값을 허용하는 제안 형식이다. 원본 OAS의 `required`를 수정해 저장하거나, 실행 시 필수값 검사를 없애는 것이 아니다. 요청값 생성에는 예상 응답 코드나 `expectedBody`가 없다. 응답 계약 전체는 조회 결과에 보존한다.

## 재현할 테스트

저장소 루트에서 다음을 실행한다. 첫 테스트는 가짜 모델을 사용하므로 외부 모델이나 실서비스 API를 호출하지 않는다.

```sh
npm run build
node --test test/composable-api.test.mjs
OPENAPI_FLOW_REAL_OAS_DIR=/path/to/private/oas npm run test:real-oas
npm run test:local-n8n
npm run test:request-bindings-local-n8n
npm run test:deployment-template-local-n8n
```

[composable-api.test.mjs](../test/composable-api.test.mjs)는 독립 선택·값 생성·노드 조립, 같은 Operation의 문서별 식별, 원본 응답·인증 대안 보존, 누락 입력과 값 오류, 배열 순서와 무관한 fan-out DAG를 확인한다. [real-oas.mjs](../integration/real-oas.mjs)는 비공개 OAS 문서의 모든 REST 계약과 선언된 각 body media type의 요청값 스키마를 확인한다. 원본 fixture는 공개 레포로 복사하지 않는다.

[local-n8n-smoke.mjs](../integration/local-n8n-smoke.mjs)는 격리된 n8n 컨테이너와 로컬 HTTP 응답기를 만든다. 새 독립 API로 만든 세 요청의 fan-out 그래프를 import·실행해 직렬화된 요청을 검사한다. 기존 문서 간 응답 참조와 webhook/callback 회귀도 함께 실행한다. 테스트가 만든 임시 컨테이너와 볼륨만 종료·제거한다.

[request-bindings-local-n8n.mjs](../integration/request-bindings-local-n8n.mjs)는 공개 fixture 두 OAS의 API 5개로 응답 ID·배열·객체 전달, 독립 세 가지와 Merge 뒤 다중 응답 전달을 검사한다. 같은 JSON에서 서버의 응답 ID만 바꿔 요청값 변경을 확인하고, 필드 누락·잘못된 타입에서 후속 HTTP가 차단되는지도 실행한다. 실제 모델을 호출하는 테스트와는 구분한다.

[deployment-template-local-n8n.mjs](../integration/deployment-template-local-n8n.mjs)는 설정 없는 템플릿을 격리 n8n에 import한 뒤 export해 주소·credential placeholder와 안내가 유지되는지 확인한다. 네트워크를 차단한 컨테이너에서 실행하며 업무 API를 호출하지 않는다. 템플릿의 실 API 실행 성공을 검증하는 테스트는 아니다.

## 공식 LangGraph 다중 API 예제

공식 예제의 다중 호출 경로는 [create-dag-workflow-generation-graph.ts](../examples/langgraph-workflow/src/graph/create-dag-workflow-generation-graph.ts)에서 확인한다. API 선택과 각 요청값 생성은 LLM 호출이며, `reviewSelection`과 `composeDag`는 호스트가 주입한다. `composeDag`는 계약과 HTTP Request fragment를 받아 SDK로 만든 자체 노드를 더하고 이름 있는 포트로 연결한다. 선택 배열의 순서로 DAG를 만들지 않는다. 단일 호출 CLI는 같은 경로를 한 요청으로 감싼다.

[langgraph-dag-example.test.mjs](../test/langgraph-dag-example.test.mjs)는 공개 fixture의 API 5개와 IF·Merge·Code·Stop And Error 조립을 확인한다. HTTP Request의 실제 출력은 full response이므로 응답 본문은 `$json.body`다. 예제의 검증 코드와 범용 제어 노드 compiler는 구분한다. 사용 방법은 [공식 예제 가이드](../examples/langgraph-workflow/README.md)에 있다.

## 아직 따라갈 구현이 없는 범위

기본 registry 외의 자체 노드 매퍼, 자체 노드 출력의 API 입력 바인딩, 값 변환·아이템별 반복은 남은 구현이다. API 응답의 실행값 검증·직렬화와 복수 SDK 노드 fragment의 내부 연결은 위에서 설명한 바인딩 경로에 구현했다. 기존 scalar 응답 참조 경로는 n8n의 `legacy/workflow/request/`에 남겨 회귀를 확인한다. 바인딩 값을 아직 알 수 없을 때 core 검사 결과의 `requiresRuntimeValidation`은 참이며, 완성된 실제 요청은 실행 시 다시 검사한다.

Webhook/callback의 수신 인증·요청 스키마 검사와 callback 등록·상관관계 처리는 앞서 기록한 미완료 범위다. SDK의 구조 검증 통과만으로 이 기능이나 실서비스 실행까지 검증했다고 볼 수는 없다.

## 결손 미리보기 코드 따라가기

[create-reviewable-workflow-generation-graph.ts](../examples/langgraph-workflow/src/graph/create-reviewable-workflow-generation-graph.ts)는 같은 공통 파이프라인에 [create-workflow-gap-handlers.ts](../examples/langgraph-workflow/src/graph/preview/create-workflow-gap-handlers.ts)의 단계별 변환 함수를 넣는다. 선택·바인딩·그래프 단계가 명시적으로 결손을 반환하면 미리보기를 만들고 `END`로 간다. 기존 strict factory는 계속 오류로 중단한다. 잘못된 모델 출력·OAS·요청값·연결 오류를 잡아서 결손으로 바꾸는 코드는 없다.

n8n 쪽에서는 [workflow-preview.ts](../packages/n8n/src/types/workflow-preview.ts)의 타입과 [workflow-preview-schema.ts](../packages/n8n/src/schemas/workflow-preview-schema.ts)의 입력 검사를 먼저 본다. [create-n8n-workflow-preview.ts](../packages/n8n/src/workflow/preview/create-n8n-workflow-preview.ts)는 카탈로그 무결성 검사와 `resolveApiOperations`로 원본 계약을 확인한 뒤, [create-preview-notes.ts](../packages/n8n/src/workflow/preview/create-preview-notes.ts)의 안내문을 SDK `sticky()`·`workflow()`로 조립한다. 문서 검사와 Markdown escaping은 같은 폴더의 별도 파일이다.

결과는 `executable: false`와 `previewWorkflow`로 구분한다. API 카드와 결손 안내만 있고, 실행 노드나 연결은 없다. 보고된 그래프의 node ID·capability·edge는 텍스트이며 실행 검사를 통과한 topology가 아니다. 잘못되거나 오래된 OAS 참조는 오류로 남는다. 시나리오·목적·보고 문구를 포함하므로 공유 전에는 민감한 내용도 검토해야 한다.

[workflow-preview.test.mjs](../test/workflow-preview.test.mjs)는 단계별 중단·정상 컴파일·오류 전파·계약 출처·출력 분리를 확인한다. [workflow-preview-local-n8n.mjs](../integration/workflow-preview-local-n8n.mjs)는 세 결손 단계의 결과를 네트워크 차단 n8n에 import·export해 비활성 Sticky Note와 빈 연결이 유지되는지 검사한다. 미리보기를 실행하거나 실제 LLM·API 호출의 정확도를 검증하는 테스트는 아니다.

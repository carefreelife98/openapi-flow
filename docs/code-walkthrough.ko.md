# openapi-flow 코드 흐름 따라가기

이 문서는 현재 저장소의 TypeScript 소스를 열어 `@openapi-flow/core`가 **OpenAPI 문서와 자연어 요청을 받아 n8n 워크플로 JSON을 만들기까지**의 경로를 확인하는 안내서다. 배포된 npm 패키지의 동작을 설명하는 문서가 아니다. 저장소의 `main`에는 아직 npm에 배포되지 않은 변경이 있다.

먼저 세 가지를 구분하면 코드를 읽기 쉽다.

- **OAS(OpenAPI Specification)**: 어떤 API 작업이 있고, 요청·응답의 계약이 무엇인지 설명하는 입력 문서.
- **Operation**: OAS의 한 작업. 이 라이브러리에서 나가는 REST 요청은 `paths`의 HTTP 메서드 하나를 뜻한다. `operationRef`는 `#/paths/~1items~1{id}/get` 같은 JSON Pointer이며 `operationId`가 없어도 식별할 수 있다.
- **Workflow JSON**: n8n에 가져갈 수 있는 생성 결과. 생성 함수 자체가 API를 호출하거나 n8n에 등록·실행하지는 않는다.

## 1. 어디서 시작하나

공개 함수 목록은 [`public-api.ts`](../packages/core/src/public-api.ts)에서 확인한다. 자연어로 단일 REST 작업을 고르는 주 경로는 `generateWorkflow`다.

```text
호스트 애플리케이션: spec + scenario + model + baseUrl + profile + effectPolicy + credentialBindings
  → generateWorkflow
  → OAS 검증·로컬 참조 해석 → paths 작업 후보 추출
  → 모델 호출 ①: operationRef 선택
  → 선택된 작업의 요청·응답 계약 읽기
  → 모델 호출 ②: 명시된 입력값·응답 본문 단언 추출
  → Zod 검증·값 변환 → OAS·호스트 정책 검증
  → n8n SDK 조립·검증 → complete / needs_input / blocked
```

`spec`은 이미 파싱된 JSON 객체다. 라이브러리는 파일을 읽거나 HTTP 서버를 띄우지 않는다. `model`도 라이브러리가 만들지 않는다. 호출자가 제공한 LangChain 채팅 모델을 사용한다. `baseUrl`, 실행 효과 승인 정책인 `effectPolicy`, 기존 n8n credential의 참조인 `credentialBindings`도 호출자가 준다. 특히 모델의 응답이 이 신뢰 입력을 바꿀 수는 없다.

| 읽을 순서 | 파일·함수 | 그 자리에서 확인할 것 |
| --- | --- | --- |
| 1 | [`public-api.ts`](../packages/core/src/public-api.ts) | 공개 진입점과 직접 계획 경로의 구분 |
| 2 | [`generate-workflow.ts`](../packages/core/src/planning/generate-workflow.ts) `generateWorkflow` | 전체 호출 순서, 두 모델 호출 사이에 전달되는 값 |
| 3 | [`validate-spec.ts`](../packages/core/src/openapi/common/validate-spec.ts) `validateAndResolveOpenApiDocument` | Scalar의 OAS 검증과 `$ref` 해석. 외부 참조는 입력 전에 묶어야 함 |
| 4 | [`parse-request-operations.ts`](../packages/core/src/openapi/request/parse-request-operations.ts) `operationsFromDocument` / `operationFromDocument` | 가벼운 후보 목록과 선택된 작업의 상세 매핑 차이 |
| 5 | [`select-operation.ts`](../packages/core/src/planning/select-operation.ts) `selectOperationFromCandidates` | 첫 `withStructuredOutput` 호출, `SystemMessage`·`HumanMessage` |
| 6 | [`operation-selection-schema.ts`](../packages/core/src/schemas/operation-selection-schema.ts) / [`operation-plan-schema.ts`](../packages/core/src/schemas/operation-plan-schema.ts) | 후보·요청 필드에서 만들어지는 Zod 스키마 |
| 7 | [`generate-workflow.ts`](../packages/core/src/planning/generate-workflow.ts) `generateWorkflow` 후반 | 두 번째 모델 응답의 `valueJson`을 실제 값으로 바꾸는 부분 |
| 8 | [`compile-workflow.ts`](../packages/core/src/workflow/request/compile-workflow.ts) `compileWorkflowFromOperation` | URL·본문·헤더·인증·정책 검증, 세 가지 결과 상태 |
| 9 | [`build-request-workflow.ts`](../packages/core/src/workflow/request/build-request-workflow.ts) `buildRequestWorkflow` | n8n SDK 노드 연결·검증·`toJSON()` |

## 2. 고정된 예제로 한 번 실행하기

저장소 루트에서 Node.js 24 이상을 사용한다. 의존성이 아직 없다면 `npm ci`를 실행한다. 아래 테스트는 외부 LLM, 실서비스 API, n8n 인스턴스를 호출하지 않는다. 테스트 속 가짜 모델이 두 구조화 응답을 반환한다.

```sh
npm run build
node --test --test-name-pattern='LangChain structured output selects an operation and proposes validated bindings' packages/core/test/workflow.test.mjs
```

예제는 [`workflow.test.mjs`](../packages/core/test/workflow.test.mjs)의 같은 이름 테스트와 파일 상단 `spec`, `effectPolicy`, `generateWorkflow` 래퍼에 있다. 테스트 입력 OAS에는 `GET /items/{id}`와 `POST /items`가 있고, `GET`의 경로 매개변수와 응답 스키마는 로컬 `$ref`를 쓴다. 래퍼가 `effectPolicy`와 빈 `credentialBindings`를 주입한다. 실제 호출은 `scenario: 'Read an item'`, `baseUrl: 'https://example.test'`, `profile: 'read-only'`를 넘긴다.

소스를 다음처럼 따라가면 된다.

1. `validateAndResolveOpenApiDocument(spec)`가 OAS를 검증하고 로컬 `$ref`를 해석한다. 이어 `operationsFromDocument`가 두 후보를 만든다. 후보에는 HTTP 메서드·경로·요약·설명·태그·선택적 `operationId`가 들어가지만, 이 시점에 전체 요청을 n8n 노드로 변환하지는 않는다.
2. `selectOperationFromCandidates`가 후보의 `operationRef`만 허용하는 Zod 스키마를 만든다. 첫 모델 호출의 이름은 `select_operation`이고, 테스트 모델은 `#/paths/~1items~1{id}/get`을 돌려준다. 이 응답은 [`parse-structured-output.ts`](../packages/core/src/planning/parse-structured-output.ts)에서 다시 검사한다.
3. `operationFromDocument`가 선택된 GET 작업만 자세히 읽는다. [`operation-mapping.ts`](../packages/core/src/openapi/request/operation-mapping.ts)에서 매개변수, 요청 본문, 보안, 응답 계약의 매핑을 따라갈 수 있다.
4. `generateWorkflow`는 선택된 작업의 입력 키(`path.id`)와 응답 본문 필드(`id`, `ok`)로 계획 스키마를 만든다. 두 번째 모델 호출 `plan_operation`은 이 작업의 메타데이터와 `scenario`를 받는다. 테스트 모델은 `inputs: [{ key: 'path.id', valueJson: '"x"' }]`와 `expectedBody: [{ key: 'ok', valueJson: 'true' }]`를 반환한다. `valueJson`은 문자열 안에 든 JSON 값이므로 `JSON.parse` 후 각각 `'x'`, `true`가 된다.
5. `compileWorkflowFromOperation`은 모델 계획을 신뢰하지 않고 OAS에 선언된 필드·값 타입, 호출자가 준 `baseUrl`·효과 정책·credential 참조를 확인한다. [`request-url.ts`](../packages/core/src/workflow/request/request-url.ts), [`request-body.ts`](../packages/core/src/workflow/request/request-body.ts), [`request-headers.ts`](../packages/core/src/workflow/request/request-headers.ts)를 열어 실제 요청 값의 조립 지점을 확인한다.
6. 입력이 충족되고 `read-only` 정책에서 GET이 `read`로 승인되어 있으므로 `buildRequestWorkflow`가 `Manual Trigger → HTTP Request → Code(응답 본문 검사)`를 조립한다. 응답 단언이 없다면 마지막 Code 노드는 없다. SDK의 `validateWorkflow`가 통과하면 `toJSON()` 결과를 돌려준다. 테스트는 `status === 'complete'`, `plan.inputs['path.id'] === 'x'`, `plan.expectedBody.ok === true`를 확인한다.

`expectedBody`는 OAS에 있는 모든 응답 필드를 자동 검사한다는 뜻이 아니다. 사용자가 시나리오에 **명시한 응답 본문 기대값**만 모델이 제안하고, 그 필드·값이 OAS 응답 계약에 맞는지 다시 확인한다. 응답 HTTP 상태 코드를 모델이 계획하거나 자동 단언하는 경로는 없다.

IDE에서 중단점을 쓴다면 위 표의 함수 순서대로 확인하면 된다. 다만 이 테스트는 TypeScript 원본이 아니라 빌드된 `packages/core/dist/`의 JavaScript를 가져오며, 현재 [`tsconfig.json`](../packages/core/tsconfig.json)은 소스맵을 생성하지 않는다. 따라서 기본 설정으로는 원본 `.ts` 중단점이 자동으로 연결된다고 기대하면 안 된다. 실행 중단점은 대응하는 `dist/*.js`에 걸고, 원본 `.ts`에서 같은 함수의 코드를 함께 읽는 방식이 확실하다. `dist/`는 빌드 산출물이므로 수정하지 않는다.

원본 `.ts` 파일의 import 경로가 `.js`로 끝나는 것은 `NodeNext` 모듈 설정에서 빌드 결과의 실제 JavaScript 파일 경로를 가리키기 위해서다. 다른 구현 파일을 찾을 때는 그 경로의 `.ts` 파일을 열면 된다.

## 3. 결과가 `complete`가 아닐 때

[`compile-workflow.ts`](../packages/core/src/workflow/request/compile-workflow.ts)의 반환 분기를 보면 차이가 분명하다.

| 결과 | 의미 | 확인할 곳 |
| --- | --- | --- |
| `complete` | 정책과 필수 입력이 충족되어 `workflow` JSON이 생성됨 | `buildRequestWorkflow`와 반환값의 `workflow.nodes` |
| `needs_input` | OAS가 요구하는 매개변수·본문 값 등이 부족함 | `missingInputs`, `makeUrl` / `makeBody` / `makeHeaders` |
| `blocked` | 선택된 작업의 효과 승인이 없거나 현재 프로필에서 허용하지 않음 | [`effect-policy.ts`](../packages/core/src/workflow/request/effect-policy.ts), `effectPolicy`, `profile` |

뒤의 두 결과에는 `workflow`가 없다. 이것과 **예외 발생**은 다르다. 예를 들어 잘못된 OAS·참조, OAS에 없는 입력 키, 틀린 값 타입, 지원하지 않는 선택 작업의 인증 방식은 오류를 던진다. `blocked`나 `needs_input`이라도 그 전에 입력·계약 검사에서 오류가 날 수 있으므로, 모든 실패가 상태 값으로 돌아온다고 가정하면 안 된다. OAS 문서 전체를 표준에 맞는지 판별하는 단계와, 선택된 작업을 현재 n8n 노드에 컴파일할 수 있는지 판별하는 단계도 구분해야 한다.

## 4. 모델을 거치지 않는 나머지 경로

| 공개 함수 | 입력·역할 | 소스에서 따라갈 경로 |
| --- | --- | --- |
| `compileWorkflow` | 호출자가 단일 REST 작업의 `plan`을 직접 제공 | [`compile-workflow.ts`](../packages/core/src/workflow/request/compile-workflow.ts) → `operationFromSpec` → `compileWorkflowFromOperation` → `buildRequestWorkflow` |
| `compileSequence` | 호출자가 여러 REST 작업과 앞선 응답값 참조를 직접 계획 | [`compile-sequence.ts`](../packages/core/src/workflow/request/compile-sequence.ts) → [`prepare-sequence.ts`](../packages/core/src/workflow/request/prepare-sequence.ts) → [`build-sequence-workflow.ts`](../packages/core/src/workflow/request/build-sequence-workflow.ts) |
| `inboundOperationsFromSpec` | OAS의 최상위 `webhooks`와 작업 내부 `callbacks` 후보 확인 | [`list-inbound-operations.ts`](../packages/core/src/openapi/inbound/list-inbound-operations.ts) → [`webhook/parse-webhook-operations.ts`](../packages/core/src/openapi/inbound/webhook/parse-webhook-operations.ts) / [`callback/parse-callback-operations.ts`](../packages/core/src/openapi/inbound/callback/parse-callback-operations.ts) |
| `compileInboundWorkflow` | 호출자가 수신 작업의 `operationRef`, n8n `webhookPath`, `responseStatus` 등을 직접 제공 | [`compile-inbound-workflow.ts`](../packages/core/src/workflow/inbound/compile-inbound-workflow.ts) → [`build-inbound-workflow.ts`](../packages/core/src/workflow/inbound/build-inbound-workflow.ts) |

즉, **자연어 계획은 현재 단일 `paths` 작업에만 적용**된다. 다단계 Sequence나 Webhook·Callback 계획까지 LLM이 자동으로 생성하는 구조로 읽으면 안 된다. 수신형 컴파일 결과는 Webhook trigger와 Respond to Webhook 노드를 사용한다. OAS callback의 URL 표현식을 n8n `webhookPath`로 자동 변환하거나, callback을 원 요청에 등록·연결하는 기능은 없다. 수신 요청에 대한 인증·스키마 검사도 아직 생성하지 않는다.

## 5. 전체 검증과 확인 범위

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
```

`npm test`는 빌드 후 공개 저장소의 자동 테스트를 실행한다. 실서비스 OAS 통합 검사는 별도 `npm run test:real-oas`이며 비공개 OAS 파일이 필요하다. 해당 파일을 저장소나 이 문서에 복사하지 않는다. 고정 모델을 쓰는 위 테스트의 성공은 **계획 처리와 조립 경로**의 검증이지, 실제 LLM의 작업 선택·입력 추출 정확도 또는 생성된 워크플로의 실서비스 실행 성공을 증명하지 않는다. 결과 JSON을 실제 n8n에 가져오고 실행하는 단계는 호스트 애플리케이션 또는 별도 검증의 책임이다.

# 조합 가능한 공개 API 재설계

검토일: 2026-10-05. 조사 기준: `main`의 `e5bb44b`.

이 문서는 재설계의 목표와 검토 당시 근거를 보존한다. 이후 구현한 범위는 바로 아래 진행표에서 구분한다. 새 패키지는 아직 npm에 배포하지 않았다. 현재 동작은 [코드 따라가기](code-walkthrough.ko.md)에서 확인한다.

## 구현 진행 — 2026-10-05

첫 구현은 패키지 경계와 독립 함수 호출에 집중했다. `core`에는 OAS 카탈로그·전체 계약 조회·요청값 스키마·검증, `langchain`에는 작업 선택·호출별 입력 생성, `n8n`에는 리터럴 요청 노드·명시적 DAG 조립을 두었다. 새 경로는 카탈로그나 JSON 생성에 `effectPolicy`를 요구하지 않는다. 기존 승인표는 별도 `legacy` 컴파일러에만 남아 있다. 실제 import·실행 승인은 호스트가 맡는다.

| 상태        | 함수·범위                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 구현        | `createApiCatalog`, `listApiOperations`, `resolveApiOperations`, `createApiArgumentsSchema`, `validateApiArguments` |
| 구현        | `selectApiOperations`, `generateApiArguments` — 서로 독립된 모델 호출                                               |
| 구현        | `createHttpRequestNode` — 리터럴 요청값, 기존 직렬화·credential 연결 재사용                                         |
| 구현        | `assembleN8nWorkflow` — 명시적 node·port·edge·start, DAG·fan-out, SDK JSON 출력                                     |
| 예제 구현   | `createDagWorkflowGenerationGraph` — 다중 API 선택·입력 생성, 호스트가 명시한 DAG와 SDK 자체 노드 조합              |
| 다음 구현   | `planWorkflowGraph`, n8n 제어 노드 registry와 타입 있는 설정 컴파일                                                 |
| 다음 구현   | 새 출력 바인딩의 런타임 값·데이터 의존성 검증, 복수 노드 fragment 내부 연결, 결손 미리보기                          |
| 별도 미완료 | 수신 인증·요청 스키마 검사, callback 등록·상관관계, 실제 모델의 다중 OAS 정확도                                     |

계약 조회는 전체 OAS Operation·path item과 상속된 parameter/security/server를 보존한다. 아래의 검토 당시 기존 파일 경로는 패키지 이전 전 기준이다. 카탈로그는 JSON 직렬화 가능하며 선택 key에 문서 ID·snapshot hash·operationRef를 남긴다. 저장된 문서가 바뀌면 조회가 실패한다. 새 입력 생성은 예상 응답을 받지 않는다.

이 단계에서 core의 바인딩 표현은 실행 가능 판정이 아니다. 실제 값이 필요한 검사는 `requiresRuntimeValidation`으로 구분하고, 새 독립 요청 노드 컴파일러는 바인딩을 실행값으로 만들기 전까지 명시적으로 거절한다. 기존 문서 간 scalar 참조는 `legacy` 경로에서 계속 검증한다. 전체 설계가 완료됐다고 해석하면 안 된다.

## 현재 구현에서 확인한 문제

`effectPolicy`는 OAS 표준 필드가 아니다. 현재 라이브러리가 추가한 `operationRef → read | write` 승인표다. 문서의 모든 Path를 미리 분류할 필요는 없지만, 컴파일하려는 각 METHOD·Path 작업에는 항목이 있어야 한다. 같은 Path의 GET과 POST도 별개다. 항목이 없으면 `unknown`으로 처리해 JSON 생성을 막는다.

문제는 이 실행 승인이 작업 검색용 카탈로그까지 들어갔다는 점이다. `CatalogSource`가 OAS뿐 아니라 `baseUrl`, `effectPolicy`, `credentialBindings`를 요구하고, `createOperationCatalog`가 이 설정을 검사한다. API 후보를 고르기만 하려는 호출자도 배포·승인 정보를 준비해야 한다.

현재 다중 OAS 기능은 OAS 안에 고정된 워크플로를 저장하지 않는다. `proposeCatalogScenario`가 매번 시나리오를 받아 API 순서를 고른 뒤, 같은 함수 안에서 각 API의 입력을 순차 생성한다. `compileCatalogSequence`는 그 계획을 `Manual Trigger → HTTP Request → …` 형태로 연결한다. 따라서 시나리오별 계획은 달라지지만, 결과의 제어 흐름은 직선형이다. 계획과 컴파일은 나뉘어 있어도 선택·계약 조회·입력 생성 각각을 공개 함수로 조합하는 구조는 아니다.

| 근거 파일·지점                                                                                             | 확인한 동작                                                                |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/core/src/types/catalog.ts:8`의 `CatalogSource`                                                   | 문서와 배포·승인 설정이 한 타입에 섞여 있다.                               |
| `packages/core/src/openapi/request/create-operation-catalog.ts:7`의 `createOperationCatalog`               | 카탈로그 생성 때 효과 정책과 credential 설정까지 요구한다.                 |
| `packages/core/src/workflow/request/effect-policy.ts:12`의 `approvedEffect`, `prepare-sequence.ts:66` 이후 | 선택한 작업의 승인 항목을 검사하고 미승인 시 컴파일을 막는다.              |
| `packages/core/src/planning/propose-catalog-scenario.ts:17`의 `proposeCatalogScenario`                     | 선택 호출 한 번과 단계별 입력 생성 호출들을 한 함수에서 수행한다.          |
| `packages/core/src/openapi/request/parse-request-operations.ts:86`의 `operationFromDocument`               | 계약 조회가 이미 `mapOperationForWorkflow`와 인증 변환 제한에 연결돼 있다. |
| `packages/core/src/workflow/request/build-sequence-workflow.ts:10`의 `buildSequenceWorkflow`               | `.to(request)`로 단계들을 직선 연결한다.                                   |
| `packages/core/src/workflow/request/sequence-url.ts:39` 이후                                               | 객체 입력을 응답 참조로 해석하며 path/query의 일부 스칼라 참조만 처리한다. |

## 책임 경계

OAS는 API 계약의 기준이다. 요청 필드, 타입, 직렬화, 인증 요구, 가능한 응답을 보존한다. 실행 환경의 승인표나 사용자의 테스트 목표는 OAS 계약과 별개다. OAS의 `security`는 인증 방식과 요구사항을 설명하지만, 특정 환경에서 업무 변경을 승인한다는 공통 read/write 플래그는 없다. [OAS 3.2.1 Operation Object](https://spec.openapis.org/oas/v3.2.1.html#operation-object)

새 생성 API에서는 `effectPolicy`와 `read-only`/`test` 프로필을 필수 입력에서 제외한다. 모델이 작업 효과를 추측하거나 HTTP method만으로 업무 안전성을 판정하는 대체 로직도 넣지 않는다. 라이브러리는 JSON을 생성하며 직접 import·게시·실행하지 않는다. 그 행위를 승인하는 정책은 호스트가 관리한다. 호스트는 서비스 단위 정책이나 검토·HITL 등 필요한 방식을 선택하며, OSS가 Path별 승인표를 강제하지 않는다.

이 변경은 생성 결과가 안전하게 실행된다는 보장이 아니다. 호스트가 검토하지 않은 워크플로를 실행하면 변경 API도 호출될 수 있다. OAS 요청 검증, URL 구성 검사, 인증 선택과 credential 참조 검사, 데이터 바인딩 검사, n8n 변환 검사는 남긴다. 실행 승인과 계약 검사는 서로 대체하지 않는다.

서버, 사내 endpoint, 자동 재시도 루프, 모델 provider, 실행 승인 UI는 제공 범위에 넣지 않는다. LangChain 모델은 호출자가 주입한다. Chomsky도 모델 endpoint 연결 설정이며 OSS의 별도 도메인이 아니다. n8n만 구현 대상으로 삼고, 다른 엔진을 위한 플러그인 프레임워크는 만들지 않는다.

## 패키지와 의존성

| 패키지                    | 담당 범위                                                                         | 맡지 않는 범위                                 |
| ------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `@openapi-flow/core`      | OAS 검증·카탈로그·작업 계약 조회, 요청·출력 바인딩 및 그래프의 데이터 계약과 검증 | LLM 호출, n8n SDK 객체, 인스턴스 접근          |
| `@openapi-flow/langchain` | API 선택, 호출별 입력 생성, 그래프 계획용 structured output                       | n8n JSON 직접 작성, 실행·승인·재시도 루프      |
| `@openapi-flow/n8n`       | n8n 기능 명세, 요청·제어 노드 생성, 그래프 연결, SDK 검사, import JSON            | 모델 호출, OAS에 없는 API 생성, 자동 배포·실행 |

의존 방향은 `langchain → core`, `n8n → core`다. 두 상위 패키지는 서로 의존하지 않는다. 호출자가 n8n 패키지의 JSON 직렬화 가능한 기능 명세를 LangChain 계획 함수에 전달한다. 실제 SDK builder와 노드 구현은 n8n 패키지에만 둔다.

Core의 그래프 타입은 이 세 단계가 교환하는 계획 데이터다. 범용 워크플로 엔진이나 실행기를 구현하려는 추상화가 아니다. Zod 4는 요청과 structured-output 스키마에 유지하고, OAS 파싱은 기존 검증 라이브러리를 이용한다. 모델 provider가 표현하지 못하는 스키마와 유효하지 않은 OAS는 다른 오류로 보고한다. provider에 맞춰 원본 OAS를 축소하거나 값을 보충하지 않는다.

## 독립적으로 공개할 함수

아래 이름은 공개 계약의 제안이다. 단일·다중 OAS에 같은 함수와 컬렉션 입력을 사용한다. 하나를 넣으면 단일 문서·단일 작업 경로가 되므로 같은 기능에 `multi` 접두사를 붙인 별도 구현은 만들지 않는다.

| 함수                       | 패키지    | LLM  | 입력 → 출력                                                                  |
| -------------------------- | --------- | ---- | ---------------------------------------------------------------------------- |
| `createApiCatalog`         | core      | 없음 | 문서 ID와 OAS 목록 → 검증한 문서 집합과 작업 후보                            |
| `listApiOperations`        | core      | 없음 | 카탈로그 → 모델 선택·검색에 사용할 후보 메타데이터                           |
| `selectApiOperations`      | langchain | 사용 | 후보, 시나리오, 모델 → 선택한 작업·용도와 부족한 기능 제안                   |
| `resolveApiOperations`     | core      | 없음 | 카탈로그, 선택한 작업 키 → 전체 OAS 작업 계약과 출처                         |
| `listN8nCapabilities`      | n8n       | 없음 | 대상 노드·버전 명세 → 구현된 기능의 설정 스키마·포트·출력 계약               |
| `planWorkflowGraph`        | langchain | 사용 | 선택한 계약, 기능 명세, 시나리오 → 호출 노드·제어 노드·edge·출력 바인딩 계획 |
| `validateWorkflowGraph`    | core      | 없음 | 그래프, 작업 계약, 기능 명세 → 참조·포트·구조·데이터 의존성 진단             |
| `createApiArgumentsSchema` | core      | 없음 | 작업 계약과 이미 정한 바인딩 → 이번 호출의 중첩 Zod 스키마                   |
| `generateApiArguments`     | langchain | 사용 | 호출 하나의 계약, 바인딩, 시나리오, 모델 → 요청값과 미해결 입력              |
| `validateApiArguments`     | core      | 없음 | 계약, 요청값, 바인딩 → OAS 계약 적합성·필수 입력 진단                        |
| `createHttpRequestNode`    | n8n       | 없음 | 작업 계약, 요청값, 연결 컨텍스트, 실행 대상, credential 참조 → SDK 노드 조각 |
| `createN8nControlNode`     | n8n       | 없음 | 기능 명세와 타입 있는 제어 의도 → SDK 노드 조각                              |
| `assembleN8nWorkflow`      | n8n       | 없음 | 그래프, 노드 조각, 설정 → 연결·SDK 검사한 import JSON 또는 진단              |
| `compileN8nWorkflow`       | n8n       | 없음 | 검토한 그래프·요청값·대상 설정 → 노드 생성과 조립을 함께 수행한 결과         |

`resolveApiOperations`는 n8n에 매핑하기 쉬운 필드만 골라 반환하지 않는다. 원본 Operation, 상속·override를 적용한 parameters/security/servers, requestBody/responses/callbacks와 원문 위치를 보존한다. OAS의 기본값·상속은 표준 의미대로 해석하되, 호스트의 필수 설정을 다른 필드에서 임의 대체하지 않는다. 인증 대안이 있다는 이유로 이 조회 단계에서 작업을 거부하지 않는다. 특정 인증 조합의 n8n 지원 여부는 노드 생성 단계가 판단한다.

선택 결과는 `ApiSelection`, 계약 조회는 `ApiOperationContract[]`, 입력 생성은 `ApiArgumentProposal`, 그래프 계획은 `WorkflowGraphPlan`, 노드 생성은 `N8nNodeFragment`, 최종 조립은 `N8nCompileResult`로 반환한다. 반환 타입을 `unknown`으로 두거나 임의 generic으로 모델 응답이 검증됐다고 주장하지 않는다. 실행 시 만든 Zod 스키마로 출력 경계를 검사한 뒤 해당 계약 타입을 반환한다. 동적 API의 개별 필드 타입을 컴파일 시 모두 안다고 가장하지 않으며, 해당 계약·스키마를 함께 추적한다.

카탈로그에는 배포 설정이 없다. 컴파일 단계에서 실행 대상은 명시적인 `baseUrl` 또는 OAS `servers`의 특정 항목·변수 선택으로 지정한다. 한쪽 설정이 없을 때 다른 쪽을 몰래 대신 쓰지 않는다. 여러 서버나 인증 대안이 있을 때도 모델이 임의 선택하지 않는다. 선택한 보안 요구를 만족하는 기존 n8n credential 참조만 전달하며, 실제 존재·접근 권한은 대상 인스턴스에서 확인해야 한다. 이 설정은 보통 서비스·보안 스키마 단위이며 Path별 효과 승인표와 다르다.

`createHttpRequestNode`의 반환값은 연결 전 SDK 노드 조각이다. OAS 출력 바인딩의 런타임 검사 등 부속 노드가 필요한 경우에도 요청 노드 하나와 동일하다고 숨기지 않는다. 조각은 명시적인 진입·종료 포트와 내부 노드 목록을 갖는다. `assembleN8nWorkflow`가 그래프의 논리 노드 ID를 실제 SDK 노드·포트로 연결한다. SDK 객체는 생성 과정의 런타임 값으로만 사용한다.

## 기본 호출 순서와 LangGraph 사용

```text
여러 OAS → 카탈로그 → API 선택 [LLM] → 전체 작업 계약 조회
                                      ↓
                         그래프·출력 바인딩 계획 [LLM]
                                      ↓
                         그래프 검사·호스트 검토
                                      ↓
                         각 호출의 요청값 생성 [LLM]
                                      ↓
                         OAS 입력·바인딩 검사
                                      ↓
                         n8n 노드 생성·연결 [SDK]
                                      ↓
                         import JSON + 진단
```

그래프 계획을 입력 생성보다 앞에 둔 이유는 데이터 의존성이다. 생성 API의 응답 `id`를 조회 API에 넣기로 했다면, 조회 API의 필수 `path.id`는 모델이 상수로 만들어야 할 값이 아니다. 바인딩이 이 입력을 공급한다는 사실을 먼저 정하면 모델은 시나리오의 나머지 값만 생성한다.

이 순서는 기본 예제일 뿐, 라이브러리에 고정한 LangGraph가 아니다. 호출자는 작업 선택을 직접 수행하거나 다른 모델로 교체하고, 그래프를 수작업으로 제공하며, 특정 호출의 입력 생성만 재시도할 수 있다. 요청값이 먼저 필요한 시나리오에서는 해당 호출을 먼저 생성하고 그래프를 계획해도 된다. 연결이 바뀐 호출은 입력과 바인딩을 다시 검사한다.

두 그래프는 구분한다. 호스트의 LangGraph는 워크플로를 **만드는 과정**의 재시도·검토·중단·재개를 관리한다. 생성된 n8n 그래프는 API 호출·분기·대기 등 **시나리오 실행**을 관리한다. OSS 함수는 LangGraph 노드에 넣거나 일반 함수로 호출하는 양쪽 방식을 지원한다. LangGraph는 함수형 노드를 지원하며 checkpoint 재개 시 영향받은 노드를 다시 실행하므로, 여러 모델 호출을 하나의 함수에 묶지 않는 것이 호출별 검토·재시도에 유리하다. [LangGraph Nodes와 재실행](https://docs.langchain.com/oss/javascript/langgraph/graph-api#nodes)

Checkpoint에 저장할 선택·계약 출처·그래프·요청값·진단은 JSON 직렬화 가능한 데이터로 제한한다. 모델 인스턴스, SDK builder, Zod 스키마 객체는 호스트의 런타임 컨텍스트에 둔다. 스키마가 다시 필요하면 같은 문서 스냅샷과 바인딩에서 재생성한다.

## 계획 데이터와 structured output

작업 식별자는 `(documentId, operationRef)`다. `operationId`는 선택 메타데이터이며 필수 식별자가 아니다. 별도 문서 스냅샷 ID를 계획에 남겨 checkpoint의 계약과 현재 OAS가 달라지면 명시적으로 재검증한다. 같은 작업을 두 번 호출하는 경우에는 서로 다른 `callId`를 쓴다. 작업 선택이 반환한 나열 순서는 실행 순서로 확정하지 않으며 edge가 실행 관계를 정한다.

공개 요청값은 `{path, query, header, cookie, body}`처럼 위치별 중첩 데이터를 사용한다. OAS dialect가 선언하는 다른 위치도 계약에서 누락하지 않는다. 공개 입력을 `'path.id'` 같은 문자열 key나 JSON 문자열로 평탄화하지 않는다. 아래는 조회 호출에 상수 query와 선행 응답을 함께 공급하는 계획 데이터 예시다. 인증값은 포함하지 않는다.

```json
{
  "callId": "read-created-item",
  "values": {
    "query": { "includeDetails": true }
  },
  "bindings": [
    {
      "kind": "node-output",
      "targetPointer": "/path/id",
      "sourceNodeId": "create-item",
      "sourcePointer": "/body/id"
    }
  ]
}
```

`values`의 객체는 리터럴 요청값이고 `bindings`만 출력 참조다. 객체라는 이유만으로 참조로 해석하지 않는다. 대상은 path/query뿐 아니라 OAS가 선언한 body/header 등에도 둘 수 있다. JSON Pointer는 중첩 필드와 배열 인덱스를 나타낸다. 배열 전체를 전달하는 것과 n8n 아이템별 반복은 다른 동작이며, wildcard를 표준 Pointer인 것처럼 추가하지 않는다. 출력 envelope의 `body`는 HTTP 응답 body다. 배열을 n8n 아이템으로 펼치는 기능은 별도 제어·변환 노드의 계약으로 표현한다.

LLM 호출별 스키마에는 실제로 결정해야 할 항목만 넣는다. API 선택은 후보 작업 키·용도·결손 제안을, 그래프 계획은 노드·edge·명시된 기능 설정·바인딩을, 입력 생성은 해당 호출의 OAS 타입을 가진 요청값과 미해결 입력을 받는다. 메서드·Path·인증 정의·노드 버전·이미 결정된 바인딩은 모델이 다시 생성하지 않는다. Zod 스키마와 필드 설명은 `schemas/`, prompt는 `prompts/`, 입출력 타입은 `types/`에 둔다. 메시지 클래스는 기존 `SystemMessage`와 `HumanMessage`를 유지한다.

입력 생성용 스키마는 바인딩이 공급하는 필드를 상수 생성 대상에서 제외한다. 시나리오에 없는 필수값은 임의로 채우지 않고 미해결 입력으로 반환한다. 값 생성 후에는 리터럴과 바인딩을 합친 요청 계약을 검사한다. 사용자 명시 기대값을 검사하는 테스트 노드는 별도 계획 항목이다. `generateApiArguments`에 `expectedBody`나 예상 상태코드를 다시 넣지 않는다.

선택한 Operation의 모든 가능한 응답은 출력 계약에 보존한다. 모델이 성공 코드 하나를 임의 선택해 응답 타입을 고정하지 않는다. `oneOf` 등 때문에 출력 타입의 연결 적합성을 정적으로 확정할 수 없으면 그 불확실성을 진단하고, 실제 응답 값과 분기 조건에 대한 검사를 명시한다. OAS만으로 증명하지 못한 연결을 검사 완료로 보고하지 않는다.

## n8n 그래프의 구현 경계

LLM은 최종 n8n JSON이나 임의 JavaScript를 작성하지 않는다. `planWorkflowGraph`는 n8n 패키지가 제공한 기능 ID, 설정 스키마, 포트 안에서 계획한다. If/Switch 조건도 타입 있는 연산자·값 참조로 표현하고 expression 작성은 코드가 맡는다. API가 부족하면 결손을 반환하며, 기존 n8n 노드의 모든 기능을 자동 사용할 수 있다고 가정하지 않는다.

기능 명세의 노드 버전과 설정은 공식 SDK·대상 노드 명세를 확인해 n8n 패키지가 관리한다. MCP 연결을 필수로 요구하지 않는다. 기본 구현은 SDK를 사용하고, 추가 기능을 등록할 때도 설정 스키마와 입출력 포트를 명시한다. SDK에는 If/Switch/Merge/Loop 지원이 문서화돼 있고, 설치된 `0.33.1` 타입에도 `.connect`, `.onTrue`, `.onFalse`, `.toJSON`이 있다. 이것은 우리 그래프 변환기가 이미 구현되거나 대상 인스턴스에서 검증됐다는 뜻은 아니다. [n8n 공식 SDK](https://github.com/n8n-io/n8n/blob/master/packages/@n8n/workflow-sdk/README.md)

그래프 검사는 노드 ID·포트·edge뿐 아니라 데이터 의존성도 확인한다. 참조한 출력이 해당 분기에 실제로 존재하는지, 합류 방식이 대안 분기인지 병렬 결과 결합인지, 데이터가 응답 배열인지 n8n 아이템 목록인지 구분한다. DAG의 순환 참조는 진단한다. 반복을 지원할 때는 Loop의 반복 범위·종료·출력 계약을 별도로 구현하며, 정상적인 반복을 임의 edge 순환으로 표현하지 않는다.

결손이 남은 실행 그래프는 정상 HTTP Request 노드로 위장하지 않는다. 결과는 `workflow` 없이 진단을 반환하고, 호스트가 각 진단을 수정·HITL·재계획에 사용한다. 원본 입력 오류는 문서 ID와 필드를 지정해 즉시 실패한다. 모델의 부족한 API·계약 제안과 코드가 판별한 입력·바인딩·변환 오류는 출처를 구분한다. 시각적 미리보기는 별도 함수·출력 모드에서 Sticky Note 등으로 표시하며 실행 가능한 결과와 분리한다.

## 폴더와 파일 배치

```text
packages/
  core/src/
    public-api.ts
    types/                 api-catalog.ts, api-operation.ts, api-arguments.ts,
                           output-binding.ts, workflow-graph.ts, diagnostic.ts
    schemas/               create-api-arguments-schema.ts, workflow-graph-schema.ts
    openapi/
      common/              validation, references, provenance, OAS schema handling
      catalog/             create-api-catalog.ts, list-api-operations.ts
      operations/
        request/           resolve-request-operation.ts, serialization/
        inbound/
          webhook/         resolve-webhook-operation.ts
          callback/        resolve-callback-operation.ts
      resolve-api-operations.ts
    arguments/             validate-api-arguments.ts
    bindings/              validate-output-binding.ts
    graph/                 validate-workflow-graph.ts
    utils/                 domain-neutral helpers only
  langchain/src/
    public-api.ts
    types/                 operation-selection.ts, argument-generation.ts, graph-planning.ts
    schemas/               operation-selection-schema.ts, argument-proposal-schema.ts,
                           graph-plan-schema.ts
    prompts/               operation-selection-prompt.ts, api-arguments-prompt.ts,
                           workflow-graph-prompt.ts
    selection/             select-api-operations.ts
    arguments/             generate-api-arguments.ts
    graph/                 plan-workflow-graph.ts
    structured-output/     invoke-structured-output.ts
  n8n/src/
    public-api.ts
    types/                 node-fragment.ts, workflow-compilation.ts, execution-target.ts
    schemas/               control-node-config-schema.ts
    capabilities/          list-n8n-capabilities.ts, verified-node-definitions/
    nodes/
      common/              output-envelope.ts, expression-generation/
      request/             create-http-request-node.ts, authentication/
      inbound/
        common/            shared receiving-workflow logic
        webhook/           webhook-specific mapping
        callback/          parent operation and callback URL mapping
      control/             create-n8n-control-node.ts, if/, switch/, wait/, merge/
      assertion/           explicit scenario assertions
    workflow/              assemble-n8n-workflow.ts, compile-n8n-workflow.ts,
                           validate-n8n-workflow.ts
examples/
  compose-workflow/         ordinary function composition
  langgraph-workflow/       host-owned retry and HITL example
```

책임이 다른 파일을 `common/`이나 `utils/`에 모으지 않는다. 각 패키지의 `types/`에는 그 패키지가 소유한 타입만 두고, 공유 계약은 core에서 import한다.

## 이전 순서와 완료 조건

1. 카탈로그에서 배포·승인 설정을 분리하고 선택·계약 조회·호출별 입력 생성 함수를 독립 공개한다. `effectPolicy`를 새 API의 필수 계약에서 제외하며, 기존 API를 몰래 새 계약으로 해석하지 않는다.
2. 타입·스키마·prompt와 로직을 위 세 패키지의 소유 경계에 맞춰 옮긴다. 사용자의 기존 주석을 유지하고 의존 방향과 순환 여부를 확인한다. 배포된 `0.1.0`에서 새 API를 쓸 수 있다고 설명하지 않으며, 호환성 변경은 release note에 명시한다. 호환 alias나 자동 fallback은 추가하지 않는다.
3. 리터럴 값과 출력 바인딩을 분리하고 그래프·입력 경계 검사를 구현한다. provider용 스키마와 OAS 계약 검증을 구분하며 JSON Pointer와 배열 값을 실제 데이터로 확인한다.
4. REST 노드 생성을 독립 공개하고 직선 이외의 edge를 SDK로 조립한다. If/Switch/Wait/Merge는 설정·포트·실행 결과를 각각 검증한 뒤 기능 목록에 등록한다. Webhook/Callback은 현재 구현을 inbound 소유 경계에 맞춰 옮기며, 수신 인증·스키마 검사는 기록된 미완료 작업으로 유지한다.
5. 호출별 재시도와 HITL을 보여주는 LangGraph 예제를 추가한다. API가 없는 요구, 같은 API의 여러 호출, 같은 Path가 있는 여러 OAS, 분기 후 참조, body 내부 참조, 배열을 평가한다.

이번에 완료한 것은 현행 구현 조사와 공개 계약 재설계다. 위의 코드 이전·DAG 변환·모델 평가는 아직 수행하지 않았다. 구현할 때는 기존 Honeypot/ICL 등 비공개 실서비스 OAS 회귀를 이어가며 공개 fixture에 비공개 계약이나 인증값을 복사하지 않는다. 타입·lint·format·단위 테스트와 함께 실제 Chomsky 호출과 로컬 n8n의 import·HTTP 호출·분기 출력까지 확인한다. SDK 검사는 실행 검증을 대신하지 않는다.

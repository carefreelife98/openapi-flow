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
| 값 스키마   | [create-api-arguments-schema.ts](../packages/core/src/schemas/create-api-arguments-schema.ts) | 선택한 OAS의 parameter/body 타입과 설명을 Zod로 변환                                                   |
| 값 생성     | [generate-api-arguments.ts](../packages/langchain/src/arguments/generate-api-arguments.ts)    | 한 호출의 시나리오 값 생성, Zod 파싱, 미해결 입력 반환                                                 |
| OAS 검사    | [validate-api-arguments.ts](../packages/core/src/arguments/validate-api-arguments.ts)         | 선언되지 않은 값·타입·원본 제약 검사, 빠진 필수값 Pointer                                              |
| 노드 생성   | [create-http-request-node.ts](../packages/n8n/src/nodes/request/create-http-request-node.ts)  | 어댑터 경계의 직렬화·credential 연결, SDK HTTP Request 노드                                            |
| 그래프 조립 | [assemble-n8n-workflow.ts](../packages/n8n/src/workflow/assemble-n8n-workflow.ts)             | 노드·port·edge·root·순환 검사, SDK 연결과 JSON 출력                                                    |

각 패키지의 `public-api.ts`가 실제 공개 함수 목록이다. core에는 모델이나 n8n SDK import가 없고, langchain과 n8n은 서로 의존하지 않는다. 외부 입력과 반환 타입은 각 패키지의 `types/`, structured-output 정의는 `schemas/`, 모델 지침은 `prompts/`에서 찾는다.

## 두 번째 모델 호출을 확인하는 법

`generateApiArguments`는 선택된 전체 계약을 받아 `createApiArgumentsSchema`를 호출한다. 예를 들어 `POST /items`의 body가 `{name: string, quantity: integer}`이면 모델 출력도 `values.body.name`, `values.body.quantity`를 그 타입으로 받는다. 모델이 OAS나 JSON Schema 문자열을 생성하는 것이 아니다.

시나리오가 이름만 주면 모델은 `{values: {body: {name: "demo"}}}`처럼 일부 값만 제안할 수 있다. 코드가 원본 OAS에서 필수인 `quantity`를 확인해 반환값의 `unresolvedInputs`에 `/body/quantity`를 기록한다. 이 누락 목록은 LLM 출력에 넣지 않으며, 생략한 선택 필드와 별도로 관리하는 credential을 요청값 누락으로 판단하지 않는다. 값이 없는 상태로 노드 컴파일을 요청하면 즉시 오류가 난다. 임의 수량이나 다른 필드에서 가져온 값으로 채우지 않는다.

모델용 스키마는 미해결 값을 허용하는 제안 형식이다. 원본 OAS의 `required`를 수정해 저장하거나, 실행 시 필수값 검사를 없애는 것이 아니다. 요청값 생성에는 예상 응답 코드나 `expectedBody`가 없다. 응답 계약 전체는 조회 결과에 보존한다.

## 재현할 테스트

저장소 루트에서 다음을 실행한다. 첫 테스트는 가짜 모델을 사용하므로 외부 모델이나 실서비스 API를 호출하지 않는다.

```sh
npm run build
node --test test/composable-api.test.mjs
OPENAPI_FLOW_REAL_OAS_DIR=/path/to/private/oas npm run test:real-oas
npm run test:local-n8n
```

[composable-api.test.mjs](../test/composable-api.test.mjs)는 독립 선택·값 생성·노드 조립, 같은 Operation의 문서별 식별, 원본 응답·인증 대안 보존, 누락 입력과 값 오류, 배열 순서와 무관한 fan-out DAG를 확인한다. [real-oas.mjs](../integration/real-oas.mjs)는 비공개 OAS 문서의 모든 REST 계약과 선언된 각 body media type의 요청값 스키마를 확인한다. 원본 fixture는 공개 레포로 복사하지 않는다.

[local-n8n-smoke.mjs](../integration/local-n8n-smoke.mjs)는 격리된 n8n 컨테이너와 로컬 HTTP 응답기를 만든다. 새 독립 API로 만든 세 요청의 fan-out 그래프를 import·실행해 직렬화된 요청을 검사한다. 기존 문서 간 응답 참조와 webhook/callback 회귀도 함께 실행한다. 테스트가 만든 임시 컨테이너와 볼륨만 종료·제거한다.

## 아직 따라갈 구현이 없는 범위

`planWorkflowGraph`, n8n 제어 노드 기능 목록·설정 스키마, 새 출력 바인딩의 실행값 검증·직렬화, 복수 SDK 노드 fragment의 내부 연결, 결손 미리보기는 다음 구현이다. 새 `createHttpRequestNode`는 현재 리터럴 입력을 받으며 출력 바인딩은 명시적으로 거절한다. 기존 scalar 응답 참조 경로는 n8n의 `legacy/workflow/request/`에 남겨 회귀를 확인한다. 바인딩 값을 아직 알 수 없을 때 core 검사 결과의 `requiresRuntimeValidation`은 참이다.

Webhook/callback의 수신 인증·요청 스키마 검사와 callback 등록·상관관계 처리는 앞서 기록한 미완료 범위다. SDK의 구조 검증 통과만으로 이 기능이나 실서비스 실행까지 검증했다고 볼 수는 없다.

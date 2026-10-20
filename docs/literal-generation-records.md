# 독립 API 입력 생성의 이유와 근거

이 기능은 미배포 소스에 있으며 npm `0.2.0`에는 없습니다.

`generateApiArguments`에 `includeExplanations: true`를 주면 같은 값 생성 호출에서
짧은 이유를 받고 `literalGeneration`을 반환합니다. 코드가 원래 시나리오·선택적
호출 역할·실제로 전달한 리터럴 입력 계약을 붙입니다. 확정 입력이나 선행 응답을
모델이 생성한 값으로 표시하지 않습니다.

## 사용법

```ts
import { generateApiArguments } from '@openapi-flow/langchain';
import { validateApiLiteralGenerationRecord } from '@openapi-flow/core';

const result = await generateApiArguments({
  ...input, // callId, operation, scenario, bindings, optional ownership/role/format
  model,
  includeExplanations: true,
});

if (!result.literalGeneration)
  throw new Error('Expected literal generation record');
validateApiLiteralGenerationRecord({
  ...input,
  record: result.literalGeneration,
});
```

옵션을 생략하거나 `false`로 주면 반환값에 `literalGeneration`이 없고 모델 출력
스키마에도 설명 필드가 없습니다. `model`은 실제로 생성할 리터럴 필드가 있을
때만 필요합니다. 남은 필드가 없으면 모델 없이 코드만으로 처리합니다. 필요한
모델을 생략하거나 잘못된 모델을 명시하면 실패하며 대신 사용할 모델을 만들지 않습니다.

## 최종 값과 최초 제안의 구분

예를 들어 OAS가 본문 `id: string`, `quantity: integer`를 선언하고, 호출자가
`confirmedInputs`로 `id`를 확정한 상태에서 수량 2를 요청했다고 가정합니다.
모델이 응답하는 데이터는 다음과 같습니다.

```json
{
  "values": { "body": { "quantity": 2 } },
  "explanation": { "reason": "이 호출 역할에 지정한 수량 2를 사용했습니다." }
}
```

최종 `result.values.body`에는 확정된 `id`와 생성한 `quantity`가 함께 들어갑니다.
`literalGeneration.proposedValues`에는 모델 제안인 `quantity`만 남습니다.
이유도 그 제안 또는 값의 의도적 생략에만 적용합니다. 선행 응답에 맡긴 필드는
`bindings`에 남으며 생성된 상수로 복사하지 않습니다.

기록은 두 종류입니다.

- `proposed-literals`: 최초 제안값, 짧은 이유, 원본 자료와 실제 리터럴 계약
- `not-needed`: 남은 리터럴 필드가 없어 모델을 호출하지 않은 코드 전용 결과

`not-needed`에는 제안값이나 모델 이유를 만들지 않습니다. 모든 입력을 바인딩
또는 확정 입력이 소유한 경우가 이에 해당합니다. OAS가 허용하는 추가 속성 등
실제로 남은 필드는 임의로 닫지 않습니다.

나중에 사용자가 미확정 입력을 채워도 최초 제안은 바뀌지 않습니다. 예를 들어
모델이 빈 값을 제안한 뒤 사람이 수량을 입력했다면 최초 제안은 계속 빈 값입니다.
사람의 값을 과거 모델의 제안으로 다시 표시해서는 안 됩니다.

## 코드가 보장하는 범위

값의 Zod 스키마는 기존 Core 생성 계약을 그대로 사용합니다. 추가 설명은
그 스키마 바깥의 필드이며 요청값 스키마를 다시 만들지 않습니다. 모델 출력에는
필요한 값과 선택적 이유만 있고, 원문·OAS·식별자·입력 소유 관계를 재작성하게
하지 않습니다. 기존 function calling을 유지하며 누락 가능한 OAS 값을 모두
채우도록 하는 strict 출력이나 기본값 주입을 추가하지 않습니다.

원래 OAS는 최종 요청 검사에 그대로 사용합니다. 모델에 전달하는
`literalInputSchema`는 바인딩·확정 입력의 소유 범위를 제외한 투영 계약입니다.
이는 전체 OAS 문서나 전체 요청 계약과 다릅니다. 제외된 필드가 금지 조건으로
보일 수는 있지만 생성 가능한 값으로 제공되지는 않습니다.

`describeApiLiteralGeneration`이 호출 전에 데이터 스냅샷과 계약을 만듭니다.
대기 중 호출자가 원래 operation·바인딩·확정 값을 수정해도 이전 호출의 값과
검증 대상은 바뀌지 않습니다. `createApiLiteralGenerationRecord`와
`validateApiLiteralGenerationRecord`는 원래 입력에서 계약을 도출해 제안값·역할·
원문·투영 계약을 검사합니다. 원문과 제안의 의미가 일치한다는 사실이나 자료
제공자의 신원을 증명하는 검사는 아닙니다.

검증에는 최초 생성 당시의 `input`을 사용해야 합니다. 이후 답변이나 바인딩으로
수정한 현재 입력을 과거 기록의 입력인 것처럼 넘기면 소유 범위가 달라질 수 있습니다.
호스트는 필요한 원본 입력 스냅샷과 기록을 함께 보존해야 합니다.

기록에는 원문과 제안값이 포함됩니다. 호스트가 표시·접근 권한·로그 정책을
정해야 하며, 인증값은 시나리오에 넣지 않아야 합니다. 기록은 후속 그래프 모델이나
n8n materialization 설정에 자동으로 복사하지 않습니다. 실행에 필요한 실제 값과
바인딩만 전달합니다.

## 동일 API의 여러 역할

선택적 `purpose`는 호출자가 제공한 이 호출의 역할입니다. 원문과 별도의 자료이며,
원래 사용자 발화로 가장하지 않습니다. 없으면 경로나 배열 순서로 추측하지 않습니다.

기존 예시는 선택 결과의 역할을 원래 OAS 계약과 함께 검사해 호출 ID에 연결합니다.
형식 선택·바인딩·값 생성·native/그래프 계획에 같은 역할을 전달합니다. 같은 API를
두 역할로 선택해도 목적과 값을 구분할 수 있으며, 선택 목록 순서를 실행 순서로
해석하지 않습니다. 예를 들어 JSON용 호출과 form용 호출은 형식부터 구분합니다.

기존 생성 factory에는 `argumentOptions: { includeExplanations: true }`를 전달합니다.
`reviewMaterials[].arguments`나 `arguments[]`의 기록을 확인할 수 있습니다.
확정 입력만 사용하는 기존 대화 경로는 이 모델 생성기를 호출하지 않으므로 이 옵션이
추가 호출을 만들지 않습니다. 정본 초안의 별도 입력 생성·답변 근거 계약도 유지합니다.

구현과 검증:

- [Core 스냅샷·계약](../packages/core/src/arguments/generation/describe-api-literal-generation.ts)
- [Core 기록 생성](../packages/core/src/arguments/generation/create-api-literal-generation-record.ts)
- [Core 기록 검사](../packages/core/src/arguments/generation/validate-api-literal-generation-record.ts)
- [LangChain 호출](../packages/langchain/src/arguments/generate-api-arguments.ts)
- [선택된 역할과 계약 연결](../examples/langgraph-workflow/src/graph/create-selected-api-call-materials.ts)
- [실제 전송 스키마](../test/literal-generation-http.test.mjs)
- [동일 API의 역할별 형식 검사](../test/repeated-call-media-roles.test.mjs)
- [격리 n8n 검증](../integration/literal-generation-local-n8n.mjs)

독립 [바인딩](binding-planning-records.md)·[native](native-planning-records.md)·
[전체 그래프](graph-planning-records.md)의 설명은 각 단계의 계약으로 분리합니다.
자연어 답변 추출의 설명과 나머지 검증 범위는 [전체 구현 기록](conversational-oss-implementation.md)을 참고합니다.

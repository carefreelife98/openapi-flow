# 독립 API 입력 생성의 이유와 근거

기본 설명·기록 기능과 아래의 초기 enum 의미 선택 옵션은 공개 `0.3.12`에
포함됩니다. 초기 enum 선택은 이전 공개 `0.3.11`에는 없습니다.

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

## 초기 요청의 enum 의미 선택

“조회수 순으로 조회해줘”와 OAS 값 `"VIEWS"`는 같은 문자열이 아닙니다.
`selectOasEnums: true`는 이런 의미 선택을 원문 리터럴 생성과 분리합니다.
요청 경로 추적과 리터럴 출처 검증도 함께 켭니다. 의미 선택 없이 요청한
선택 입력만 추적하려면 `trackRequestedInputs: true`를 사용할 수 있습니다.

```ts
import { validateApiInputAnswerAnalysis } from '@openapi-flow/core';

const result = await generateApiArguments({
  ...input,
  model,
  selectOasEnums: true,
  includeExplanations: true,
});

if (result.enumInterpretation)
  validateApiInputAnswerAnalysis(result.enumInterpretation);
```

`validateApiInputAnswerAnalysis`는 `@openapi-flow/core`의 공개 함수입니다.
위 코드의 `input`은 실제 선택한 operation·callId·scenario·bindings이며,
선택적으로 원래 호출의 `purpose`와 확정 입력·본문 형식을 제공합니다.
가짜 편집 계획이나 임시 API를 만들지 않습니다.

시나리오 기반 생성 factory에도
`argumentOptions: { selectOasEnums: true }`를 전달할 수 있습니다.
`trackRequestedInputs: true`만 전달하면 요청한 선택 입력은 추적하지만 enum
의미 선택은 하지 않습니다. 선택한 옵션은 단일·DAG·검토용 준비 경로의 독립
생성 함수로 전달됩니다. 같은 API의 여러 호출도 각 역할과 입력 기록을 따로
보존하며, 설명·리터럴 출처·enum 선택 기록은 후속 그래프 모델에 전달하지 않습니다.

검토용 준비 경로는 재검사할 때도 `requestedInputs`를 유지합니다. 답이 없는
선택 입력을 ready로 표시하지 않고 원래 인자 준비 단계에서 알려줍니다.
일회성 factory의 기존 fail-fast 계약은 유지하며 자동 질문 루프를 추가하지 않습니다.
입력을 사람에게서만 받는 `confirmed-only` 대화 경로가 초기 값 생성 호출을
새로 수행하게 바꾸지도 않습니다.

0.4.3부터 첫 모델 호출은 `selectOasEnums: true`일 때 `enumIntentInputs`를
명시해야 합니다. 이 목록은 값이 없다는 뜻이 아니라, 사용자가 실제로 표현한
값의 의미를 OAS enum으로 해석할 입력 경로입니다. 예시·미선택 대안·나중에
제공할 값은 이 목록에 넣지 않습니다. 해당 의미가 없으면 빈 배열을 반환합니다.
코드는 이 경로를 요청한 입력 목록에 포함하므로 모델이 두 목록에 중복해서
생성할 필요는 없습니다. 실제 정렬 의도가 있지만 enum 문자열은 원문에 없다면
다음과 같이 응답합니다.

```json
{
  "literalInputs": { "state": "not-provided" },
  "requestedInputs": [],
  "enumIntentInputs": ["/query/sort"],
  "explanation": {
    "reason": "정렬 의도는 있지만 enum 리터럴은 원문에 없습니다."
  }
}
```

빈 매개변수 그룹인 `values: { "query": {} }`도 값이 없는 제안입니다.
원본 기록을 `{}`로 바꾸지 않습니다. 반대로 빈 본문 객체·배열은 실제 요청
데이터이므로 그 원문 출처가 필요합니다. 출처 검사는 기존 편집과 같은 공통
모듈을 사용하며 정확한 원문 위치·JSON 타입 동등성·전체 리터럴 범위를 검사합니다.
OAS에 허용된 값이라도 원문에 없는 enum을 리터럴로 제출하면 거절합니다.
잘못된 값을 지우거나 해석 단계로 재시도하지 않습니다.

코드가 첫 제안·확정 입력·바인딩을 검사한 뒤 `enumIntentInputs`에 선택된
미확정 OAS enum 질문만 `analyzeApiInputAnswers`에 전달합니다. 목록이 비어
있으면 이 추가 모델 호출은 하지 않습니다. 중복·없는 경로·일반 필드·이미
값이 있거나 바인딩된 필드는 거절하며, 이 범위는 결과 재검사에도 유지합니다.
Core의 `describeApiArgumentEnumContext`에서 이 목록을 생략하면 사용 가능한
질문을 조회할 수 있지만, 조회 결과 전체를 자동 해석 대상으로 삼지는 않습니다.
모델은 질문에 속한 OAS 후보 ID와
원문 의도의 위치, 짧은 이유만 고르고 Core가 원래 JSON 값을 복사합니다.
선택지나 의도가 없으면 값을 만들지 않으며, 명확하지 않으면 질문을 남깁니다.
이미 값이 있거나 바인딩·확정 입력이 소유한 필드는 덮어쓰지 않습니다.
요청한 중첩 필드도 원래 OAS 계약에서 도출하고 나머지 필수 입력은 미확정으로 둡니다.

이유 문구는 이 분기를 결정하지 않습니다. 실제 값의 의미가 주어졌는지는
여전히 모델의 의미 판단이므로 일반 정확성을 코드가 보장하지는 않습니다.
다만 ‘값이 미정’이라는 결과를 코드가 다시 ‘의미 해석이 필요함’으로 바꾸던
스케줄링은 제거했습니다. 직접 모델 응답을 만드는 소비자와 테스트도 이 옵션을
사용하면 새 필드를 제공해야 하며, 이전 응답에 값을 자동 보충하지 않습니다.

`literalGeneration.proposedValues`는 최초 리터럴 제안이고 `literalSources`는
그 제안의 검증된 출처입니다. 의미로 선택한 OAS 값은
`enumInterpretation.analysis.enumSelections`에 별도로 남습니다. 원문·질문·
호출 역할은 `enumInterpretation`에서 함께 보존하며, 역할을 사용자 원문 인용으로
취급하지 않습니다. 호스트는 정상 검토에 값과 짧은 이유를 표시하되 전체
계약이나 원문을 화면·로그로 자동 전송하지 않아야 합니다.

실제 원본 OAS와 Chomsky의 별도 재확인에서는 API 선택·리터럴 생성·enum 추출
3회가 모두 HTTP 200이고 원본 `"VIEWS"` 복사와 SDK JSON 컴파일을 확인했습니다.
첫 실행의 60초 추출 시간 초과와 재확인 도구의 빈 그룹 오인은 별도로 보존했습니다.
후자는 저장 결과만 다시 평가했으며 모델 재호출·값 삭제로 통과시키지 않았습니다.
이 모델·컴파일 검증은 새 기능의 Qoopilot 적용이나 업무 API 실행을 뜻하지 않습니다.
의미 판단의 일반 정확도와 중첩·동적 입력 전체 수명주기는 계속 별도 평가 대상입니다.

2026-10-23에는 같은 저장 결과를 격리 n8n `2.37.10`에서 실행했습니다.
검사용 loopback 주소와 워크플로우 식별자를 명시해 SDK로 다시 컴파일했으며,
최초 인자·선택 결과·템플릿 파일의 바이트는 그대로 보존했습니다. 실제 요청은
`GET /lives/ranking?sort=VIEWS`였고 원본 OAS의 요청·응답 검사를 통과했습니다.
컨테이너는 외부 네트워크·포트 공개·호스트 마운트·영구 볼륨 없이 실행 후 자동
제거됐습니다. 추가 모델 호출과 실제 업무 API 호출은 없었습니다. 이는 테스트
배포 설정으로 재컴파일한 결과의 실행이며 Qoopilot 화면 통합이나 원래 주소 미지정
템플릿을 그대로 실행한 검증은 아닙니다.

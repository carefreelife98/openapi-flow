# 요청 본문 형식의 선택 경위와 근거

이 기능은 미배포 소스에 있으며 npm `0.2.0`에는 없습니다.

`analyzeApiRequestMediaType`은 최종 형식뿐 아니라 그 형식을 정한 주체와 과정을
반환합니다. 기존 `selectApiRequestMediaType`은 같은 구현의 최종 형식만 반환하는
함수로 유지합니다. 둘을 연속 호출하면 여러 형식일 때 모델을 두 번 호출하므로,
호스트는 필요한 반환 형태 하나를 선택해야 합니다.

## 사용법

```ts
import { validateApiRequestMediaTypeDecision } from '@openapi-flow/core';
import { analyzeApiRequestMediaType } from '@openapi-flow/langchain';

const decision = await analyzeApiRequestMediaType({
  operation,
  scenario,
  model,
  includeExplanations: true,
});
validateApiRequestMediaTypeDecision({ operation, scenario, decision });

if (decision.kind === 'documented-default') {
  // The model assessed the format as unspecified/ambiguous. Code selected the default.
  console.log(decision.assessment.requestMediaType); // null
  console.log(decision.requestMediaType); // an actual declared format
  console.log(decision.policy);
}
```

`operation`은 선택 후 `resolveApiOperations`로 조회한 OAS 계약입니다.
선택적 `purpose`를 주면 같은 API의 여러 호출 중 해당 역할에 맞는 형식을 판단하며,
이 역할도 근거에 원문과 별도 필드로 보존합니다. 역할이 없으면 추측하지 않습니다.
`includeExplanations`를 생략하거나 `false`로 주면 모델 출력 스키마에서 설명
필드를 제외합니다. `true`이면 같은 형식 판단 호출에서 짧은 이유도 받습니다.

## 코드가 구분하는 네 경로

| `kind` | 결정 과정 | 모델 호출 |
| --- | --- | --- |
| `no-request-body` | 요청 본문이 없으므로 형식도 없음 | 없음 |
| `single-declared-format` | OAS에 선언된 유일한 형식 선택 | 없음 |
| `model-selection` | 모델이 시나리오와 일치하는 선언 형식 선택 | 1회 |
| `documented-default` | 모델이 명시적 `null` 반환 후 코드가 기존 기본값 정책 적용 | 1회 |

모든 결과는 원래 operation 식별자와 `declaredMediaTypes`를 보존합니다.
본문이 없는 결과에는 `requestMediaType`이 없습니다. 코드만으로 결정한 앞의
두 경로에는 `assessment`나 모델 설명을 만들지 않습니다.

뒤의 두 경로에는 `assessment`를 보존합니다. 형식 미지정일 때 모델이 반환하는
데이터의 예는 다음과 같습니다.

```json
{
  "requestMediaType": null,
  "explanation": {
    "reason": "요청에서 본문 형식을 지정하지 않았습니다."
  }
}
```

여기서 이유는 모델의 `null` 판단에 대한 설명입니다. 코드가 결과를 만들면
`kind`는 `documented-default`이며 `assessment.requestMediaType`은 그대로
`null`입니다. 최종 형식은 `requestMediaType`, 적용한 규칙은 `policy`에 남습니다.
JSON이 선언되어 있다면 선택한 주체는 모델이 아닌 코드입니다.

기존 정책은 OAS에 실제 선언된 키만 사용합니다. JSON, form-urlencoded, 나머지
구체적인 형식, wildcard 형식 순으로 선택하고 같은 순위는 문자 코드로 비교합니다.
이 정책은 이전에 합의한 제품 기본값이며 OAS 자체의 기본값 규칙은 아닙니다.
명시적인 다른 형식 선택을 JSON으로 바꾸거나, 잘못된 응답·필드 누락에 기본값을
적용하지 않습니다. 선언에 없는 값과 없는 필드는 실패합니다.

## 이유와 근거의 책임

설명을 켜면 모델은 `explanation.reason`만 작성합니다. 코드가 원래 시나리오와
OAS `requestBody`를 그대로 붙입니다. 근거 형식은 다음과 같습니다.

- `{ kind: 'scenario', text }`: 해당 판단에 실제 전달한 시나리오
- `{ kind: 'oas-request-body', operation, pointer: '/requestBody', value }`:
  원래 식별자와 요청 본문 선언의 스냅샷

모델에게 근거 원문·식별자·포인터·기본값 정책·최종 결정 종류를 작성하게 하지
않습니다. 선언 스키마를 변환하거나 기본값을 본문 값에 주입하지도 않습니다.
중첩된 OAS 자료도 복사하므로 호출 중 외부 객체가 변경되어도 근거는 바뀌지 않습니다.

`createApiRequestMediaTypeDecision`은 코드 전용 경로 또는 명시적 assessment에서
결정을 도출합니다. 여러 형식이면 assessment가 필수입니다.
`validateApiRequestMediaTypeDecision`은 원본 계약과 기록된 assessment에서
결과를 다시 도출해 결정 종류·선택 형식·정책과, 설명에 포함된 원문·본문 근거를
검사합니다. 모델 판단이 시나리오를 정확히 해석했는지, 자료 제공자가 누구인지까지
증명하지는 않습니다. 설명을 끈 기록에는 본문 근거 스냅샷도 없습니다.

## 대화형 호스트 연결

정본 대화 예시 `createWorkflowDraftConversationGraph`는 해당 계획의
`includeExplanations` 설정을 전달하고 `stageResults`의 `request-media` 결과에
`decision`을 보존합니다. 기존 본문 입력·바인딩 단계에는 최종 형식만 전달합니다.
여기서 근거의 시나리오는 호스트가 실제로 보낸 지시·메시지의 JSON 문자열이며,
이를 별도의 사용자 발화인 것처럼 꾸미지 않습니다.

기존 생성·대화 factory에는 `requestMediaOptions: { includeExplanations: true }`를
사용합니다. `requestMediaTypes[].decision`에 같은 결과가 남습니다.
이 옵션은 API 탐색용 `selectionOptions`와 별개이며, 다른 계획 단계의 설명을
자동으로 켜지 않습니다.

구현과 검증:

- [공통 형식 도메인](../packages/core/src/arguments/media/create-api-request-media-type-decision.ts)
- [기존 기본값 정책](../packages/core/src/arguments/media/select-default-api-request-media-type.ts)
- [모델 판단 함수](../packages/langchain/src/arguments/analyze-api-request-media-type.ts)
- [기존 문자열 반환 함수](../packages/langchain/src/arguments/select-api-request-media-type.ts)
- [실제 전송 스키마 검사](../test/request-media-decisions-http.test.mjs)
- [정본 대화·설명 설정 검사](../test/request-media-decisions-conversation.test.mjs)
- [격리 n8n 검증](../integration/request-media-decisions-local-n8n.mjs)

[전체 구현 기록](conversational-oss-implementation.md)에서 남은 단계의 설명 지원과
품질 과제를 관리합니다.

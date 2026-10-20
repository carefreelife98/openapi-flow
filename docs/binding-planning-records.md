# API 입력 연결 계획의 이유와 근거

이 기능은 미배포 소스에 있으며 npm `0.2.0`에는 없습니다.

`planApiBindings`에 `includeExplanations: true`를 주면 같은 모델 호출에서 각 API
호출의 연결 결정에 대한 짧은 이유를 받습니다. 코드가 실제 전달한 시나리오,
호출별 역할, OAS 계약과 native 출력 계약을 `bindingPlanning` 기록에 붙입니다.
모델이 원문이나 계약을 다시 작성하지 않습니다.

## 사용법

```ts
import { planApiBindings } from '@openapi-flow/langchain';
import { validateApiBindingPlanningRecord } from '@openapi-flow/core';

const result = await planApiBindings({
  ...input, // scenario, materials, optional nativeOutputs
  model,
  includeExplanations: true,
});

if (!result.bindingPlanning)
  throw new Error('Expected binding planning record');
validateApiBindingPlanningRecord({
  ...input,
  plan: result,
  record: result.bindingPlanning,
});
```

옵션을 생략하거나 `false`로 주면 이전과 같은 `calls`, `gaps`만 반환하고 모델
출력 스키마에도 이유 필드가 없습니다. 설명 전용 모델 호출은 추가하지 않으며
기존 strict function calling과 공급된 호출·소스 ID의 enum을 유지합니다.

## 실행 계획과 설명 기록

상세 조회가 원본 조회의 응답 `id`를 사용하면 실행용 연결은 다음과 같습니다.

```json
{
  "callId": "detail",
  "bindings": [
    {
      "kind": "node-output",
      "targetPointer": "/path/id",
      "sourceNodeId": "source",
      "sourcePointer": "/id"
    }
  ]
}
```

이 객체는 `result.calls`에 남습니다. `result.bindingPlanning.calls`에는 같은
객체와 `reason`이 함께 들어갑니다. 이유는 호출의 연결 묶음에 적용하며 포인터마다
별도 이유를 생성하지는 않습니다. `bindings: []`인 호출에도 이유를 받아 요청된
선행 의존성이 없다는 판단을 설명합니다.

연결 불가 사유는 기존 `gaps[].description`을 그대로 보존합니다. 같은 내용을
설명 필드로 한 번 더 생성하지 않습니다. 값이 없는 독립 입력, 없는 API,
IF 조건이나 응답 검사는 이 단계의 연결 불가 사유로 바꾸지 않습니다.

`bindingPlanning.evidence.context`에는 코드가 모델에 실제 전달한 자료를 넣습니다.

- 원래 시나리오와 공급된 호출 ID·선택적 역할·본문 형식
- 원래 operation 식별자·method·path·operation·effective 계약
- 코드가 도출한 응답 본문 포인터 목록
- 명시적으로 제공한 native 노드 ID와 JSON 출력 스키마

이는 해당 단계의 입력 자료이며 전체 OAS 파일이나 실제 API 응답 데이터는
아닙니다. 응답 포인터 목록도 모든 런타임 필드의 존재를 보장하지 않습니다.
모델은 실제 응답값·자격 증명·n8n 표현식·근거 사본을 생성하지 않습니다.

## 코드의 검사와 기록 수명

`describeApiBindingPlanning`이 모델 호출 전에 필요한 데이터만 복사합니다.
모델 객체나 계약 밖의 메타데이터는 전달하지 않으며, 대기 중 원래 입력이
바뀌어도 검사 대상은 유지합니다. 누락된 계약 컨테이너나 잘못된 역할·식별자는
호출 전에 오류로 반환합니다. OAS 검사를 새로 구현한 것은 아니며 `materials`는
Core에서 해석한 OAS 계약을 받아야 합니다.

기존 검사는 유지합니다. 각 호출을 한 번씩 명시해야 하며, 선언된 소스·요청 필드와
포인터·타입·겹침·자기 참조·순환을 검사합니다. 잘못된 결과를 수정하거나 다른
값·소스로 대체하지 않습니다. 바인딩은 값을 직접 읽으며 의미·타입을 변환하지 않습니다.

`createApiBindingPlanningRecord`는 실제 계획의 모든 호출에 이유가 하나씩
있는지 검사합니다. `validateApiBindingPlanningRecord`는 최초 입력과 실제
계획에서 기록을 다시 도출해 비교합니다. 역할·계약·native 스키마·포인터 목록·
실행 계획이 바뀌면 과거 기록을 현재 기록으로 사용할 수 없습니다. 이유와 원문의
의미가 일치한다거나 자료 제공자의 신원이 진짜라는 점을 증명하지는 않습니다.

호스트는 최초 입력 스냅샷과 기록을 함께 보존하고 원문의 보관·표시 권한을
정해야 합니다. 나중에 수정한 계획을 과거 모델의 제안으로 표시하지 않습니다.
실행용 인자에는 `calls[].bindings`만 전달하며 설명 기록을 다음 모델이나 n8n
설정에 자동으로 복사하지 않습니다.

## LangGraph 예시

기존 생성·대화 factory에는 `bindingOptions: { includeExplanations: true }`를
전달합니다. `reviewBindings` 콜백과 반환 상태의 `bindingPlan`에서 기록을
확인할 수 있습니다. 이 옵션은 독립 바인딩 단계에만 적용하며 정본 초안의 별도
선택 API 계획 계약은 유지합니다.

API가 없는 예시 경로는 기존처럼 이 단계를 건너뛰고 모델 이유를 만들지 않습니다.
독립 `planApiBindings`는 기존처럼 비어 있지 않은 `materials`를 요구합니다.
일부 호출에 연결할 값이 없다는 사실만으로 자연어의 의존성 판단을 생략하지는
않습니다. 모든 입력이 연결된 API의 뒤이은 `generateApiArguments`가 모델 없이
동작하는 것과는 다른 문제입니다.

구현과 검증:

- [Core 입력 스냅샷](../packages/core/src/bindings/planning/describe-api-binding-planning.ts)
- [Core 기록 생성](../packages/core/src/bindings/planning/create-api-binding-planning-record.ts)
- [Core 기록 검사](../packages/core/src/bindings/planning/validate-api-binding-planning-record.ts)
- [모델 호출](../packages/langchain/src/bindings/plan-api-bindings.ts)
- [실제 전송 스키마 검사](../test/binding-planning-records-http.test.mjs)
- [공식 예시의 옵션·실행 경계](../test/binding-planning-records-host.test.mjs)
- [실제 바인딩과 격리 n8n 검사](../integration/binding-planning-records-local-n8n.mjs)

위 실행 검사의 DAG 구조와 native 설정은 명시적 테스트 재료입니다. 두 바인딩
호출이 전체 워크플로우 구조까지 생성했다고 해석하지 않습니다. native 선택과 전체
그래프의 설명은 각각 [native 계약](native-planning-records.md), [그래프 계약](graph-planning-records.md)에서 다룹니다.
자연어 답변 추출의 설명 등 남은 범위는 [구현 기록](conversational-oss-implementation.md)에 기록합니다.

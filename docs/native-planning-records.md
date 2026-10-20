# Native 계획의 이유와 입력 출처

이 기능은 미배포 소스에 있으며 npm `0.2.0`에는 없습니다.

`planNativeNodes`는 제공된 기능과 OAS 자료에서 새 native 인스턴스만 계획합니다.
`includeExplanations: true`이면 같은 모델 호출에서 인스턴스별 짧은 이유를 받고,
코드가 원래 입력과 실제 구현에서 도출한 계약을 `nativePlanning`에 보존합니다.

## 사용법

```ts
import { planNativeNodes } from '@openapi-flow/langchain';
import { validateNativeNodePlanningRecord } from '@openapi-flow/core';

const result = await planNativeNodes({
  ...input, // planId, scenario, optional capabilities/apiMaterials/preparedNativeNodes
  model,
  includeExplanations: true,
});

if (!result.nativePlanning) throw new Error('Expected native planning record');
validateNativeNodePlanningRecord({
  ...input,
  plan: result,
  record: result.nativePlanning,
});
```

옵션을 생략하거나 끄면 이전 반환값인 `nativeNodes`, `gaps`만 받습니다.
설명 전용 모델 호출은 없습니다. `nativeNodes`에는 새 인스턴스만 있고 호출자가
제공한 `preparedNativeNodes`는 다시 생성하지 않습니다. 같은 기능을 여러 번
사용할 수 있지만 각 인스턴스의 ID는 구분해야 합니다. 배열 순서는 실행 순서가 아닙니다.

기능 목록이 없거나 빈 배열이면 등록부를 추측하지 않고 모델 호출도 건너뜁니다.
이때 모델을 생략할 수 있습니다. 기능이 있어 계획 판단이 필요하면 모델이
필수이며, 잘못된 모델을 명시하면 대체하지 않고 오류로 반환합니다.

## 추가·추가 없음·호출 없음의 구분

설명을 켠 모델 출력은 다음 두 선택 중 하나입니다.

- `decision.additions`: 구현 스키마에 맞는 새 `node`와 각각의 `reason`
- `decision.noAdditionalNodesReason`: 새 인스턴스를 추가하지 않는 이유

두 번째 선택에는 모델이 빈 노드 배열을 만들 필요가 없습니다. 코드가 실제
빈 배열을 반환합니다. 연결 불가 사유는 두 선택 모두의 기존 `gaps.description`에
남기며, 검토용 gap ID와 단계는 코드가 계산합니다.

기록의 `kind`는 모델이 호출되지 않은 `no-capabilities`와 실제 모델 판단인
`model-plan`을 구분합니다. 후자의 `assessment.kind`는 `additions` 또는
`no-additions`입니다. 호출하지 않은 모델의 이유를 만들지는 않습니다.

`evidence.context`에는 실제 공급한 시나리오, API별 역할·OAS 자료, 준비 노드의
원래 값과 포트, 제공된 기능의 실제 파라미터 스키마와 허용 입력 출처를 보존합니다.
`verification`의 포트·참조·출력 스키마는 제안값을 검사한 뒤 구현 함수에서 도출한
자료입니다. 이를 계획 전에 모델이 봤던 자료인 것처럼 표시하지 않습니다.

## 리터럴 값과 실행 시 입력

기본 모드에서는 원래 구현의 파라미터 스키마로 리터럴 값을 계획합니다.
`allowRuntimeParameters: true`를 명시하고 구현도 런타임 파라미터를 지원하면,
모델은 `parameterSource`를 직접 선택합니다.

```json
{
  "id": "runtime-context",
  "capability": "typed-context",
  "parameterSource": "workflow-input"
}
```

이 모델 출력에는 `parameters`나 `runtimeParameters`가 없습니다. 코드가 다음
실행용 재료를 만듭니다.

```json
{
  "id": "runtime-context",
  "capability": "typed-context",
  "parameters": {},
  "runtimeParameters": true
}
```

리터럴을 선택하면 `parameterSource: "literal"`과 원래 스키마에 맞는 값을 함께
반환해야 합니다. 두 출처가 가능한데 선택을 생략하거나, 실행 시 입력을 고르면서
리터럴 값도 넣으면 실패합니다. 파라미터가 리터럴로만 허용된 경우에는 모델이
고정된 출처 표식을 다시 만들 필요가 없습니다.

이는 모델 출력 계약의 변경이며 반환되는 `PlannedNativeNode` 형태는 유지합니다.
이전 모델 출력의 `runtimeParameters: true`를 별칭으로 수용하거나 임시 문자열을
보고 입력 출처를 추측하지 않습니다. 실제로 요청한 `__runtime__` 문자열도
리터럴 출처에서는 그대로 데이터입니다.

이 옵션은 런타임 입력을 강제하는 정책이 아니라 가능한 출처를 여는 옵션입니다.
모델이 시나리오와 맞는 선택을 했는지는 별도 품질 검토가 필요합니다. 코드는
출처 선택에 맞는 형태와 실제 구현 계약을 검사하며 자연어 의미의 정확성을
증명하지는 않습니다. 런타임 입력은 템플릿 컴파일러나 명시적 입력 적용 경로에서
실제 값을 받아 사용해야 하며 빈 객체를 완전한 실행값으로 취급하지 않습니다.

## 스냅샷과 구현의 책임

`describeNativeNodePlanning`이 데이터와 등록부의 선언된 필드를 호출 전에
보존합니다. 콜백은 원래 receiver에 연결해 class의 prototype 메서드와 private
상태도 사용할 수 있게 합니다. 데이터를 복사하는 것과 JavaScript 함수·Zod
객체 내부를 복제하는 것은 다릅니다. 호스트는 구현 콜백·스키마를 순수하고
안정적으로 유지해야 하며 임의의 클로저 상태까지 동결했다는 보장은 없습니다.

호출 대기 중 직렬화된 계획 계약이 달라지면 오류로 드러납니다. 잘못된 값·포인터·
ID 충돌·준비 노드 중복을 보정하지 않고 원래 오류와 모델 제안을 보존합니다.
스키마 전송에는 공통 JSON 직렬화 경계를 사용해 의도한 2020-12 출력 스키마를
일반 JSON 데이터로 전달합니다. Zod의 비열거 Standard Schema hook 때문에
LangChain이 이를 다른 dialect의 입력 스키마로 다시 변환하지 않도록 합니다.

기록 검증에는 최초 입력과 당시 구현을 제공해야 합니다. 이후 계획을 바꾸었다고
과거 모델의 제안과 이유를 수정해서는 안 됩니다. 원문과 값이 기록되므로 호스트가
보관·표시 권한을 정해야 하며, 포함된 근거의 일치가 제공자의 신원을 증명하지는 않습니다.

## 공식 LangGraph 예시

기존 orchestrated·conversational factory의 `nativeOptions.includeExplanations`로
설명을 요청합니다. 상태의 `nativePlan.proposal`은 새 인스턴스만 담은 원래 결과이고,
`nativePlan.nativeNodes`는 준비 노드와 새 노드를 합친 후속 실행 재료입니다.
설명은 `nativePlan.proposal.nativePlanning`에서 확인합니다. 두 목록과 기록은
분리되어 병합된 실행 재료를 수정해도 최초 제안을 다시 쓰지 않습니다.

OAS 없는 native-only 예시는 `sources: []`를 전달합니다. 빈 실제 카탈로그를
만들고 적용 대상이 아닌 API 탐색·입력 단계를 호출하지 않습니다. 가짜 OAS나
가짜 API 결손을 만들지 않으며, 제공한 OAS 자체가 잘못된 경우의 오류는 유지합니다.
CLI의 단일 API 예시는 별도 사용 경로입니다.

후속 연결 모델과 n8n JSON에는 실제 노드 재료만 전달합니다. 설명 기록은 자동으로
복사하지 않으며, 입력 질문 후 재개할 때도 이미 완료한 native 선택을 재호출하지 않습니다.

구현과 검증:

- [Core 입력·등록부 스냅샷](../packages/core/src/workflow/planning/describe-native-node-planning.ts)
- [Core 계획 검사·ID 계산](../packages/core/src/workflow/planning/create-native-node-plan.ts)
- [Core 기록 생성](../packages/core/src/workflow/planning/create-native-node-planning-record.ts)
- [Core 기록 검사](../packages/core/src/workflow/planning/validate-native-node-planning-record.ts)
- [모델 호출](../packages/langchain/src/workflow/plan-native-nodes.ts)
- [입력 출처 적용](../packages/langchain/src/workflow/resolve-native-node-parameter-source.ts)
- [실제 전송 스키마 검사](../test/native-planning-records-http.test.mjs)
- [native-only·대화 재개 검사](../test/native-planning-records-host.test.mjs)
- [실제 모델·격리 n8n 검사](../integration/native-planning-records-local-n8n.mjs)

실행 검사에서 API 선택·바인딩·DAG와 실행 입력은 명시적 테스트 재료입니다.
native 계획 호출이 전체 워크플로우까지 설계했다고 해석하지 않습니다.
[전체 구현 범위와 남은 검증](conversational-oss-implementation.md)을 참고합니다.

# 연결 계획의 이유와 원본 근거

이 기능은 현재 작업 트리의 미배포 소스입니다. npm `0.2.0`에는 없습니다.

## 사용 범위

`planWorkflowConnections`는 이미 선택·검증한 API와 native 인스턴스 사이의 연결만 설계합니다. 선택된 API의 값·바인딩, native 파라미터, 기존 연결은 바꾸지 않습니다. 노드까지 함께 제안하는 두 함수는 [전체 그래프 설명 계약](graph-planning-records.md)을 사용합니다.

```ts
import { planWorkflowConnections } from '@openapi-flow/langchain';
import { validateWorkflowConnectionPlanningRecord } from '@openapi-flow/core';

const plan = await planWorkflowConnections({
  ...suppliedConnectionMaterials,
  scenario,
  model,
  includeExplanations: true,
});

if (plan.connectionPlanning) {
  validateWorkflowConnectionPlanningRecord({
    ...suppliedConnectionMaterials,
    scenario,
    plan,
    record: plan.connectionPlanning,
  });
}
```

옵션을 생략하거나 `false`로 지정하면 기존 실행 결과 형식을 유지합니다. 설명 전용 모델 호출은 추가하지 않습니다. `orchestrateWorkflow`에서도 이 옵션은 연결 단계에 적용하며, 앞선 native 선택의 별도 설명 옵션을 뜻하지 않습니다.

## 모델과 코드의 역할

설명을 켜면 같은 모델 호출에 전체 연결 전략의 `reason`, 새 `edges` 각각의 `reason`, 새로 차단하는 `blockedCalls` 각각의 `reason`을 요청합니다. 독립 root만 있거나 기존 연결을 그대로 사용하는 경우는 전체 이유에서 설명합니다. 이미 고정된 연결·차단 호출을 다시 생성하지 않으며 gap의 기존 `description`도 중복 설명으로 생성하지 않습니다.

모델은 starts, 포트 계약, OAS 사본, 근거 인용문, API 입력값, native 파라미터, n8n JSON을 생성하지 않습니다. `blockedCalls`가 불가능한 문맥에서는 해당 필드 자체를 출력 스키마에서 제외하고, 정본의 빈 목록은 코드가 확정합니다. 필요한 필드가 빠진 모델 결과를 빈 목록으로 대체하는 동작은 아닙니다.

출력은 기존 실행 계획과 별도 `connectionPlanning` 기록으로 나뉩니다. 실행용 연결에는 이유를 넣지 않습니다.

- `decision`: 모델이 제안한 새 연결·추가 gap·새 차단 호출과 짧은 이유
- `plan`: 기존 재료와 새 제안을 합쳐 검사한 정본 결과
- `evidence.context`: 모델에 실제 전송한 시나리오·노드 계약·native 값/포트·기존 연결·gap·API 역할
- `evidence.sources`: 최초 API의 OAS·요청값·바인딩과 native 구현/출력 계약. 코드가 검증에 사용한 자료이며 전부 모델에 전송했다고 표시하지 않습니다.
- `verification.contracts`: 새 gap·차단 결정까지 반영한 사후 노드 계약

짧은 이유는 사용자 검토용 설명입니다. 모델의 내부 사고 과정이나 의미적 정확성에 대한 증명은 아닙니다.

## 원본 고정과 검사

Core의 `describeWorkflowConnectionPlanning`은 호출 전에 선언된 자료를 복사합니다. 앞선 단계의 `literalGeneration` 같은 설명 기록이나 계약 밖의 호스트 메타데이터를 모델로 보내지 않습니다. native 선택과 연결 계획의 재료 캡처는 공통 [구현](../packages/core/src/workflow/planning/capture-workflow-planning-materials.ts)으로 분리했습니다. 가짜 plan ID를 만들어 다른 단계의 검증을 호출하지 않습니다.

클래스 메서드는 원래 인스턴스에 바인딩합니다. 임의 클로저·Zod 내부 상태까지 복제하거나 호스트 구현의 신원을 인증하지는 않습니다. 구현은 순수하고 안정적으로 유지해야 하며, 호출 대기 중 관찰 가능한 직렬화 계약이나 포트가 바뀌면 실패합니다.

`createWorkflowConnectionPlan`이 기존 연결과 제안을 합친 뒤 원래 전체 DAG 검사를 수행합니다. 중복 연결·잘못된 포트·순환·누락된 선행 응답·잘못된 합류·차단된 응답 사용을 설명 기능 때문에 허용하지 않습니다. API/native ID, 요청값, 타입을 보정하거나 필드 이름으로 추정해 연결하지 않습니다.

`createWorkflowConnectionPlanningRecord`와 `validateWorkflowConnectionPlanningRecord`는 최초 입력과 실제 제안에서 정본·근거·사후 계약을 다시 도출합니다. 저장한 기록은 JSON으로 왕복할 수 있지만 원본 자료가 바뀌면 현재 기록으로 재사용할 수 없습니다. 이 검사는 서명·보관 권한·설명 문장의 진위를 보장하지 않습니다. OAS와 요청값이 포함되므로 기록 저장·표시·공유 권한은 호스트가 관리합니다.

전송은 기존 공통 serializer로 만든 명시적 output/2020-12 순수 JSON Schema를 사용합니다. Zod의 비열거 Standard Schema 훅에 의한 재직렬화와 수동 키워드 수정을 피합니다.

## 공식 LangGraph 예시

`createOrchestratedWorkflowGenerationGraph`, `createConversationalWorkflowGenerationGraph`에 `connectionOptions: { includeExplanations: true }`를 전달합니다. `reviewPlan` 콜백과 `state.reviewPlan.connectionPlanning`에서 기록을 확인할 수 있습니다. `nativeOptions`, `bindingOptions` 등과 독립적입니다.

미확정 API 입력을 질문하는 동안 연결 계획은 아직 호출하지 않습니다. 메모리 체크포인트에서 사용자 값을 확정하고 재개하면 확정된 실제 요청값으로 연결 계획을 한 번 호출합니다. 이전 native 선택이나 기록에 사용자의 나중 값을 소급해서 넣지 않습니다. SDK JSON에는 설명 기록을 포함하지 않습니다.

## 검증과 남은 범위

[결정적 검사](../test/connection-planning-records.test.mjs), [실제 ChatOpenAI 전송 검사](../test/connection-planning-records-http.test.mjs), [공식 호스트 검사](../test/connection-planning-records-host.test.mjs)가 옵션·불변성·실패 보존·대화 재개·SDK 분리를 확인합니다. [격리 n8n 검사](../integration/connection-planning-records-local-n8n.mjs)는 실제 모델이 만든 연결을 실행하며, API 선택·입력 바인딩·native 인스턴스는 명시적인 테스트 재료입니다.

구체적인 실행 수치와 로그는 [구현 기록](conversational-oss-implementation.md)에 있습니다. 자연어 답변 추출의 설명, 일반 요구사항 교체 수명, 안전한 단계 재사용, 넓은 모델 품질 평가와 기존 Ajv 특수 키 실패는 아직 남아 있습니다.

분기는 그래프의 독립성을 뜻합니다. n8n worker의 동시 네트워크 요청 수나 실제 처리 순서까지 보장하는 검사는 아닙니다. 실제 모델의 한 제안이 연결 계획 검사에서 거절된 기록도 성공 사례와 함께 남겼습니다. 당시 세부 오류가 저장되지 않아 스키마 검사와 DAG 검사 중 어느 단계였는지는 확인할 수 없으며, 이를 네트워크 문제로 단정하지 않습니다.

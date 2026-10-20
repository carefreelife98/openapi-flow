# 전체 그래프 계획의 이유와 원본 근거

현재 작업 트리의 미배포 기능입니다. npm `0.2.0`에는 없습니다.

## 두 함수의 범위

`planWorkflowGraph`와 `planReviewableWorkflowGraph`는 선택된 API·고정된 준비 노드·사용 가능한 native 기능을 받아 새 native 인스턴스와 연결을 함께 제안합니다. 기존 재료 사이의 연결만 설계하는 `planWorkflowConnections`와 구분합니다.

새 노드의 파라미터와 연결을 같은 호출에서 제안하므로 새 노드의 실제 포트는 제안 후 코드가 도출·검사합니다. 모델이 모든 새 포트 계약을 미리 받는 구조는 아닙니다. 새 노드 계획과 연결 계획 사이에 실제 계약 조회·검토 단계를 두려면 `planNativeNodes`와 `planWorkflowConnections`를 조합합니다. 공식 대화형 경로는 이 단계 분리를 사용합니다.

```ts
const plan = await planWorkflowGraph({
  scenario,
  model,
  materials,
  capabilities,
  preparedNativeNodes,
  includeExplanations: true,
});

const record = plan.graphPlanning;
```

검토형 함수도 `includeExplanations`를 받으며 기존 `gaps`, ready/blocked API 자료 계약은 유지합니다. 옵션 생략 또는 `false`이면 설명 기록을 반환하지 않습니다. 설명 전용 모델 호출을 추가하지 않습니다.

## 모델이 정하는 것

모델은 새 native 노드의 실제 ID·기능·타입에 맞는 파라미터, 명시적 연결, 표현할 수 없는 요구사항을 선택합니다. 설명을 켜면 전체 전략, 새 노드 각각, 연결 각각, 새로 차단하는 ready 호출 각각에 짧은 `reason`을 붙입니다. 준비된 노드는 새 판단으로 다시 생성하지 않습니다. 새 노드·연결이 필요 없거나 독립 root를 사용할 때는 전체 이유에서 설명합니다.

API 선택·요청값·응답 바인딩은 이미 제공된 입력입니다. 이 단계에서 모델이 다시 생성하지 않습니다. OAS 사본·포트 계약·starts·검증 결과·n8n JSON·근거 인용문도 모델 출력에 요구하지 않습니다. 이유는 사용자 검토용 설명이며 내부 사고 과정이나 의미적 정확성의 증명이 아닙니다.

명시적 `capabilities: []`는 API 전용 계획을 뜻합니다. 두 함수 모두 native 기능이 하나 이상 있어야 한다고 요구하지 않습니다. 선택할 기능이 없으면 출력 스키마에서 `additionalNativeNodes`를 제외하고 코드가 빈 추가 목록을 확정합니다. 검토형에서 ready API가 없으면 `blockedCalls`도 제외합니다. 필요한 필드가 빠진 결과를 빈 목록으로 대체하는 것은 아닙니다.

## 코드가 보장하는 것

Core의 [공통 자료 캡처](../packages/core/src/workflow/planning/capture-workflow-planning-data.ts)는 실제 OAS·요청값·바인딩·역할과 준비 노드를 호출 전에 복사합니다. 연결 전용 단계와 공통으로 사용하지만, 아직 생성될 native 출력이 입력 바인딩에 등장한다는 이유만으로 거절하지 않습니다. 새 생산자가 실제로 생성된 뒤 해당 단계의 전체 검사를 수행합니다. 이름이 같은 필드를 자동 연결하지 않습니다.

Core의 [그래프 설명 경계](../packages/core/src/workflow/graphs/describe-workflow-graph-planning.ts)는 실제 모델 문맥과 원본 검증 자료를 분리합니다. 원래 operation의 응답·설명은 필요한 부분만 모델에 보내고, `pathItem`과 중복해서 보내지 않습니다. 앞선 단계의 설명 기록이나 계약 밖의 호스트 메타데이터는 전달하지 않습니다.

클래스 메서드의 receiver는 보존합니다. 임의 클로저나 Zod 내부 상태까지 복제·인증하지는 않으므로 호스트 구현은 순수하고 안정적으로 유지해야 합니다. 비동기 호출 중 관찰 가능한 스키마·포트·출력 계약이 달라지면 실패합니다. 원본 API/native 파라미터·ID·값·타입을 보정하거나 다른 출처로 대체하지 않습니다.

기존 준비 노드와 실제 추가 노드는 Core에서 명시적으로 조립합니다. 준비 노드 반복, 잘못된 참조·포트, 순환, 누락된 선행 결과, 잘못된 합류 등은 원래 그래프 검사에 전달합니다. 출력값이 Zod 기본값·강제 변환으로 달라지는 경우도 거절합니다. 원래 모델 출력과 오류 원인을 보존하며 자동 재시도하지 않습니다.

## 기록의 구성과 검증 상태

실행 계획과 별도 `graphPlanning`에 다음 자료를 저장합니다.

- `kind`: 실행형 또는 검토형을 구분하는 코드 소유 값
- `proposal`: 준비 노드를 제외한 실제 추가 노드·연결·결손 제안
- `assessment`: 같은 호출의 전체 이유와 각 추가 노드·연결·새 차단의 이유
- `plan`: 준비 재료와 제안을 합쳐 도출한 정본 결과
- `evidence.context`: 모델에 실제 전송한 자료
- `evidence.sources`: 코드가 검증에 사용한 원본 OAS·입력·native 구현/출력 계약
- `verification`: 실제 수행한 검사 상태와 사후 계약

`createWorkflowGraphPlanningRecord`, `validateWorkflowGraphPlanningRecord`는 최초 입력과 실제 제안에서 기록을 다시 도출합니다. 이유의 대상 누락·중복, 다른 원본·계획·검증 결과를 현재 기록으로 사용하는 경우를 거절합니다. JSON 저장·복원은 지원하지만 이 기록에 서명이나 저장 권한 제어가 있는 것은 아닙니다. OAS·요청값이 포함되므로 호스트가 저장·표시·공유 범위를 정해야 합니다.

기존 실행형 함수는 결손이 있으면 `starts: []`인 실행 불가 보고를 반환하며 전체 DAG 검사를 완료하지 않습니다. 이 동작은 바꾸지 않았고 기록도 `verification: { status: 'needs-review' }`로 구분합니다. 이를 검증된 실행 그래프라고 표시하지 않습니다. 결손이 없는 실행형 및 전체 검사를 통과한 검토형 기록은 `status: 'validated'`와 실제 사후 노드·출력 계약을 포함합니다. 검토형의 `validated`는 그래프 계약 검사를 뜻하며 결손 해소나 실행 가능을 뜻하지 않습니다.

## 전송과 공식 예시

두 함수는 Zod로 작성한 동적 스키마를 기존 공통 serializer로 명시적인 output/2020-12 순수 JSON Schema로 전송합니다. Zod의 비열거 Standard Schema 훅에 의한 재직렬화나 수동 키워드 수정을 사용하지 않습니다. 모델 응답 타입과 스키마는 별도 파일에서 관리합니다.

`createPlannedWorkflowGenerationGraph`, `createReviewableWorkflowGenerationGraph`는 `graphOptions: { includeExplanations: true }`를 받습니다. 검토 콜백과 각각 `state.graphPlan.graphPlanning`, `state.reviewPlan.graphPlanning`에 기록을 보존합니다. 기존 준비 노드에 모두 연결된 API의 입력값 생성 호출은 추가하지 않습니다. SDK JSON에는 설명·근거 기록이 들어가지 않습니다.

## 검증 자료

- [Core·어댑터 계약 검사](../test/graph-planning-records.test.mjs)
- [실제 ChatOpenAI 전송 검사](../test/graph-planning-records-http.test.mjs)
- [공식 호스트 검사](../test/graph-planning-records-host.test.mjs)
- [실제 모델·격리 n8n 검사](../integration/graph-planning-records-local-n8n.mjs)
- [공통 5개 API 계약 서버·실행 도구](../integration/fixtures/five-api-dag-runtime.mjs)

실제 검사는 API 선택·입력 바인딩을 명시적 테스트 재료로 제공하고, 새 native Merge의 ID·설정과 모든 연결을 모델에 맡깁니다. 생성된 노드 ID나 Merge 입력 순서를 고정 정답으로 강요하거나 수정하지 않습니다. 원래 제안을 SDK로 컴파일하고 실행마다 새 응답 ID를 사용해 값의 실제 전달을 확인합니다. 분기 독립성은 DAG 계약이며 n8n worker의 동시 네트워크 요청 수를 보장하지 않습니다.

구체적인 결과와 남은 전체 목표는 [구현 기록](conversational-oss-implementation.md)에 있습니다. 이 기능만으로 전체 OSS 완성을 주장하지 않습니다.

# Native 기능 선택과 늦게 준비되는 소스 계약

이 기능은 미배포 소스이며 npm 0.2.0에는 없습니다.

API나 native 생산자를 선택하기 전에도 지원 기능의 정의는 알고 있습니다.
응답 타입과 실제 n8n 노드 이름은 생산자의 계약과 컴파일 결과에서 얻어야 합니다.
이 두 시점을 분리해 같은 계획에서 기능을 선택하고 실제 소스를 결합합니다.

## 공개 등록부

```ts
import {
  N8nNativeFeature,
  resolveN8nNativePlanningFeatures,
} from '@openapi-flow/n8n';

const registry = resolveN8nNativePlanningFeatures({
  features: [
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
  ],
  itemMode: 'linked',
});
const definitions = registry.planningCapabilities;
const inventory = registry.registrations;
const materialized = registry.capabilities;
```

소스가 없으면 등록 상태는 `requires-context`로 남습니다. `planningCapabilities`는
선택 단계에 제공할 정의이며, `capabilities`는 실제 재료로 구성된 구현만 담습니다.
기존 `resolveN8nNativeFeatures`는 명시적으로 선택한 기능의 소스가 없으면 계속
실패합니다. 새 함수는 예외를 잡아 다른 소스를 넣는 경로가 아닙니다.

`features` 생략은 전체 등록 기능, `[]`는 선택 없음입니다. 순서·중복·extension
이름 충돌 검사는 유지하며, 제공한 잘못된 소스나 설정을 무시하지 않습니다.
추가 문맥이 없으면 11개 기능군 중 실제 재료로 구성되는 구현은 6개이고 계획용
정의는 10개입니다. API 배열 분리·API 응답 수집·native 배열 분리·API item 합류는
나중에 실제 소스 계약을 결합합니다. `JsonOutput`은 호스트 소유 이름·설명·원본
Zod 입력 스키마가 없으면 미준비 상태로 남고 선택 가능한 정의를 만들지 않습니다.
호스트는 이 입력 계약만 등록합니다. 노드 인스턴스·설정값·소스 선택·연결은 각
계획 단계가 따로 정하므로 호스트가 완성 노드를 미리 작성할 필요는 없습니다.

## 정의와 실제 계약의 구분

네 소스 의존 기능은 이름·설명·구조 스키마·참조 위치·포트를 기존 구현과 공유합니다.
포트는 구현과 파라미터에서 도출하는 구조 정보입니다. 소스 없는 정의의 값 참조·
출력 스키마·컴파일을 직접 호출하면 명시적 오류가 발생합니다. 가짜 출력 스키마나
컴파일 이름을 제공하지 않습니다.

실제 계약은 기존 `bindMaterialContracts`와 `resolveNativeMaterialSnapshot`이
결합합니다. 컴파일 이름은 실제 SDK 생산자 fragment에서 얻습니다. 고정 정의를
최초 계획의 문맥에 넣고 재료만 단계별로 결합하므로, 생산자 선택을 이유로 기능
목록을 바꾸거나 지문을 재발급하지 않습니다. 원래 정의·요구 조건을 바꾸면 기존
지문 검사는 실패합니다. 값의 의미·타입이나 원본 OAS는 바꾸지 않습니다.

## LangGraph 선택 옵션

```ts
const graph = createWorkflowDraftConversationGraph({
  model,
  checkpointer,
  name: '사용자와 만드는 워크플로우',
  reviewPolicy: 'review',
  context: {
    operations: suppliedOperations, // OAS가 없으면 명시적으로 []
    capabilities: [], // 명시적으로 추가할 사용자 구현
    messages: [],
  },
  nativeFeatures: {
    features: [N8nNativeFeature.If, N8nNativeFeature.SplitApiResponseArray],
  },
});
```

`nativeFeatures: {}`는 전체 등록 기능을 검토합니다. `nativeFeatures` 자체를
생략하면 기존 API대로 `context.capabilities`에 명시한 구현만 사용합니다.
등록 기능을 몰래 추가하지 않으며 이름이 겹치면 실패합니다. `itemMode`는 명시적
실행 옵션이며 배열 포인터나 소스 이름에서 추측하지 않습니다.

대화 상태와 실제 검토·질문 payload의 `nativeFeatures`에는 기능군·등록 상태·
`planningAvailable`·부족한 문맥이 있습니다. 함수나 Zod 객체를 이 목록 데이터에
저장하지 않습니다. 호스트 소유 스키마를 채팅 답변으로 대체하지도 않습니다.
이 목록은 그래프를 구성할 때 제공한 호스트 문맥의 등록 상태입니다. 개별 단계의
현재 소스 준비 상태는 아래 Core 함수와 질문 결과로 따로 판단합니다. 등록 기능과
구현의 대응은 `planningRegistrations`에서 얻으며, 사용자 확장 기능의 이름이
등록 기능명과 같다는 이유로 같은 기능군이라고 판정하지 않습니다.

## 코드가 정하는 대기와 재개

Core의 `describeWorkflowDraftNativeNodeAdditionReadiness`는 선택된 미완료 단계와
현재 원본 소스를 검사합니다. 구현의 `materialRequirements`에서 소스 종류·최소
개수를 읽고 `ready` 또는 `requires-context`와 실제 가용 개수를 반환합니다.
알 수 없는 단계나 잘못된 요구 조건은 오류입니다. 이 선언은 실행 순서나 필드
이름 매칭이 아닙니다.

예시 호스트는 소비자를 먼저 선택했더라도 소스가 없으면 그 단계의 모델을
호출하지 않습니다. 독립 단계와 생산자 설정을 계속 계획하고 같은 정본 계획에서
준비 상태를 다시 계산합니다. 더 진행할 작업이 없으면 `native-materials` 질문과
구조화된 `nativeMaterialReadiness`를 반환합니다. 미확정 계획은 승인할 수 없으며
사용자는 요청을 수정하거나 취소할 수 있습니다.

개수 충족은 적절한 배열·포인터·타입·DAG가 증명됐다는 뜻이 아닙니다. 실제
파라미터·참조·출력·최종 연결 검사는 계속 적용합니다. 의미 선택·값 생성·연결
계획에는 해당 단계의 모델 호출이 남습니다.

## 검증

별도 생산자 선택 단계를 사용하면 구현은 `parameterReferenceSources`를 명시합니다.
`response`는 API 응답, `node-output`은 선언된 native JSON 출력,
`exclusive-output`은 IF 같은 배타적 분기의 제어 출처입니다. `[]`는 설정에서
다른 노드를 참조하지 않는다는 선언입니다. 이 값은 기능 구현자가 등록하며
최종 사용자가 API Path마다 정하는 설정이 아닙니다. 선언이 없거나 잘못되면
새 생산자 선택 단계는 모델 호출 전에 실패합니다. 생략을 전체 허용으로 보지
않습니다. 이 단계를 사용하지 않는 기존 저수준 계약까지 선언을 강제하지는 않습니다.

Core는 소비자가 지원하는 참조 종류와 실제 API·native·배타적 분기 후보를 결합해
후보 ID와 출력 스키마를 만듭니다. Merge append는 설정이 입력 수뿐이므로 후보가
없고, 응답 검사는 API 응답만 고릅니다. native 데이터가 없는 Merge·IF를 임의의
JSON 생산자로 제공하지 않습니다. 아직 설정하지 않은 역할은 구현이 해당 종류의
출력을 선언할 때만 잠재 후보가 되며, 실제 출력 스키마는 설정 후 따로 검사합니다.

선택할 후보가 전혀 없으면 독립·정본 경로 모두 모델 없이 빈 참조 선택을
확정합니다. 실제 설정 참조와 선언한 생산자가 정확히 같은지 검사하는 기존
계약은 유지합니다. 구현이 지원하지 않는 참조를 반환하거나 재결합 중 선언을
바꾸면 거절합니다. 실행 순서와 n8n 연결은 이 선언이 아니라 별도 연결 계획이
결정합니다. 실제 모델·n8n 재검증은 아래 실행 기록과
[짧은 대화 평가](short-conversation-evaluation.md)를 구분해서 확인합니다.

## 독립 API 응답과 반복 item 참조

`itemMode: 'linked'`에서 native IF·응답 검사가 독립 API 분기를 Merge append로
모은 뒤 두 API를 함께 참조할 수 있습니다. append 결과의 각 item은 한 분기의
선행 관계만 가지므로, 모든 API를 무조건 현재 item의 선행 결과로 읽으면 다른
분기의 응답을 찾지 못합니다.

컴파일러는 실제 API fragment의 `preservesInputItems` 선언과 현재 DAG를 검사합니다.
Manual Trigger의 한 item에서 시작하는 API root와, 증명된 API에서 단일 연결로
이어지는 item 보존 API만 단일 응답으로 증명합니다. 이 응답은 정확히 한 개여야
하며 0개·복수 결과는 오류입니다. 알 수 없는 native 스트림·배열 확장·다중 입력을
지나 단일 결과라고 추측하지 않습니다. 그 밖의 참조는 기존 n8n item 선행 관계를
사용하고, 실패 후 다른 결과를 선택하는 재시도는 없습니다.

IF의 OAS 검사 guard와 실제 비교식은 같은 선택 정책을 사용합니다. 원본 응답 전체의
OAS 검사·값·타입·비교 의미·출력 item 연결도 유지합니다. 이 증명은 현재 native
IF·응답 검사 컴파일 경로에 적용하며, 임의 사용자 fragment나 모든 native 변환을
거쳐도 단일 결과임을 증명한다는 뜻은 아닙니다. 독립 저수준 native 컴파일은 전체
DAG가 없으므로 자동 증명을 추가하지 않습니다.

재현 검사는 다음 명령으로 실행합니다. 격리 n8n의 정상·실패 응답 검사와 IF의
참·거짓 분기를 확인하며 실제 업무 API와 모델은 호출하지 않습니다.

```sh
npm run test:native-singleton-responses-local-n8n
```

```sh
npm run typecheck
node --test test/native-feature-planning*.test.mjs
npm run test:native-feature-planning-local-n8n
```

검사는 네 기능의 원본 소스 결합·기존 생성기와 같은 출력·SDK fragment·지문 변경
거절을 확인합니다. 대화에서는 소비자 우선 선택·독립 작업 보존·생산자 준비 뒤
동일 계획에서의 진행과 소스가 없는 경우의 질문·승인 거절을 확인합니다.
격리 n8n 사례는 명시한 `[3, 1]`을 원래 타입의 두 item으로 분리하고 독립 root도
실행합니다. 전체 내장 노드 지원이나 광범위한 자연어 품질을 증명하는 검사는
아닙니다. 실제 결과는 [구현 기록](conversational-oss-implementation.md)에 구분합니다.

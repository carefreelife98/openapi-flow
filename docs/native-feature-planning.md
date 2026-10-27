# Native 기능 선택과 늦게 준비되는 소스 계약

이 기능은 미배포 소스이며 npm 0.2.0에는 없습니다.

API나 native 생산자를 선택하기 전에도 지원 기능의 정의는 알고 있습니다.
응답 타입과 실제 n8n 노드 이름은 생산자의 계약과 컴파일 결과에서 얻어야 합니다.
이 두 시점을 분리해 같은 계획에서 기능을 선택하고 실제 소스를 결합합니다.

## 2026-10-27 미배포: native 처리 결과를 공식 Aggregate로 수집

`CollectNativeOutputValues`는 필드 선택·길이 계산·항목 결합 뒤에 나온 native JSON 값을
하나의 `items` 배열로 수집하는 어댑터입니다. API 응답만 받던 기존 수집 기능과 검사·
SDK 컴파일 코드를 공유하며, 실제 수집은 [공식 Aggregate](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/)가 수행합니다.
자체 집계 알고리즘이나 모델 JavaScript는 추가하지 않았습니다.

```ts
import { createNativeValueCollectionCapability } from '@openapi-flow/n8n';
import type { NativeValueCollectionParameters } from '@openapi-flow/n8n';

const collector = createNativeValueCollectionCapability({ sources });
const parameters: NativeValueCollectionParameters = {
  sourceNodeId: 'selected-fields',
  pointer: '',
};
```

`sources`는 이미 준비된 생산자의 원본 출력 계약이며, 컴파일에는 실제 SDK 노드 이름도
필요합니다. 모델은 그 생산자 ID와 해당 계약의 포인터만 선택합니다. 코드는 원본 계약에서
배열 요소 타입과 데이터 의존성을 도출하고, 실행 시 전체 원본과 선택 값의 존재를 검사합니다.
후속 API에는 `/items` 또는 전체 수집 객체를 기존 native 출력 바인딩으로 전달합니다.

예를 들어 선택한 값이 두 배열이면 출력은 `{"items":[[0,false,null],[]]}`입니다.
중첩 배열을 펼치거나 중복을 없애지 않고 문자열·숫자·boolean·null과 받은 순서를 유지합니다.
원본 필드 이름이나 OAS schema도 바꾸지 않습니다. 공식 Aggregate의 `mergeLists`는 끄고,
null 보존 옵션은 켭니다. 없는 필드는 null로 대체하지 않고 그전에 오류로 중단합니다.

수집 범위는 현재 들어온 한 스트림입니다. 독립 분기의 완료를 기다리는 Merge나 부모 항목별
그룹화·페이지 반복을 대신하지 않습니다. 여러 입력을 하나로 줄이므로 항목 수가 유지된다고
선언하지 않으며, 공식 Aggregate가 제공한 모든 입력의 `pairedItem` 이력을 보존합니다.
빈 입력은 실행되지 않고 빈 결과를 새로 만들지 않습니다.

공통 컴파일 경로는 `nodes/native/collection/`에 있고 타입·Zod schema는 각각 `types/`와
`schemas/`에 분리했습니다. 등록부의 선택 가능한 어댑터는 로컬 소스 기준 17종입니다.
공개 0.3.18이나 모든 n8n 내장 기능의 자동 지원을 뜻하지 않습니다.

집중 48건에는 로컬 HTTP의 실제 LangChain 전송 2회와 기존 소스/등록부 회귀가
포함됩니다. 원본 OAS 4파일 회귀 59건과 전체 OSS 1,674/1,675건을 별도로 확인했으며,
기존 Ajv `__proto__` 한 실패·skip/cancel 0을 유지합니다. 격리 n8n 2.37.10의 9조건은 행·중첩 배열·숫자·중복 수집,
빈 입력, 상위 및 수집 단계의 계약 위반·필드 부재를 포함합니다. 정상 네 조건만 각각
한 번의 후속 REST 요청을 만들었습니다. 이는 합성 데이터 검사이며 원문 다섯 예제 전체
생성·실제 Chomsky 품질·Qoopilot 화면 적용의 검증은 아닙니다.

재현 명령은 `node integration/native-value-collection-local-n8n.mjs`입니다. 현재 사용자
서버·Cloud·공개 설치는 바꾸지 않으며, 계층적 제품 통합·분류/페이지·다섯 예제 독립
생성/엔진/화면 평가·승인 릴리스의 전체 계획은 계속 진행합니다.

## 2026-10-27 미배포: 공식 Edit Fields의 명시적 길이 측정

기존 `ProjectNativeOutput`의 각 필드에 선택적 `measurement`를 추가했습니다.
생략하면 원래 값을 복사하고, 지정하면 별도 파생 필드에 정수를 만듭니다. 새 기능군·
자체 문자열 순회 알고리즘·모델 JavaScript는 추가하지 않았습니다. 계산은 공식
Edit Fields의 표현식이 수행합니다. [n8n 문자열 length](https://docs.n8n.io/build/work-with-data/transform-data/expression-reference/string.md#stringlength)와
[배열 length](https://docs.n8n.io/build/work-with-data/transform-data/expression-reference/array.md#arraylength)를 재사용합니다.

```ts
const parameters = {
  sourceNodeId: 'joined',
  fields: [
    { name: 'originalCode', pointer: '/item/code' },
    {
      name: 'utf16Units',
      pointer: '/item/code',
      measurement: 'utf16-code-units',
    },
    {
      name: 'candidateCount',
      pointer: '/item/values',
      measurement: 'array-items',
    },
  ],
};
```

위 설정은 예시입니다. `A😀`의 UTF-16 길이는 3이며 사람이 보는 글자 수나 grapheme
개수와 같다는 뜻이 아닙니다. [ECMAScript의 문자열 길이 정의](https://tc39.es/ecma262/multipage/text-processing.html#sec-properties-of-string-instances-length)를 따릅니다.
문자 수의 업무 단위가 미정이면 모델이 임의 기본값을 정하지 않고 값 생성 단계에서
질문하도록 계약을 설명합니다. 코드가 자연어의 업무 의미까지 증명하는 것은 아닙니다.
이 측정으로 OAS `minLength`·`maxLength` 검사를 대체하지 않으며 원래 OAS 검증은 유지합니다.

모델 출력은 원본 복사와 단위가 필수인 측정의 두 strict 객체 대안입니다. 단위를
생략한 계산이나 지원하지 않는 단위는 거절합니다. 코드는 원래 타입이 명시적으로
양립할 수 없으면 생성 전에 거절하고, 실제 값의 존재·타입과 전체 원본 계약도
Edit Fields 앞의 Code에서 검사합니다. `null`·값 부재를 0으로 대체하지 않습니다.
Core의 타입 교집합 검사는 필요한 조건만 확인하며 `number`와 `integer`의 포함 관계를
유지합니다. 참조·다른 조건을 없애거나 일반적인 schema 만족 가능성을 증명하지 않습니다.

집중 회귀 55건·원본 OAS 4파일 회귀 58건·전체 OSS 1,668/1,669건을 확인했습니다.
전체 실패 한 건은 기존 Ajv `__proto__` 제약이며 skip/cancel은 0입니다. 실제 OAS의
nullable 타입 배열도 원본 그대로 검사합니다. 첫 새 OAS 검증기의 단일 타입 가정은
타입 목록을 처리하도록 수정했으며 OAS나 실행 로직은 바꾸지 않았습니다.

실제 LangChain의 로컬 HTTP 전송과 격리 n8n 2.37.10의 정상/차단 6조건·로컬 요청
4건이 통과했습니다. 한글·이모지·결합 문자, 빈 문자열·배열, 원본 값·항목 이력과
실패 전 후속 호출 차단을 검사합니다. 별도 실제 Chomsky의 한 번 설정 생성도
기존 라우팅의 HTTP 429→200으로 완료했고, 받은 노드를 고치지 않고 공식 SDK로
만든 JSON을 격리 n8n에서 실행했습니다. 원래 `0007`과 배열을 보존한 채 길이 4·
개수 1을 확인했습니다. 이 완전 명시 합성 사례를 원문 다섯 예제의 새 전체 생성·
제품 UI 적용·광범위 품질 향상으로 세지 않습니다. 공개 0.3.18·기존 서버·Cloud는 그대로입니다.

## 2026-10-27 미배포: 모델 후보와 실행 입력 검사의 분리

OAS 포인터의 모델 후보 schema에는 현재 재료를 검사하는 Zod refinement가 있을 수
있습니다. 이 schema를 실행 입력의 JSON Schema로 옮기면 검사를 잃거나 변환을
거절할 수 있습니다. `createNativeParameterGenerationContract`는 원래 실행
`capability`와 현재 `planningParametersSchema`를 별도로 받습니다. 선택·설정·
설정 후 검사·추가/변경·연결 준비가 각 계약을 해당 용도로 전달합니다.

전체 설정을 실행 시 입력으로 받으면 계획 시 값은 빈 객체입니다. 기존
`referenceStructureSchema`가 빈 객체를 거절하면 이 전체 입력 소유권은 선택
후보에 넣지 않습니다. 특정 기능 이름이나 API path로 제한하지 않고 원래 계약에서
도출합니다. 그룹 선택의 API 출처·응답 경로는 계획 시 확정하고 그룹 키 `/key`만
실행 시 받는 선택은 유지합니다. 원본 모델 결정을 이 방식으로 자동 변환하지 않습니다.

실행 스키마의 실제 custom refinement·transform 직렬화 거절은 유지합니다. 모델용
검사를 삭제하거나 `unrepresentable`을 무시하는 옵션은 추가하지 않았습니다.
정적 역할 선택·설정 생성·후속 native 설정 검사와 슬롯 수집을 잇는 회귀를 포함하며
실제 생성 단계의 잘못된 값·참조 검사도 계속 적용합니다.

집중 회귀는 69건 통과했습니다. 실제 원문 다섯 쌍의 생성은 이 수정 전 실행이며
단일 0/5·증분 0/5, 모두 연결 이전 중단입니다. 수정 뒤 보존된 잘못된 전체 소유권
제안을 그대로 재생하면 선택 계약에서 거절됩니다. 이를 `/key` 제안으로 고치거나
새 전체 워크플로우 성공으로 세지 않습니다. 새 모델의 재계획과 남은 기능 보강은
별도 작업입니다. 제품의 공개 0.3.18 설치와 기존 서버·Cloud는 유지합니다.

최종 통합 집중 검사는 81건, 전체 OSS는 1,661/1,662건이며 기존 Ajv 특수 키 실패
한 건·skip/cancel 0을 유지합니다. strict 타입·빌드·Lint·포맷과 원본 OAS 57건도
확인했습니다. 별도 격리 엔진의 비교 7조건과 그룹 선택/실행 입력 6조건·로컬 요청
9건은 정상/차단 기대와 일치합니다. 이 엔진 검사는 합성 계획의 실행이며 원문 다섯
시나리오의 생성 품질이나 새 제품 UI 적용을 증명하지 않습니다.

## 2026-10-27 미배포: 기존 IF·assertion의 native 출력 참조

IF와 assertion은 API 응답뿐 아니라 실제 native 생산자의 JSON도 비교할 수 있습니다.
새 분류 노드나 기능 enum을 추가하지 않았습니다. 원래 IF·검사 구현의 참조 종류에
`node-output`을 추가하고 기존 Code 검사·공식 IF 컴파일러를 재사용합니다.

```ts
const parameters = {
  combinator: 'and',
  conditions: [
    {
      left: {
        source: 'node-output',
        nodeId: 'joined',
        pointer: '/item/amount',
      },
      operator: 'greaterThan',
      right: { source: 'literal', value: -1 },
    },
  ],
};
```

위 숫자는 합성 예시의 명시적 기준입니다. OSS가 업무 임계값이나 정상 판정 규칙을
기본값으로 정하지 않습니다. 실제 생산자·포인터·원래 타입은 코드가 검사하고 값은
변환하지 않습니다. `source: 'response'`는 HTTP 본문, `node-output`은 native JSON
그 자체를 뜻하므로 서로 다른 종류를 같은 ID의 별칭으로 대체할 수 없습니다.

Core의 `WorkflowCapabilityPlanningContext.nativeOutputs`는 선택 입력입니다.
생략하면 native 값 후보가 없으며 미래 역할의 출력 형태를 추측하지 않습니다.
준비된 생산자와 단계별 설정에서는 실제 완료된 출력 계약을 전달합니다. 모델 스키마는
생산자 ID와 그 생산자의 포인터 후보를 함께 묶습니다. 다른 생산자의 필드·존재하지
않는 ID·닫힌 계약에 없는 필드는 거절하며, 동적 경로는 원래 schema로 검사합니다.

컴파일에는 현재 `nativeOutputSources`의 실제 이름·schema가 필요합니다. linked
모드는 항목의 원래 연결을 따라가고, 단일 항목 모드에서 다건 값은 첫 항목 선택으로
우회하지 않고 실패합니다. IF 자체가 새 bindable JSON 생산자가 된 것은 아닙니다.
후속 참조는 실제 값을 만든 원래 생산자를 가리켜야 합니다.

격리 n8n에서 IF 표현식의 예외가 실행 실패 대신 false 분기로 끝나는 경우를 확인했습니다.
따라서 전체 출력 계약, 선택 값의 실제 존재, 비교 연산의 타입은 앞선 Code 단계에서
검사합니다. 정상적인 false 결과는 거절하지 않습니다. optional 필드의 값이 없거나
숫자가 아닌 값을 수치 비교에 쓰면 잘못된 분기로 진행하기 전에 중단합니다. 기존 비교
알고리즘을 복제하지 않고 IF와 assertion이 같은 평가 코드를 사용합니다.

단일 native 계획과 선택/생산자/설정 분리 경로의 실제 LangChain 전송, 항목별 IF·
assertion과 빈 입력·역순·계약 위반·입력 부재는 각각 별도로 검증합니다. 엔진 검사는
`node integration/native-output-comparisons-local-n8n.mjs`로 재현합니다. 합성 검사이며
원문 다섯 업무 시나리오의 생성 품질·모든 분류/계산 기능 완료를 뜻하지 않습니다.
공개 0.3.18과 소비자 설치는 아직 이 확장을 포함하지 않습니다.

공통 구현은 `nodes/native/comparisons/`, 타입은 `types/comparison-input-*.ts`,
동적 생성 스키마는 `schemas/create-native-comparison-planning-schema.ts`가 소유합니다.
기존에 잘못된 입력을 false로 보던 워크플로우는 이제 먼저 실패할 수 있으므로 향후
릴리스의 호환성 안내가 필요합니다. 정상 입력·원래 비교 결과·생성 노드 식별자는 유지합니다.

최종 전체 회귀는 1,660/1,661건이며 기존 Ajv `__proto__` 실패 한 건을 유지합니다.
skip/cancel은 0입니다. 집중 계획·전송·생산자 선택·문서 링크 회귀 30건과 strict 타입·
빌드·Lint·포맷을 확인했습니다. 기존 API 응답의 optional 값 부재·잘못된 수치 비교도
같은 Code 경계에서 차단하는 회귀를 포함합니다. 엔진 7조건은 다건·역순·빈 입력의
성공과 모호한 다건 참조·원본 계약 위반·비교값 부재·assertion 불일치의 중단입니다.

초기 전체 검사의 3건은 API 전용이라는 이전 기대여서 새 참조 선언에 맞췄습니다.
출력이 없는 Merge·제어 포트의 부적절한 생산자 선택 검사는 그대로 유지합니다.
초기 엔진의 optional 값 부재는 실제로 false 분기로 진행했고, 공통 Code 검사 보강 뒤
다시 실행해 중단을 확인했습니다. 실패를 숨기거나 검증 제한을 늘려 통과시키지 않았습니다.

ICL·Honeypot 등 기존 원본 OAS 4파일의 별도 회귀는 57건 통과했습니다. 그중 새 검사는
원래 응답 schema를 보존한 native JSON을 두 item 모드의 IF·assertion 모델 계약과
컴파일러에 전달합니다. HTTP envelope로 다시 감싸거나 OAS를 고치지 않습니다.
첫 병렬 실행은 다른 검사의 재빌드가 bundle을 정리하는 시점과 겹쳐 파일 부재로
실패했습니다. 빌드 종료 뒤 원래 56건과 새 검사 포함 57건을 각각 다시 실행했습니다.
실제 업무 API·원문 다섯 예제 전체 생성·원본 OAS의 엔진 실행은 이 회귀 범위가 아닙니다.

## 2026-10-27 확인: 공식 설정 스키마의 공개 추출 경계

설치된 SDK 0.36.4의 `generateSingleVersionSchemaFile`로 정확한 공식 정의 여섯 개의
코드를 만들고, 별도 검증 프로세스에서 공개 보조 함수와 Zod 3을 전달했습니다.
Filter 2.3·Loop Over Items 3은 스키마를 구성했지만 Merge 3.2·Set 3.5·Split Out 1·
Aggregate 1은 공개 export에 없는 `resolveSchema`가 필요했습니다. SDK 내부 함수나
캐시를 우회해 읽지 않았고 이 생성 코드를 제품에서 평가하는 구현도 추가하지 않았습니다.

이는 공식 SDK의 설정 검사와 노드 실행을 사용하지 못한다는 뜻이 아닙니다.
앞선 준비 검사·SDK 생성 경로와 모델에 전달할 설정 스키마 추출은 구분합니다.
전체 설정 계약의 공식 공개 경로 연결은 아직 남은 작업입니다.

## 2026-10-27 미배포: native 결손의 독립 검토와 명시적 재선택

`reviewNativeInstanceSelection`은 기존 선택이 보고한 gap을 원래 시나리오·실제 API·
native 구현 계약과 대조하는 독립 함수입니다. gap이 없으면 모델을 호출하지 않고,
있으면 한 번 호출합니다. 기존 선택 함수에 숨은 재시도를 추가하지 않았습니다.

모델은 각 기존 gap에 대해 실제 미지원 동작, native 설정 작업, API 계획, 연결 계획,
업무 판단 중 하나를 제안합니다. 각 분류에는 원래 시나리오의 정확한 인용과 짧은
이유가 필요합니다. API·노드·기능 참조는 실제 제공된 후보에서만 선택합니다.
코드는 누락·외부 gap ID·잘못된 출처·중복 참조·바뀐 선택 원본을 거절하고 결과 상태를
계산합니다. 이 검사는 분류의 의미가 항상 정확하다는 증명이 아닙니다.

| 결과 상태                     | 호스트가 할 일                                                       |
| ----------------------------- | -------------------------------------------------------------------- |
| `no-gaps`                     | 검토할 결손 없음. 기존 후속 단계를 진행                              |
| `needs-reselection`           | 저장한 원본 선택·검토를 명시적 feedback으로 새 선택 호출에 전달      |
| `unavailable-native-behavior` | 실제 미지원으로 평가한 항목을 유지하고 기능/계약을 보강              |
| `needs-business-decision`     | 업무 질문을 사용자에게 전달. 기술 계획 수정을 사용자에게 맡기지 않음 |

여러 분류가 함께 있으면 미지원 동작이 전체 상태에서 우선하고, 모든 항목의 상세 분류는
그대로 남습니다. 업무 판단이나 미지원 상태를 자동 재선택 feedback으로 넣어 우회할 수
없습니다. 같은 원본이라도 검토 상태를 수정해 넣으면 검사에서 거절합니다.

```ts
const review = await reviewNativeInstanceSelection({
  ...source,
  selection,
  model,
});
if (review.status === 'needs-reselection') {
  // Host: reserve its explicit budget and checkpoint the original selection/review first.
  const candidate = await selectNativeNodeInstances({
    ...source,
    model,
    feedback: { selection, review },
  });
  // Keep the original and candidate separately; run the ordinary dependency/value checks.
}
```

검토는 원래 선택의 gap을 지우거나 workflow를 승인하지 않습니다. 새 선택 응답이
기존 schema와 출처 검사를 통과해야 별도 후보가 생깁니다. 설정값이 부족하면 기존
`generateNativeNodeParameters`가 질문하며 임의 값을 채우지 않습니다. 호스트는 추가
호출의 예산·checkpoint·재개·HITL과 공개 이벤트를 소유합니다. 이 새 경로를 켜지 않은
호출에는 검토 모델 비용이 추가되지 않습니다.

로컬 실제 LangChain HTTP 전송 검사에서는 strict 검토 스키마·명시적 feedback 전송·
잘못된 참조 응답의 원문 보존·추가 재시도 없음을 확인했습니다. 별도 실제 모델의 보존된
실패 두 건 검토에서는 API 책임의 오분류를 구분했지만 남은 미지원 동작도 유지했습니다.
원문 다섯 예제의 새 독립 생성·엔진 실행이나 Qoopilot 통합 성공으로 세지 않습니다.

## 2026-10-27 미배포: 예제 호스트의 명시적 선택·검토·재선택

`createNativeSelectionPlanningGraph`는 위 독립 OSS 함수를 조합하는 예제 LangGraph다.
라이브러리 호출 안에 재시도를 숨기지 않고 `examples/`에서 명시적으로 반복한다.
호스트가 기능 목록과 `maxModelInvocations`·`maxReselections`·`deadlineMs`를 제공한다.
첫 값은 선택·검토·재선택의 논리 호출 예약 수이며 provider HTTP 재시도 수가 아니다.
기능 목록이 명시적으로 비어 있으면 선택 모델도 호출하지 않는다.

선택과 검토 사이에는 별도 checkpoint가 있다. 호출 전 예산을 예약하고 원래 선택·
검토·새 선택을 별도 이력으로 저장한다. 같은 선택이 반복되면 원래 검토를 재사용하며
다음 선택에 검증된 시도 이력을 전달한다. 원본 gap을 삭제하거나 부족한 설정을 채워
성공으로 바꾸지 않는다. 실제 미지원·업무 판단은 재선택 루프로 우회하지 않는다.

```ts
const graph = createOrchestratedWorkflowGenerationGraph({
  model,
  capabilities,
  checkpointer: new MemorySaver(),
  nativePlanning: {
    mode: 'staged',
    selectionReview: {
      policy: {
        maxModelInvocations: 3,
        maxReselections: 1,
        deadlineMs: 60_000,
      },
      observe: reportSafeProgress,
    },
  },
});
```

이 예시는 소비자가 정한 예산이며 OSS 기본값이 아니다. 같은 옵션을
`createConversationalWorkflowGenerationGraph`에도 사용할 수 있다. 옵션을 생략하면
기존 한 번 선택 경로를 유지한다. 독립 factory를 직접 사용할 때는 직렬화 가능한
`source`와 런타임 `capabilities`·`model`·`now`·checkpointer를 구분해 전달한다.
서로 다른 상태의 자식을 부모 노드에서 호출하고 checkpointer를 상속하는 구조는
[LangGraph 공식 subgraph 방식](https://docs.langchain.com/oss/javascript/langgraph/use-subgraphs)을 따른다.

예제 부모는 완료된 선택만 설정 생성과 최종 컴파일로 넘긴다. 미지원·업무 판단에서는
`NativeSelectionPlanningStoppedError`가 원래 선택과 review receipt를 보존한다.
이는 제품의 업무 질문 UI까지 구현했다는 뜻이 아니다. Qoopilot은 이 결과를 실제 업무
질문 또는 기능 부족 안내로 연결해야 하며 기술적 재계획을 사용자 승인으로 넘기지 않는다.

통신·출력 검사·observer 실패는 원본 예외를 런타임 전용 저장소에 보존하고 checkpoint에는
불투명한 실패 ID만 저장한다. 같은 런타임에서 실패 노드를 재개해도 모델을 반복하지 않는다.
런타임이 사라졌으면 원본 오류 부재로 실패하며 모델 재실행으로 복구하지 않는다.
호스트는 세션 종료 시 그래프 런타임을 해제해야 한다. 공개 진행 요약에는 원문·OAS·
모델 제안·오류 원문을 넣지 않는다.

`node integration/native-selection-planning-local-n8n.mjs`는 의도적으로 잘못된 gap을
반환하는 모델 대역과 두 예제 부모를 사용한다. 재선택 뒤 공식 Edit Fields를 격리 n8n
2.37.10에서 두 번 실행해 원래 boolean `false`를 확인했다. 업무 판단 두 조건은
workflow 없이 중단하며 엔진을 실행하지 않는다. 실제 Chomsky·업무 API 호출은 없고
원문 다섯 예제의 생성 품질이나 Qoopilot 서버/SSE/UI 검증으로 세지 않는다.

## 2026-10-27 미배포: native 출력의 원본 필드 선택

`N8nNativeFeature.ProjectNativeOutput`과
`createNativeOutputProjectionCapability({ sources })`는 실제 native JSON 생산자의
필드를 선택해 요약 객체로 전달하는 계약 어댑터입니다. 필드 선택은 공식 Edit Fields
노드의 표현식에서 실행합니다. 앞선 Code guard는 전체 원본 schema·선택 값의 존재와
item ancestry만 검사하며 요약 객체를 만들지 않습니다. 자체 필드 편집 엔진이나
임의 모델 JavaScript를 추가하지 않았습니다.

설정은 `{sourceNodeId, fields: [{name, pointer}]}`입니다. 생산자 ID와 그 생산자에
실제로 선언된 포인터 후보를 함께 제한합니다. Core가 선택한 원래 값의 타입으로
출력 schema를 만듭니다. 원본 스키마 리소스는 한 번만 포함하고 각 필드가 그 안의
원래 위치를 참조하므로 여러 필드가 같은 `$id`를 중복 선언하지 않습니다. 지역 참조,
중첩 리소스와 `$ref` 옆의 검사 규칙을 보존합니다. 출력 이름의 점은 중첩 경로로
해석하지 않습니다. `measurement`가 없으면 원래 값을 복사합니다. 위의 명시적 길이
측정 확장 외에 임의 산술·형변환·분류·페이지 반복을 제공하는 기능은 아닙니다.

한 native 생산자를 선택하며 item마다 결과 하나를 유지합니다. 여러 API의 item 결합은
기존 `JoinApiItems` 같은 명시적 선행 작업이 맡습니다. 비어 있는 입력은 비어 있는
출력이고, 선택한 값이 없으면 null·빈 문자열·임의 기본값으로 채우지 않습니다.
컴파일에는 실제 생산자의 이름·schema가 필요하며 이름을 ID에서 추정하지 않습니다.

```sh
node integration/native-output-projection-local-n8n.mjs
```

격리 n8n 2.37.10에서 두 item의 원본 문자열·숫자 0·boolean·null·배열·빈 문자열과
escaped 경로를 공식 Edit Fields로 선택해 후속 REST 호출 두 건에 전달했습니다.
빈 배열은 후속 호출 0건, 비선택 원본 필드의 계약 위반은 배열 reader에서 차단,
선택한 optional 값의 실제 부재는 projection guard에서 차단했습니다. 마지막 두 조건의
후속 호출도 0건입니다. 실제 모델·업무 API 호출은 없으며 원문 예제의 생성 성공이 아닙니다.

집중 회귀 56건은 공통 포인터·리소스·기존 API 선택·등록부·단계별 계획을 포함합니다.
현재 전체 등록 기능은 16개이며 기본 계획 목록은 명시적 선택 전용
`ComposeApiResponses`를 제외한 15개입니다. 공식 전체 노드 카탈로그로의 제품 전환과
파생 출력·페이지/배치·다섯 원문 예제의 전체 품질 평가는 아직 남습니다.

## 2026-10-27 미배포: 응답 필드 선택의 OAS별 계획 계약

기존 `ComposeApiResponses`를 선택하면 모델은 출력 속성 이름과 실제 API의 응답
포인터를 제안합니다. 명시적으로 선택하는 기존 기능이며 기본 원본 결과 수집을
대체하지 않습니다. 전체 응답을 모을 때는 기존 `GatherApiResponses`를 사용합니다.

이전 계획 스키마는 실제 API ID만 제한하고 포인터는 일반 문자열로 받았습니다.
이제 재료를 결합한 schema는 API ID와 해당 OAS의 포인터 후보를 하나의 대안으로
묶습니다. 닫힌 응답 스키마에서 다른 API의 전용 경로를 섞으면 모델 출력 검사에서
거절합니다. OAS가 허용하는 맵·배열 item·열린 응답의 동적 경로는 유지하며 유한
목록으로 제한하지 않습니다. 출력 이름은 기존의 명시적 구성이고 API 원래 필드를
변경하거나 응답에 새 필드를 만드는 동작이 아닙니다.

Core `createApiResponsePointerSelectionSchema`의 입력 타입 선언도 실제 문자열
검사에 맞게 `z.ZodType<string, string>`으로 바로잡았습니다. 캐스트나 unsafe 확장으로
우회하지 않고 Zod `safeExtend`로 기존 필드 규칙을 유지합니다. 실제 생산자만 선택한
단계별 native 설정과 LangChain의 strict JSON Schema 전송에도 같은 계약을 사용합니다.
모델의 잘못된 경로는 교체하지 않고 거절합니다.

추가 회귀에서 등록부 정의를 그대로 받은 일괄 `planNativeNodes`는 아직 ID만
제한하는 이전 스키마를 전송하는 것을 확인했습니다. 공통 재료 캡처 단계에서
API만을 요구하고 그 재료가 모두 있는 기능은 기존 binder로 실제 OAS 계약을
결합하도록 수정했습니다. 일괄 native 계획과 전체 그래프 계획도 이 경로를 사용합니다.
설정 규칙이나 SDK 실행 기능을 별도로 복제하지 않습니다.

아직 없는 native 출력을 요구하는 정의와 API가 부족한 정의는 실행 가능한 계약으로
꾸미지 않습니다. 나중에 실제 생산자가 준비되면 기존 단계별 결합 경로가 검사합니다.
실제 binder 오류는 그대로 전달하며 일반 문자열 스키마로 복구하지 않습니다.
로컬 HTTP 대역에서 실제 LangChain의 단계별 JSON Schema 전송과 일괄 tool 호출
스키마를 각각 검사했습니다. 두 경로 모두 잘못된 응답을 로컬 검사에서 거절하고
재시도·값 교체 없이 원본 API와 모델 응답을 보존합니다.

집중 회귀 46건과 그래프 회귀 4건을 통과했습니다. 전체 OSS는 1,606건 중
1,605건 통과, 기존 Ajv 특수 키 실패 1건, skip/cancel 0입니다. strict 타입·빌드·
Lint·포맷도 검사했습니다. 이 개수는 생성 품질 평가나 제품 화면 검증 건수가 아닙니다.

이 후보 검사는 원본 OAS 참조·전체 응답·실제 선택 값의 존재 검사를 대체하지
않습니다. 값·타입·배열·이름 규칙과 컴파일러 실행 로직은 수정하지 않았습니다.
공식 SDK Merge/Set의 기존 경로를 사용합니다.

```sh
node integration/api-response-field-selection-local-n8n.mjs
```

고정 합성 OAS의 격리 n8n 2.37.10에서 정상 2조건·차단 2조건·로컬 요청 18건을
확인했습니다. 문자열·배열·빈 값·숫자 0·boolean·escaped 경로를 선택해 후속 API
본문에 그대로 전달했습니다. 선택 값이 없거나 비선택 필드가 OAS를 위반하면 후속
API는 호출하지 않습니다. 최초 검증기는 n8n이 줄인 오류 message를 비교해 실패했고,
보존된 원본 stack을 확인하도록 검증기만 수정했습니다. 제품 오류를 바꾼 것은 아닙니다.

별도 원본 예제 05의 Ad OAS 6개 operation에서도 후보 배열 4개·단일 문자열 2개의
계약과 전송 스키마를 확인했습니다. 기존 승인 info 보충만 적용했고 원본 요청·응답
계약은 바꾸지 않았습니다. 이 원본 검사는 생성·실행·모델 품질 평가가 아닙니다.
파생 값 계산·원문 비교표·원문 다섯 예제 독립 생성·Qoopilot 통합·배포는 남아 있습니다.

## 공식 노드 정의와 설정 검사 재사용

### 미배포: 공식 설정 검사와 SDK 노드 생성

`validateN8nOfficialNodeConfiguration`은 선택된 정확한 공식 정의와 명시적
`schemaDirectories`에서 SDK `validateNodeConfig`를 호출합니다. 디렉터리는 같은
정의·버전으로 생성한 신뢰할 수 있는 SDK 스키마의 서버 설정입니다. 브라우저나
모델이 경로·JavaScript를 정하게 하지 않습니다. 이 함수는 파일을 생성하거나
private SDK 모듈을 import하지 않습니다.

SDK는 스키마를 못 읽어도 true를 반환하므로, 생성된 공식 설정의 `parameters`가
객체여야 한다는 공통 조건으로 먼저 읽기 여부를 확인합니다. 숫자 `17`은 이 준비
검사에서만 쓰는 부적합 입력이며 실제 워크플로우 설정으로 전달하지 않습니다.
SDK가 이를 수용하면 로딩을 확인하지 못한 오류로 종료합니다. 모든 설정 규칙을
증명하거나 임의 스키마의 진위를 보증하는 검사는 아닙니다. SDK 오류를 삼키거나
스키마가 없을 때 자체 검사로 대체하지 않습니다.

검사 범위는 동기 호출이며 이전 SDK 전역 경로를 성공·거절·오류 뒤에 복원합니다.
요청 파라미터는 원래 JSON 값을 복사해 검사하고 SDK의 parse 결과로 교체하지
않습니다. 공식 기본값을 삽입하거나 숫자/문자열을 변환하지 않습니다. 실제 필드
규칙은 SDK가 판정하며 SDK가 검사하지 않는 규칙까지 검사했다고 설명하지 않습니다.

`createN8nOfficialNode`는 같은 검사를 통과한 설정만 SDK `node()`에 전달합니다.
이름·ID·위치·파라미터는 명시적으로 받아야 하며 생성한 결과는 SDK 노드입니다.
OAS 출력 계약이나 동적 포트를 추측한 `N8nNodeFragment`를 만들지 않습니다.
모델에 전달할 완성된 설정 스키마를 추출하는 기능도 아닙니다.

```ts
import { createN8nOfficialNode } from '@openapi-flow/n8n';

const merge = createN8nOfficialNode({
  catalog,
  definitionId: 'n8n-nodes-base.merge@3.2',
  schemaDirectories,
  configuration: {
    id: 'combine-results',
    name: 'Combine results',
    position: [880, 0],
    parameters: { mode: 'append', numberInputs: 2 },
  },
});
```

공식 정의 감사는 정상 설정 6수용/오류 설정 6거절, 로딩 미확인 거절 6건, SDK
노드 생성 6건과 잘못된 설정의 생성 거절 6건을 확인합니다. 별도 엔진 검사는 이
감사 보고서의 절대 경로를 받아 원본 해시·SDK 버전·정확한 이미지 ID를 사용합니다.

```sh
node integration/official-native-metadata.mjs
node integration/official-native-node-local-n8n.mjs /absolute/path/to/report.json
```

격리 n8n 2.37.10에서 고정 합성 데이터·명시적 설정의 Manual → Set → Split Out →
Filter → Aggregate와 독립 Set → Merge를 확인했습니다. native는 다섯 정의의
여섯 인스턴스이며 시작 노드 포함 일곱 개입니다. 배열 3개 중 명시한 참 조건의
2개만 수집하고 독립 결과와 append한 최종 2개를 확인했습니다. 원래 문자열 ID·
숫자 0·음수·null·false를 보존했습니다. 실제 모델·HTTP·업무 API 호출은 0회이며
원문 다섯 예제의 생성 품질·OAS 출력 계약·Qoopilot 통합 검사는 아닙니다.

최종 집중 회귀는 37건이며 새 설정/생성 경계 회귀 6건을 포함합니다. 전체 OSS는
1,594/1,595·기존 Ajv `__proto__` 한 건·skip/cancel 0입니다. 설정 감사·격리 실행의
건수를 단위 검사 수에 더하지 않으며 공개 버전이나 제품 적용 완료로 표시하지 않습니다.

### 미배포: 공식 정의의 공통 선택 재료

`createN8nOfficialNodePlanningCatalog({ definitions, selections })`는 SDK가 소유한
`NodeTypeDescription`·`NodeProperty`를 그대로 사용합니다. `definitions`는 SDK
`loadNodeTypes`로 읽은 정의이고, `selections`는 호스트가 명시한 `nodeType`·`version`
목록입니다. 최신 버전·기본 기능 목록으로 대체하지 않으며 정확한 정의가 없거나 둘
이상이면 입력 오류로 종료합니다. 명시적 빈 목록은 빈 카탈로그입니다.

```ts
import {
  createN8nOfficialNodePlanningCatalog,
  createN8nOfficialNodeChoiceSchema,
  resolveN8nOfficialNodeChoice,
} from '@openapi-flow/n8n';

const catalog = createN8nOfficialNodePlanningCatalog({
  definitions,
  selections: [{ nodeType: 'n8n-nodes-base.merge', version: 3.2 }],
});
const choiceSchema = createN8nOfficialNodeChoiceSchema(catalog);
// Host composes this ID schema into its structured output, then resolves the selected ID.
const material = resolveN8nOfficialNodeChoice(
  catalog,
  'n8n-nodes-base.merge@3.2',
);
```

각 재료는 원본 정의, 정확한 선택, SDK의 버전 필터로 얻은 속성, 정적 포트 또는
미해석 동적 표현식을 보존합니다. 원본의 `default`는 메타데이터일 뿐 요청값으로
적용하지 않습니다. 출력 값 스키마·실행 가능 capability·OAS 검사를 만들어 넣지 않습니다.
정의 ID는 선택 순서와 독립적이며 같은 ID를 서로 다른 역할의 여러 노드가 선택할 수
있습니다. 실행 인스턴스 ID와는 다릅니다. 호출자와 버전별 재료 사이의 객체 참조도
분리하므로 조회 결과의 수정이 원본을 바꾸지 않습니다.

모델은 `choiceSchema`에서 제공된 정의 ID만 선택합니다. 이름·버전·공식 옵션을
재생성하지 않습니다. 호스트가 이유·역할을 포함한 출력 형식을 조합하며 실제 모델
호출·대화 정책은 이 함수에 없습니다. 빈 카탈로그의 선택 스키마는 어떤 ID도
허용하지 않으므로 호스트는 선택할 재료가 없는 상태를 먼저 처리해야 합니다.

공식 여섯 노드의 integration 실행기는 이제 이 공개 경로로 정의를 조회합니다.
별도 로컬 HTTP 대역에서 실제 LangChain `ChatOpenAI`와 Zod 4의 `strict` JSON Schema
전송·동일 정의의 역할별 반복 선택·외부 ID 거절을 검사했습니다. 실제 Chomsky 품질·
설정값 생성·노드 실행·동적 포트 계산·Qoopilot 제품 통합의 검증은 아닙니다.
기존 native 등록부의 계약이나 실행 노드를 이 메타데이터로 대체하지 않았습니다.

이번 집중 회귀는 기존 등록부·계획·키 대조를 포함해 31건이며 새 카탈로그/전송
검사는 그중 10건입니다. 전체 OSS는 1,588/1,589·skip/cancel 0이고 유일한 실패는
기존 Ajv `__proto__` 제약입니다. strict 타입·빌드·Lint·포맷도 확인했습니다.

### 공식 설정 스키마의 생성과 검사

공식 노드가 지원하는 실행 알고리즘과 옵션을 자체 기능으로 다시 구현하지 않습니다.
SDK의 공개 `loadNodeTypes`·`filterPropertiesForVersion`·`orchestrateGeneration`을
사용하면 배포본의 노드 정의에서 버전별 설정 검사 스키마를 생성할 수 있습니다.
노드 정의의 타입은 SDK의 `NodeTypeDescription`·`NodeProperty`가 소유합니다.
이 정보를 직접 복제한 타입이나 서비스별 실행 노드를 추가할 이유는 없습니다.

```sh
node integration/official-native-metadata.mjs
```

이 검사는 격리 n8n 2.37.10 배포본의 공식 `types/nodes.json`을 읽고 SDK 0.36.4의
공개 생성기로 새 임시 디렉터리에 설정 스키마를 만듭니다. 검증 대상은 Merge 3.2,
Filter 2.3, Edit Fields 3.5, Split Out 1, Aggregate 1, Loop Over Items 3입니다.
정확한 노드·버전 정의 하나를 요구하며 다른 버전으로 대체하지 않습니다. 생성기에는
새로 생성하고 실제 경로를 확인한 임시 폴더만 전달합니다. 프로젝트·사용자 n8n 설정은
변경하지 않으며 공식 원본의 해시와 검사 결과는 ignored 로컬 산출물에 보존합니다.

여섯 정상 설정은 수용하고 여섯 잘못된 설정은 거절했습니다. 같은 잘못된 설정도
설정 스키마가 로드되지 않았을 때 SDK `validateNodeConfig`는 `valid: true`로
반환했습니다. 따라서 결과의 true만으로 공식 설정 검사를 수행했다고 판단할 수
없습니다. 제품 적용 때도 정확한 스키마의 준비 여부를 별도로 보장해야 합니다.
이 관찰은 기존 OAS·자체 명시 설정 검사가 사라졌다는 뜻이 아닙니다.

노드 설정 규칙은 출력 데이터 계약과도 다릅니다. 확인한 공식 정의에서 Merge의
입력 포트는 설정 의존 표현식이며, 현재 설치본의 `discoverOutputSchemaForNode`는
위 여섯 노드의 값 출력 스키마를 반환하지 않았습니다. 임의의 입력 수를 넣거나
출력을 빈 객체·첫 예시의 모양으로 대체하지 않습니다. OAS 참조·원래 값 타입·
항목 연결·입력과 설정에 따른 출력 계약은 기존 OSS 검사와 분리해 유지해야 합니다.

이 검사는 공식 메타데이터·생성된 설정 검사의 재사용 근거입니다. 아직 모델용
구조화 출력 스키마 연결·Zod 4 전송·동적 포트 해석·실제 노드 실행·Qoopilot 통합은
검증하지 않았습니다. 기존 wrapper를 모두 제거하거나 모든 내장 노드를 자동 지원한
결과로 표시하지 않습니다. 남은 작업은 실행 기능 재구현보다 이 공통 정의 재사용과
OAS 데이터 흐름 검사에 우선 배정합니다.

## 미배포: 업무 키로 두 응답 배열 대조

`N8nNativeFeature.JoinApiResponseArraysByKey`와
`createApiResponseKeyJoinCapability({ materials })`는 두 OAS 응답 배열을 업무 키로
결합합니다. 모델이 키 비교 알고리즘이나 JavaScript를 만들지 않습니다. OSS는 원본
응답을 검사하고 행을 읽으며 공식 SDK로 Merge 3.2를 구성합니다. 실제 키 비교는
n8n 내장 Merge의 `Combine / Matching Fields`가 수행합니다.

```ts
const parameters = {
  left: { sourceNodeId: 'orders', pointer: '/rows', keyPointer: '/orderNo' },
  right: {
    sourceNodeId: 'reviews',
    pointer: '/entries',
    keyPointer: '/orderNo',
  },
  joinMode: 'full',
  missingKeys: 'unmatched',
};
```

각 `pointer`는 응답의 배열이고 `keyPointer`는 배열 요소 안의 RFC 6901 경로입니다.
Core의 `createResponseArrayItemValueSchema`가 원본 OAS에서 키의 값 계약을 도출합니다.
가상의 첫 응답이나 필드명 일치로 연결하지 않습니다. 입력 포트 `left`·`right`는
각각 지정한 API의 원본 응답만 읽습니다. 현재 호출의 각 입력 스트림에 도착한 응답
항목의 배열을 대조하며 서로 다른 실행 사이에 결과를 쌓지 않습니다.

출력은 일치한 경우 `{key, left, right}`, 한쪽만 남으면 `{key, left}` 또는
`{key, right}`입니다. 좌우 행 내부의 필드·값·타입을 바꾸지 않습니다. `inner`는
일치 쌍만, `full`은 양쪽 전체, `left`·`right`는 해당 쪽 전체를 유지합니다.
두 배열의 순서는 연결 기준이 아니며 중복 키는 모든 일치 조합을 만듭니다.
`fuzzyCompare: false`로 숫자 `0`과 문자열 `"0"`을 구분하고 객체·배열 키는
타입을 유지한 내용 비교를 사용합니다. 빈 배열에 대역 행을 넣지 않습니다.

키 경로가 없으면 `missingKeys: 'error'`는 오류를 내고, `'unmatched'`는 해당 행을
미일치로 처리합니다. 후자는 `joinMode`에 따라 행을 남기며 없는 `key`를 채우지
않습니다. 없는 키끼리는 결합하지 않고 `null`·`false`·빈 문자열은 실제 값으로
비교합니다. 미일치를 리뷰 미작성 같은 업무 상태로 해석하지 않습니다.

이 기능은 기존 `JoinApiItems`의 항목 이력 기반 결합과 별개이며 한 입력당 한 출력이라는
보장을 선언하지 않습니다. 기존 배치의 항목 보존 검사를 우회하지 않습니다. 페이지
수집·범위 검사·요청 크기 분할·업무별 비교 표는 이 기능의 완료 범위가 아닙니다.

```sh
node integration/api-response-key-join-local-n8n.mjs
```

고정 합성 계약·지정 계획의 n8n 2.37.10에서 네 결합 방식·역순·중복·한쪽/양쪽
빈 배열·누락/null/false 키의 정상 8조건과 누락 키·원본 응답 위반 차단 2조건을
검사했습니다. 실제 모델 품질·원문 다섯 예제 전체 생성·Qoopilot 적용은 별도입니다.
[공식 Merge 문서](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)의
키 매칭과 전체 일치 출력을 사용하며 자체 키 매칭 구현을 추가하지 않습니다.

## 미배포: 응답 맵의 키 선택과 기존 배열 반복 연결

`N8nNativeFeature.SelectApiResponseMapEntry`는 API 응답 객체에서 정확한 키 하나의
값을 골라 `{key, value}`로 반환합니다. 값 내부의 필드명·타입·배열 순서는 바꾸지
않습니다. `sourceNodeId`는 실제 API, `pointer`는 포함 객체의 RFC 6901 경로,
`key`는 사용자가 정한 실제 키입니다. 키의 `/`·`~`·숫자 문자열·빈 문자열은
경로 구분자로 해석하지 않습니다. 키가 없으면 첫 항목·다른 필드·빈 배열을 대신
선택하지 않고 오류로 종료합니다.

출력 계약은 Core의 `createResponseObjectEntrySchema`가 원본 OAS에서 도출합니다.
키가 아직 없으면 가능한 객체 값의 계약을 도출하고, 키가 정해지면 해당 키의
계약을 사용합니다. 이는 후보 projection이며 실행 시 전체 응답 검사와 실제 키
존재 검사를 대신하지 않습니다. 숫자 키를 배열 index로 오인하지 않으며 고정
속성·`patternProperties`·`additionalProperties`와 합성 계약을 유지합니다.

그룹 키를 나중에 받을 때는 `parameters`에 실제 API ID·포함 객체 경로만 넣고
`runtimeParameters: { pointers: ['/key'] }`로 기존 native 입력 슬롯을 사용합니다.
구조 참조 검사도 명시적 필드 소유권을 검사합니다. API ID·응답 포인터와 겹치는
runtime 입력이나 참조 전체의 runtime 소유권은 계속 거절합니다. 모델용 포인터
후보 스키마와 JSON으로 전송 가능한 runtime 검증 스키마는 구분하며, 원본 OAS
검사는 Core와 실행 시 응답 reader에 유지합니다. 실행되지 않는 refinement를
runtime 검증에서 몰래 버리지 않습니다.

선택한 값이 배열이면 기존 `SplitNativeOutputArray`에서 `/value`를 선택합니다.
`itemMode: 'linked'`는 n8n의 항목 연결을 보존해 중복 ID가 있는 항목도 원래 그룹과
각 후속 API 요청에 대응시킵니다. 선택 코드는 라이브러리 소유이고 모델이 JavaScript를
생성하지 않습니다. 실행은 공식 SDK Code 노드와 기존 Split Out·HTTP Request를
사용합니다. Code 노드의 연결 정보는 [n8n 공식 pairedItem 규약](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/preserving-linking-in-the-code-node.md)을 따릅니다.

```sh
node integration/api-response-map-entry-local-n8n.mjs
```

고정 합성 OAS·지정 계획에서 리터럴 키·runtime 숫자 키·빈 키의 빈 배열은 정상
실행하고, 없는 키·잘못된 비선택 응답·미입력 runtime 키는 차단합니다. 실제 모델
품질, 원문 다섯 예제의 독립 생성, Qoopilot 서버·화면 적용은 별도 검증 대상입니다.
원문 응답의 숫자·문자열을 변환하거나 그룹명을 코드에 고정하는 기능이 아닙니다.

## 2026-10-26 미배포 소스의 참조 선택 보강

API 응답을 읽는 네 material 정의는 실제 공급된 API ID만 계획 스키마에 노출합니다.
배열 분리의 source별 설정 스키마는 해당 OAS의 배열 경로와 동적 경계에서 생성합니다.
서로 다른 API의 경로를 섞거나 알려진 객체·scalar 경로를 배열로 선택하면 거절합니다.
열린 맵·배열 item·참조의 동적 경로를 유한 enum으로 잘라내지는 않습니다.

Core의 `createApiResponsePointerSelectionSchema`는 후보 스키마입니다. 전송용 정규식은
lookaround 없는 구문을 사용하고, 코드 전용 Zod refinement가 알려진 부적합 경로와
문자열 전체 일치를 검사합니다. 동적 후보는 실제 OAS의 `createResponseArrayItemSchema`
검사를 통과해야 합니다. 전송 패턴만 통과했다고 배열·존재·실행 경로가 증명되지는 않습니다.
원본 응답 전체에 대한 실행 시 검사는 계속 유지합니다.

`isSchemaProvablyEmpty`는 일부 명확한 빈 값 집합만 증명합니다. `false`는 값이 존재한다는
뜻이 아닙니다. 이 결과를 `hasProvablyEmptyParameters`로 native material에 보존하며,
구성할 값이 없다고 증명한 설정 대안은 모델 출력에서 제외합니다. 유효한 빈 배열은
불가능한 값 집합과 다르게 취급합니다. 등록 기능 자체와 원본 계약은 유지합니다.

`planNativeNodes`에서 모든 설정 대안이 불가능하고 설명 옵션도 꺼져 있으면 모델은
`{gaps}`만 반환합니다. 코드는 비어 있는 `nativeNodes`를 구성합니다. 설명 옵션이 켜져 있으면
기존 no-additions 결정만 허용합니다. 값 선택이 남아 있는 호출은 기존 출력을 유지하며,
모의 모델은 조건에 맞는 형식을 반환해야 합니다. 다른 형식을 alias로 보정하지 않습니다.
API ID로 서로 구분되는 대안은 Zod `union`으로 정의해 `anyOf`를 생성하며,
전송 이후 `oneOf`를 문자열 치환하지 않습니다.

Template의 값 검사는 현재 draft의 실제 재료로 결합한 native 계약을 사용합니다.
원래 선언은 기존 계획 receipt 검증에 계속 사용하므로, API 교체 후 옛 응답 경로를
검사에 재사용하거나 출처 지문을 조용히 바꾸지 않습니다. 기존 직렬화 기록은 새 material
필드를 추측해 채우지 않으며 호환성과 버전 적용은 별도 릴리스 검토 대상입니다.

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

미배포 소스의 기본 계획 목록에는 고정 결과 목록을 만드는 `GatherApiResponses`가
포함됩니다. 이름 기반 `ComposeApiResponses`는 기본 계획 목록에서 제외하며,
명시적으로 선택한 경우에는 기존 계약을 유지합니다. 새 기능에서 모델은 API 호출
ID만 선택하고, 코드는 출처 정보와 전체 원본 응답을 `results` 목록으로 조립합니다.
단순 분기 대기·검사는 원본 API 참조와 Merge를 사용하며 결과를 다시 구성하지 않습니다.

`features` 생략은 호환 전용 기능을 제외한 기본 계획 목록, `[]`는 선택 없음입니다. 순서·중복·extension
이름 충돌 검사는 유지하며, 제공한 잘못된 소스나 설정을 무시하지 않습니다.
추가 문맥이 없으면 기본 계획 목록 14개 기능군 중 실제 재료로 구성되는 구현은 6개이고 계획용
정의는 13개입니다. 업무 키 배열 대조·API 맵 항목 선택·API 배열 분리·API 응답 수집·고정 결과 목록·native 배열 분리·API item 합류는
나중에 실제 소스 계약을 결합합니다. `JsonOutput`은 호스트 소유 이름·설명·원본
Zod 입력 스키마가 없으면 미준비 상태로 남고 선택 가능한 정의를 만들지 않습니다.
호스트는 이 입력 계약만 등록합니다. 노드 인스턴스·설정값·소스 선택·연결은 각
계획 단계가 따로 정하므로 호스트가 완성 노드를 미리 작성할 필요는 없습니다.

## 정의와 실제 계약의 구분

소스 의존 기능은 이름·설명·구조 스키마·참조 위치·포트를 기존 구현과 공유합니다.
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

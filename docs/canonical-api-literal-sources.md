# 정본 API 입력값의 원문 근거

미배포 소스의 `generateWorkflowDraftApiCallArguments`와 `resolveWorkflowDraftApiCallArguments`에 적용하는 계약이다. OAS 타입의 `values`는 유지하고, 모델이 실제 제안한 값에만 `literalSources`를 함께 받는다. 이 근거 검사는 `includeExplanations`와 무관하다.

예를 들어 사용자가 “캐시 입력은 JSON true야.”라고 명시했다면 다음 형태를 제안할 수 있다. 해당 API의 OAS가 `enabled` Boolean 입력을 선언한 경우다.

```json
{
  "values": { "query": { "enabled": true } },
  "literalSources": [
    {
      "targetPointer": "/query/enabled",
      "messageId": "user-2",
      "sourceFormat": "json",
      "sourceText": "true"
    }
  ],
  "sourceMessageIds": ["user-2"]
}
```

`targetPointer`는 제안한 `values`의 위치다. `messageId`는 실제 제공된 현재·배경 사용자 메시지 중 하나를 선택한다. 변경 권한을 설명하는 `sourceMessageIds`는 여전히 현재 요청에서 골라야 한다. 이전 메시지의 값이 있다는 사실만으로 관련 없는 노드를 수정할 권한이 생기지 않는다.

모델에 전달하는 `literalInputSchema`도 같은 값 루트를 기준으로 한다. `values` 메타데이터 래퍼를 다시 포함하지 않는다. 출력 스키마의 경로 패턴은 현재 OAS의 실제 입력 루트에서 도출한다. `/values/query/enabled`처럼 출력 메타데이터를 포함한 경로는 wire 스키마에서도 거절하고 접두어를 자동 제거하지 않는다. 실제로 존재하는 값·소유권·원문 검사는 그 뒤 Core에서 확인한다.

## Core에서 확인하는 것

원래 OAS와 바인딩·확정 입력 소유권으로 입력 스키마를 만든다. 출력은 스키마 검증 전후 값이 같아야 한다. 이후 Core가 `literalSources`의 실제 메시지·JSON Pointer·원문 구간을 확인하고, 원문을 파싱한 값이 해당 위치의 제안과 타입까지 같은지 비교한다. 누락·중복·부모와 자식의 중복 소유·없는 메시지·없는 필드는 실패한다. 값을 지우거나 추측해 통과시키지 않는다.

`text`는 원문 문자열을 그대로 사용한다. `json`은 원문에 있는 완전한 JSON 값을 파싱한다. 문자열 `"true"`를 Boolean `true`로, 문자열 `"001"`을 숫자 `1`로 바꾸지 않는다. `12`의 일부인 `1`을 독립된 숫자 근거로 쓰지도 못한다. 이 파싱·원문 위치 검사는 기존 자연어 API 답변 추출과 같은 구현을 사용한다.

중첩 객체·배열은 전체 JSON 하위 트리 하나를 인용하거나 각 리터럴의 근거를 따로 지정한다. 비어 있는 본문 객체·배열과 빈 문자열도 실제 데이터이므로 근거가 필요하다. 값이 없는 요청 `{}`와 값이 없는 파라미터 위치 객체는 추가 API 값을 생성하지 않는다. 이 경우 `literalSources`를 생략할 수 있고 검증 결과는 빈 목록이다. 값이 하나라도 있는데 근거가 없으면 필드 위치를 포함한 오류로 즉시 실패한다.

바인딩과 사용자가 확정한 입력은 기존 소유권 검증으로 처리한다. 모델의 `values`에 다시 넣지 않으며, 그 값을 위한 가짜 원문도 요구하지 않는다. 결과의 `literalSources`에는 코드가 계산한 모든 일치 위치가 남지만 실행용 resolution과 n8n JSON에는 이 기록을 넣지 않는다. 호스트가 보관 기간과 접근 권한을 관리해야 한다.

## 보장하지 않는 것

원문에 값이 존재한다는 증거는 그 값을 해당 필드에 쓰라는 업무 의미까지 증명하지 않는다. 부정문이나 여러 값 중 어느 것을 쓸지는 모델의 선택·사용자 검토가 계속 필요하다. 위치·일치 여부는 모델 이유를 검증한 결과와도 다르다.

이 계약은 명시적인 리터럴 추출 경계다. “캐시를 켜줘”처럼 JSON Boolean 값이 없는 표현을 자동으로 `true`로 변환하는 기능은 추가하지 않았다. 필요한 값이 명시되지 않으면 모델은 생략하고, 기존 필수 입력 질문·명시적 실행 슬롯 경로로 진행한다. OAS 기본값·example·모델 설명을 사용자 원문으로 취급하지 않는다.

원래 OAS에 새 금지 필드를 정의하거나 `enabled` 같은 특정 이름을 차단한 것이 아니다. 직접 제공한 JSON·확정 입력·타입이 맞는 응답 바인딩은 원래 OAS 검사를 계속 사용한다. 다른 공개·이전 입력 생성 경로까지 이 계약을 적용했다고 주장하지 않는다.

- [입력 출력 스키마](../packages/core/src/schemas/workflow-draft-api-call-arguments-schema.ts)
- [Core 원문 검사](../packages/core/src/draft/edits/api/resolve-workflow-draft-api-literal-sources.ts)
- [공통 원문 파서](../packages/core/src/arguments/sources/read-api-input-literal-source.ts)
- [Core·전송 회귀](../test/api-literal-source-validation.test.mjs)
- [최초 실제 모델 결함 보고](canonical-short-followup-verification.md)

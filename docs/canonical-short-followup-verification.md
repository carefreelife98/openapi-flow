# 짧은 후속 요청의 실제 검증

이 문서는 최초 실패와 그때의 조사 기록을 보존한다. 이후 정본 API 입력에 [필드별 원문 근거 계약](canonical-api-literal-sources.md)을 추가했다. 실제 재검증과 현재 전체 상태는 [구현 장부](conversational-oss-implementation.md)의 최신 체크포인트를 따른다.

미배포 소스를 기준으로 전체 ICL OAS 34개 operation과 실제 Chomsky를 사용했다. API 후보를 정답 목록으로 좁히거나 모델 출력·값을 수정하지 않았다. 사람의 선택·후보 승인과 상품번호 답변은 검증 도구의 명시적인 사용자 동작이다. 실행 대상은 격리 n8n 2.37.10과 로컬 OAS 계약 서버이며 실서비스는 호출하지 않았다.

## 대화와 결과

다음 순서로 같은 `MemorySaver` 세션에서 진행했다.

1. “상품 단건 기본 정보를 조회하는 워크플로우를 만들어줘.”
2. 실제 필수 입력 질문에 “상품번호는 문자열 \"fixture-canonical-01\"이야.”라고 답변
3. 완성된 워크플로우에 “가격 조회도 추가해줘.” 요청
4. “가격 조회는 빼줘. 상품 기본 정보 조회는 그대로 유지해줘.” 요청

다음 턴은 `initialDraft`를 다시 덮어쓰지 않고 기존 그래프에 현재 revision을 지정해 전달한다.

```ts
const selection = await graph.invoke(
  {
    input: {
      request: {
        id: 'add-price',
        text: '가격 조회도 추가해줘.',
        expectedRevision: completed.draft.revision,
      },
    },
  },
  config,
);
```

이후 실제 selection·candidate 경계의 토큰으로 각각 승인했다. 기존 상품 조회 인스턴스의 ID·operation·입력값·바인딩은 유지했다. 추가된 가격 조회는 모델이 선택한 `/result/gdNo` 참조로 연결됐고, 삭제 요청은 가격 노드와 그 연결만 제거했다. 응답 참조는 이 실행에서 선택된 설계이며 짧은 문장이 언제나 같은 설계를 뜻한다는 보장은 아니다.

## 통과한 범위

VPN 연결 후 단일 API의 자연어 답변 경로를 재시도해 Chomsky 4회와 격리 n8n 실행 1회가 통과했다. 실행 폴더는 `.local-artifacts/canonical-input-reply/1792341688598-69498/`다.

첫 멀티턴 실행은 Chomsky 10회와 n8n 실행 3회가 통과했다. 최초 생성·가격 추가·가격 삭제의 로컬 HTTP 요청 수는 각각 1·2·1회였다. 원본 상품 조회 객체를 매번 비교했고 불필요한 상품번호 재질문은 없었다. 산출물은 `.local-artifacts/canonical-input-reply/1792341869385-69939/`에 있다.

이 실행은 최초 요청과 응답의 상품번호가 같았다. 따라서 참조와 연결 구조를 검사했어도, 관측된 값만으로는 응답을 읽은 것과 최초 값을 복사한 것을 구분할 수 없었다.

## 강화 검사에서 확인한 결함

계약 서버의 상품 조회 응답에 최초 입력과 다른 문자열 `fixture-response-02`를 명시했다. 원래 OAS의 응답 스키마로 검증한 합성 데이터이며, 제품 코드가 사용자 값이나 응답 의미를 변환한 것이 아니다. 이 실행에서 가격 요청은 실제로 응답의 문자열을 보냈다.

그러나 모델이 가격 API의 선택 입력 `enableCache: true`도 추가했다. 사용자는 캐시를 지정하지 않았다. 모델의 입력 제안과 근거는 다음 형태였다.

```json
{
  "values": { "query": { "enableCache": true } },
  "sourceMessageIds": ["add-price"]
}
```

인용된 원문은 “가격 조회도 추가해줘.”였다. OAS에 이 Boolean 필드와 기본값이 있다는 사실은 사용자가 그 값을 제공했다는 뜻이 아니다. 스키마가 값을 자동 주입한 것도 아니다. 저장된 모델 제안에 이미 `true`가 있었으며 검증 전후 값은 같았다.

[입력 출력 스키마](../packages/core/src/schemas/workflow-draft-api-call-arguments-schema.ts)는 OAS 타입의 `values`와 메시지 근거를 받는다. [입력 적용](../packages/core/src/draft/edits/api/resolve-workflow-draft-api-call-arguments.ts)은 변환 없는 검증·확정 입력 적용·필수값 누락을 검사한다. [근거 해석](../packages/core/src/draft/edits/references/resolve-workflow-draft-source-evidence.ts)은 실제 메시지와 소스 계약의 존재를 확인하지만, 각 리터럴이 그 원문에 있는지는 확인하지 않는다. 현재 프롬프트의 기본값 생성 금지를 결정적으로 강제하지 못하는 틈이다.

실패 산출물은 `.local-artifacts/canonical-input-reply/1792342037323-70763/`에 보존했다. Chomsky 10회 뒤 로컬 가격 요청에 응답 상품번호와 추가 캐시 값이 함께 관측됐다. 최초 워크플로우 실행은 완료했지만 추가 워크플로우 실행이 실패했고, 삭제된 결과의 실행까지 통과한 것으로 세지 않는다.

그때 계약 서버는 URL query를 문자열로 읽은 뒤 Boolean 값을 OAS 값 검사에 직접 전달해 오류를 냈다. 이것을 유효한 OAS 자체의 결함이나 n8n의 Boolean 직렬화 오류로 해석하면 안 된다. 이 시나리오는 사용자가 제공하지 않은 추가 입력 자체도 허용하지 않는다. 검증 도구는 이제 예상한 문자열 입력과 실제 wire 입력을 먼저 비교하고 나서 OAS를 검사한다. 일반 HTTP Boolean·배열 역직렬화 서버를 구현한 것은 아니다. 원래 실패 기록은 수정하지 않았다.

## 남은 수정

API 입력 생성에서도 필드별 원문 근거를 검사해야 한다. 이미 자연어 질문 답변에 사용하는 [원문 선택·파싱 경계](../packages/core/src/arguments/clarification/extraction/resolve-api-input-answer-sources.ts)를 재사용할 수 있는지 검토하고, 값의 소유권을 Core에서 확인하는 계약을 마련해야 한다. 단순히 프롬프트를 더 쓰거나 `enableCache`만 금지·삭제하는 방식으로 처리하지 않았다. 이 작업에서는 제품 코드의 해결을 완료하지 않았다.

각 실행의 성공·실패는 별도 결과다. 더 강한 검사의 실패를 앞선 성공으로 덮지 않으며, 알려진 한 서비스의 사례를 일반 품질 성공률로 환산하지 않는다. 기존 Ajv 특수 키 회귀와 전체 목표의 다른 미완료 항목도 남아 있다.

- [기본 실행·계약 서버 도구](../integration/canonical-input-reply-local-n8n.mjs)
- [짧은 추가·삭제 시나리오](../integration/scenarios/verify-canonical-price-followups.mjs)
- [자연어 입력 답변 계약](canonical-natural-input-replies.md)
- [전체 구현 장부](conversational-oss-implementation.md)

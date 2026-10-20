# 필수 입력 답변의 원문 추출과 검증

현재 소스의 미배포 기능이며 npm 0.2.0에는 포함되지 않습니다. 짧은 요청에서 빠진 API 입력을 사용자에게 물은 뒤 자연어 답변을 읽는 단계입니다. API 선택, 기존 계획 수정, native 설정 생성은 이 함수의 책임이 아닙니다.

설명을 요청하면 같은 모델 호출의 프롬프트와 두 `reason` 필드의 설명에서 사용자 언어를 따르도록 지정합니다. 기술 식별자·원문 값은 번역하지 않으며, 반환된 이유를 코드가 번역하거나 보정하지 않습니다. 언어 일관성은 모델의 생성 품질이고 원문 위치·값·타입·OAS 검사는 코드의 책임입니다. 별도 설명 생성 호출은 없습니다.

```ts
const pending = inspectApiArgumentRequirements({
  operation,
  callId: 'read-item',
  values: {},
  bindings: [],
});

const analysis = await analyzeApiInputAnswers({
  requirements: pending.requirements,
  reply: '상품번호는 문자열 "2"로 지정해줘.',
  model,
  includeExplanations: true,
});
```

## 모델과 코드의 책임

Core가 `describeApiInputSources(reply)`로 완전한 JSON 값 후보와 따옴표 밖 텍스트의 경계 ID를 만듭니다. 모델은 질문 ID와 그 원문 후보 ID만 선택합니다. 위 답변의 모델 출력은 다음 형태입니다. ID는 제공된 실제 목록에서 선택합니다.

```json
{
  "answers": [
    {
      "requirementId": "<제공된 질문 ID>",
      "source": {
        "kind": "json",
        "candidateId": "<제공된 JSON 후보 ID>"
      },
      "reason": "사용자가 상품번호를 문자열로 명시했습니다."
    }
  ],
  "reason": "질문한 상품번호가 이번 답변에 명시되어 있습니다."
}
```

모델은 `value`, `sourceText`, `sourceFormat`, 누락 목록, OAS 사본, 위치 정보, 검증 성공 여부를 생성하지 않습니다. `createApiInputSourceSelectionSchema`가 원문에서 만든 ID만 허용합니다. `resolveApiInputSourceSelections`는 최초 원문에서 목록을 다시 만들고 선택한 ID를 실제 구간으로 해석합니다. 이후 기존 원문·OAS 검사를 수행합니다. 모델이 값을 다시 작성하거나 따옴표를 제거할 단계가 없습니다.

`kind: json`은 완전한 JSON 리터럴의 후보 ID를 선택합니다. 코드가 원래 따옴표까지 읽으므로 `"2"`는 문자열 `2`가 되고, 숫자 `2`의 후보를 선택하면 숫자가 됩니다. `kind: text`는 한 텍스트 구간의 `startTokenId`와 `endTokenId`를 선택합니다. 끝 토큰까지 포함해 원문을 그대로 복사하며 공백도 유지합니다. 따옴표 내부는 텍스트 토큰으로 제공하지 않습니다. 숫자처럼 보이는 인용되지 않은 문자열은 전체 숫자 토큰을 `text`로 선택할 수 있습니다. OAS 타입을 보고 표현을 자동 선택하거나 변환하지 않습니다.

Core는 `"2"` 내부의 `2`, `123`의 뒷부분 `23`을 독립 경계로 제공하지 않습니다. 따옴표를 건너뛴 텍스트 범위, 역순·알 수 없는 ID도 거절합니다. Microsoft의 `jsonc-parser@3.3.1` scanner로 리터럴 경계를 확인하고 `parseTree`에서 문법 오류가 없는 완전한 JSON만 후보로 채택합니다. 오류 복구 결과는 채택하지 않습니다. 최종 값은 strict `JSON.parse`와 원래 OAS 검사를 통과해야 합니다. 객체·배열도 완전한 원문 후보가 필요하며 자연어를 객체로 추측하지 않습니다.

경계 스키마는 형식 검사에만 사용합니다. 값이나 OAS 메타데이터를 Zod의 재구성 결과로 대체하지 않으므로 `__proto__` 같은 자체 속성도 원문에서 파싱한 형태로 보존합니다. 이는 알려진 Ajv의 해당 속성 검증 문제를 해결하거나 스키마를 바꾸는 작업이 아닙니다. JavaScript에서 유한한 숫자로 표현할 수 없는 JSON 숫자는 변환하지 않고 실패합니다.

## 반환값과 근거

`analysis.answers`는 기존 `ApiInputAnswer[]` 형태의 값입니다. 답하지 않은 질문 ID는 코드가 계산한 `unansweredRequirementIds`에 남습니다. `extractApiInputAnswers`는 같은 결과의 답변 배열만 반환하는 간편 함수이며 설명을 요청하지 않습니다.

설명을 켜면 같은 호출의 짧은 전체 이유와 답변별 이유를 `analysis.extraction.decision`에 저장합니다. 이 기록의 `sourceFormat`·`sourceText`는 모델이 복사한 문자열이 아니라 선택한 ID에서 코드가 해석한 구간입니다. `evidence`는 호출 전에 복사한 실제 답변·질문·OAS 입력 계약이고, `verification`은 코드가 파싱한 값과 모든 유효한 일치 위치입니다. 위치는 JavaScript UTF-16 기준 `offset`, `length`입니다. 동일한 구간이 여러 번 있으면 유효한 위치를 모두 보존합니다.

`validateApiInputAnswerExtractionRecord({ reply, requirements, record })`는 별도로 제공한 최초 자료에서 결과를 다시 계산합니다. 원문·계약·값·누락 목록·위치를 바꾼 기록을 거절합니다. 저장할 때도 최초 자료를 함께 관리해야 합니다. 이 검사는 인용문의 존재와 OAS 적합성을 확인할 뿐, 사용자의 의도나 모델 이유의 의미적 정확성을 증명하지 않습니다. 서명·접근 제어도 제공하지 않습니다.

질문이 없거나 답변이 정확히 빈 문자열이면 모델을 호출하지 않습니다. 상태는 각각 `no-pending-inputs`, `empty-reply`이고 가짜 모델 이유를 만들지 않습니다. 닫히지 않은 따옴표처럼 사용 가능한 원문 후보 자체가 없으면 모델 호출 없이 빈 `extracted` 결과와 미답변 ID를 반환합니다. 공백 문자열은 trim하지 않습니다. 제공된 모델·옵션·필수 계약이 잘못되면 실패합니다. 중복·알 수 없는 질문 ID, 존재하지 않는 구간, 잘못된 JSON, OAS 위반에도 출력 보정이나 숨은 재시도는 없습니다.

## 공식 LangGraph 예시

정본 초안용 `createWorkflowDraftConversationGraph`도 `reply-inputs`로 자연어 API 값 답변을 받습니다. 별도 추출 체크포인트와 원문 선택 재검사를 사용하며 [정본 대화 가이드](canonical-natural-input-replies.md)에 적용 범위와 기록을 설명합니다. 공통 `analysis.sources`는 설명 옵션과 관계없이 반환되고, 짧은 모델 이유와 확장 기록만 옵션으로 받습니다.

`createConversationalWorkflowGenerationGraph`에 `answerOptions: { includeExplanations: true }`를 지정하면 `applyRequestAnswers`가 기록을 `state.apiInputAnswerExtractions`에 누적합니다. 값이 없는 답변과 일부 입력만 답한 턴도 보존합니다. 이후 구조화된 값을 직접 제출하면 추출 모델을 호출하거나 그 값에 모델의 이유를 붙이지 않습니다. `interrupt`와 추출 노드는 분리되어 재개 시 앞선 추출을 반복하지 않습니다.

기록은 이후 그래프 계획이나 n8n 실행 JSON에 섞지 않습니다. 원문에 민감한 값이 포함될 수 있으므로 호스트가 보관 기간·표시·접근 권한을 정해야 합니다. 적용할 때는 기존 `validateApiInputAnswers`로 현재 operation snapshot도 확인합니다. 추출 함수에 전체 OAS 문서를 제공한 것은 아니므로, 전달받은 질문이 최신 문서에서 만들어졌다는 사실까지 인증한다고 표시하지 않습니다.

`createApiInputAnswersSchema`는 해석이 끝난 `{ requirementId, value }`를 검사하는 OAS 기반 스키마입니다. 모델의 원문 선택 스키마와 구분하며, 이전 미배포 구현의 중복 `value`·`sourceText` 출력 형식은 제거했습니다. 기존 배열 반환 함수의 외부 결과 형식은 유지했습니다.

## 검증 경로

- [Core·어댑터 회귀](../test/api-input-answer-extraction.test.mjs)
- [코드 소유 원문 후보·경계 검사](../test/api-input-source-selection.test.mjs)
- [실제 LangChain 전송 검사](../test/api-input-answer-extraction-http.test.mjs)
- [LangGraph 재개·기록 보존 검사](../test/api-input-answer-extraction-host.test.mjs)
- [원본 OAS 회귀](../integration/real-oas.mjs)
- [Chomsky·ICL 계약·격리 n8n 실행 도구](../integration/api-input-answer-extraction-local-n8n.mjs)

마지막 도구는 실제 ICL API를 호출하지 않습니다. API 선택은 고정한 ICL 원본 operation을 사용하고 모델은 답변 구간만 선택합니다. 로컬 계약 서버와 테스트용 Bearer credential로 n8n 요청을 검증합니다. 이 결과를 전체 워크플로우 생성 품질이나 실제 ICL 업무 로직의 성공률로 확대 해석하지 않습니다.

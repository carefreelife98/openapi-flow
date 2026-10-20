import { apiResponseSourcesFixture } from './workflow-draft-api-response-sources-fixture.mjs';

export async function reviewSuggestionsFixture(options) {
  const fixture = await apiResponseSourcesFixture({ withNative: false });
  const input = {
    context: fixture.context,
    boundary: {
      key: 'actual-review-state',
      kind: 'planning-questions',
      revision: 0,
      questions: [
        {
          id: 'owner-question',
          message:
            '주소 조회의 owner는 accountId와 email 중 무엇을 사용할까요?',
        },
      ],
      data: {
        selectedPaths: ['/seed/{seedId}', '/addresses'],
        actualResponseFields: ['accountId', 'email'],
      },
    },
    limits: { maxSuggestions: 3 },
    ...(options === undefined ? {} : { options }),
  };
  const proposal = {
    suggestions: [
      {
        kind: 'answer-question',
        questionIds: ['owner-question'],
        text: '주소 조회의 owner에는 원본 회원 조회 응답의 accountId를 사용해줘.',
        sources: [{ kind: 'review-question', questionId: 'owner-question' }],
        ...(options?.includeExplanations === false
          ? {}
          : {
              reason:
                '응답에서 사용할 실제 식별자를 사용자가 명시적으로 확정합니다.',
            }),
      },
    ],
  };
  return { ...input, proposal, fixture };
}

export function reviewSuggestionModel(output, during) {
  const calls = [];
  return {
    calls,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push({
            schema,
            options,
            messages,
            payload: JSON.parse(messages[1].content),
          });
          await during?.();
          if (output instanceof Error) throw output;
          return output;
        },
      };
    },
  };
}

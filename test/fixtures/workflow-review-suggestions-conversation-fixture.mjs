import { draftClarificationModel } from './workflow-draft-clarification-fixture.mjs';

export const ownerFollowUp =
  '주소 조회의 owner에는 원본 회원 조회 응답의 accountId를 사용해줘.';
export function reviewSuggestionsConversationModel() {
  const calls = [];
  const original = draftClarificationModel();
  return {
    calls,
    withStructuredOutput(schema, options) {
      const delegate =
        options.name === 'suggest_workflow_review_follow_ups'
          ? undefined
          : original.withStructuredOutput(schema, options);
      return {
        async invoke(messages) {
          const payload = JSON.parse(messages[1].content);
          calls.push({ schema, options, payload });
          const adoption = payload.messages
            .filter((message) =>
              message.text.startsWith(
                '{"kind":"user-adopted-workflow-review-suggestion"',
              ),
            )
            .map((message) => JSON.parse(message.text))
            .at(-1);
          if (options.name === 'suggest_workflow_review_follow_ups') {
            const question = payload.boundary.questions.find((item) =>
              item.id.startsWith('api-call-binding-question:'),
            );
            const reason = payload.options.includeExplanations
              ? {
                  reason:
                    'The user must explicitly confirm the unresolved source or related scope.',
                }
              : {};
            if (question)
              return {
                suggestions: [
                  {
                    kind: 'answer-question',
                    questionIds: [question.id],
                    text: '주소 조회의 owner에는 원본 회원 조회 응답의 email을 사용해줘.',
                    sources: [
                      { kind: 'review-question', questionId: question.id },
                    ],
                    ...reason,
                  },
                  {
                    kind: 'answer-question',
                    questionIds: [question.id],
                    text: ownerFollowUp,
                    sources: [
                      { kind: 'review-question', questionId: question.id },
                    ],
                    ...reason,
                  },
                ],
              };
            const profile = payload.candidates.find(
              (candidate) => candidate.path === '/profiles/{personId}',
            );
            if (
              payload.options.includeExtensions &&
              profile &&
              payload.boundary.kind !== 'requirements-clarification'
            )
              return {
                suggestions: [
                  {
                    kind: 'extend-workflow',
                    text: '프로필 조회도 추가해줘.',
                    sources: [
                      { kind: 'oas', candidateId: profile.candidateId },
                    ],
                    ...reason,
                  },
                ],
              };
            return { suggestions: [] };
          }
          if (options.name === 'clarify_workflow_requirements' && adoption)
            return {
              statements: [
                {
                  text: 'seed 문자열로 원본 회원을 조회하고, 그 응답 accountId를 주소 조회 owner에 사용한다.',
                  sources: payload.messages.map((message) => ({
                    kind: 'message',
                    messageId: message.id,
                  })),
                },
              ],
              categories: [],
            };
          if (
            options.name === 'plan_draft_api_call_bindings' &&
            payload.operation.path === '/addresses' &&
            !adoption
          )
            return {
              decision: {
                status: 'needs-clarification',
                mappings: [],
                questions: [
                  {
                    kind: 'choose-source',
                    targetPointer: '/query/owner',
                    candidates: ['/email', '/accountId'].map(
                      (sourcePointer) => ({
                        sourceNodeId: payload.sourceCandidates.find(
                          (source) =>
                            source.kind === 'api' &&
                            source.operation.path === '/seed/{seedId}',
                        ).nodeId,
                        sourcePointer,
                      }),
                    ),
                  },
                ],
                sourceMessageIds: [payload.messages[0].id],
              },
            };
          if (
            options.name === 'plan_draft_api_call_bindings' &&
            payload.operation.path === '/addresses' &&
            adoption &&
            adoption.adoptedText !== ownerFollowUp
          )
            throw new Error(
              'This explicit fixture scenario requires the second, accountId alternative; no implicit first-choice mapping',
            );
          return delegate.invoke(messages);
        },
      };
    },
  };
}

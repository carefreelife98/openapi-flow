import { draftClarificationModel } from './workflow-draft-clarification-fixture.mjs';

/** A declared deterministic test oracle, not production inference or response repair. */
export function clarificationAnswerRevisionModel() {
  const original = draftClarificationModel();
  const calls = [];
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
          if (options.name === 'suggest_workflow_review_follow_ups')
            return { suggestions: [] };
          const rootOnly = payload.clarification?.facts.some(
            (fact) =>
              fact.sources.some(
                (source) => source.kind === 'clarification-answer',
              ) && fact.text.includes('원본 조회만'),
          );
          if (options.name === 'analyze_workflow_draft_edit' && rootOnly) {
            return {
              decisions: [
                {
                  kind: 'add-api-call',
                  operation: payload.candidates.find(
                    (candidate) =>
                      candidate.operation.path === '/seed/{seedId}',
                  ).candidateId,
                  instruction:
                    'Use the explicitly supplied seedId string seed. Only the original lookup is currently requested.',
                  sources: [
                    {
                      kind: 'message',
                      messageId: payload.requestMessageIds[0],
                    },
                  ],
                },
              ],
            };
          }
          if (options.name === 'plan_draft_connection_edit' && rootOnly)
            return {
              decisions: [
                {
                  kind: 'keep-connections',
                  sources: [
                    { kind: 'message', messageId: payload.messages[0].id },
                  ],
                },
              ],
            };
          if (
            options.name === 'scope_workflow_draft_clarification' &&
            payload.requirements.some(
              (requirement) =>
                requirement.state === 'confirmed' &&
                requirement.text.includes('원본 조회만'),
            )
          )
            return {
              scopes: Object.fromEntries(
                payload.requirements.map((requirement) => [
                  requirement.id,
                  { scope: { kind: 'workflow' } },
                ]),
              ),
            };
          return delegate.invoke(messages);
        },
      };
    },
  };
}

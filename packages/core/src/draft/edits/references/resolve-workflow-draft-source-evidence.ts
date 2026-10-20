import type {
  ResolveWorkflowDraftSourceEvidenceInput,
  ResolvedWorkflowDraftSourceEvidence,
} from '../../../types/workflow-draft-source-evidence.js';
import type {
  WorkflowMessageEvidence,
  WorkflowPlanningEvidence,
} from '../../../types/planning-evidence.js';
import { validateWorkflowPlanningEvidence } from '../../../planning/evidence/validate-workflow-planning-evidence.js';

/** No quote/pointer repair: canonical evidence is constructed from explicitly selected actual IDs. */
export function resolveWorkflowDraftSourceEvidence(
  input: ResolveWorkflowDraftSourceEvidenceInput,
): ResolvedWorkflowDraftSourceEvidence {
  const { decision, description } = input;
  const messageEvidence = (id: string): WorkflowMessageEvidence => {
    const message = description.messages.find((message) => message.id === id);
    if (!message)
      throw new Error(
        `Draft source evidence cites unavailable current message ${id}`,
      );
    return { kind: 'message', messageId: message.id, quote: message.text };
  };
  const sources = decision.sourceMessageIds.map(messageEvidence);
  const explanation =
    decision.explanation === undefined
      ? undefined
      : {
          reason: decision.explanation.reason,
          evidence: decision.explanation.evidence.map(
            (item): WorkflowPlanningEvidence => {
              if (item.kind === 'message')
                return messageEvidence(item.messageId);
              const source = [
                ...description.sources.values,
                ...description.sources.exclusiveOutputs,
              ].find((source) => source.nodeId === item.nodeId);
              if (!source)
                throw new Error(
                  `Draft source evidence cites unavailable source contract ${item.nodeId}`,
                );
              return source.kind === 'api'
                ? {
                    kind: 'oas',
                    operation: structuredClone(source.operation.key),
                    pointer: '',
                  }
                : { kind: 'native', capability: source.node.capability };
            },
          ),
        };
  // Multiple actual instances may cite one original contract; canonical contract facts are unique.
  if (explanation)
    explanation.evidence = [
      ...new Map(
        explanation.evidence.map((item) => [JSON.stringify(item), item]),
      ).values(),
    ];
  const operations = [
    ...new Map(
      description.sources.values.flatMap((source) =>
        source.kind === 'api'
          ? [[JSON.stringify(source.operation.key), source.operation] as const]
          : [],
      ),
    ).values(),
  ];
  const context = {
    messages: description.messages,
    operations,
    capabilities: input.capabilities,
  };
  validateWorkflowPlanningEvidence({ context, evidence: sources });
  if (explanation)
    validateWorkflowPlanningEvidence({
      context,
      evidence: explanation.evidence,
    });
  return { sources, ...(explanation === undefined ? {} : { explanation }) };
}

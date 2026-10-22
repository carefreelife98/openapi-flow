import { z } from 'zod';
import type {
  ResolvedWorkflowDraftEditOptions,
  WorkflowDraftEditProposal,
  WorkflowDraftEditSchemaSources,
} from '../types/workflow-draft-edit.js';
import type { WorkflowDecisionExplanation } from '../types/workflow-clarification.js';
import { workflowDraftClarificationPlanningStageSchema } from './workflow-draft-clarification-planning-stage-schema.js';
import { createWorkflowDraftCapabilityGapFindingSchema } from './workflow-draft-capability-gap-schema.js';

/** Identical decision vocabulary, specialized to canonical or model candidate references. */
export function createWorkflowDraftEditProposalSchema<Operation, Evidence>(
  options: ResolvedWorkflowDraftEditOptions,
  sources: WorkflowDraftEditSchemaSources<Operation, Evidence>,
): z.ZodType<WorkflowDraftEditProposal<Operation, Evidence>> {
  const explanation: z.ZodType<WorkflowDecisionExplanation<Evidence>> =
    z.strictObject({
      reason: z
        .string()
        .min(1)
        .describe(
          "A short user-facing reason in the current user's language, not chain-of-thought. Do not translate identifiers, literal values or source quotations.",
        ),
      evidence: z.array(sources.evidenceSchema).min(1),
    });
  const fields = {
    instruction: z
      .string()
      .min(1)
      .describe(
        'The specific requested change or distinct role of an added instance. Do not invent literal values, bindings, settings or connections here.',
      ),
    sources: z
      .array(sources.messageSchema)
      .min(1)
      .describe(
        'Provenance from current edit-request messages using the supplied evidence contract, not old requirements that were already accepted.',
      ),
    ...(options.includeExplanations
      ? {
          explanation,
        }
      : {}),
  };
  const ids = [
    ...sources.apiNodeIds,
    ...sources.nativeNodeIds,
    ...(sources.gapNodeIds === undefined ? [] : sources.gapNodeIds),
  ];
  const scope = z.union([
    z.strictObject({ kind: z.literal('workflow') }),
    ...(ids.length
      ? [
          z.strictObject({
            kind: z.literal('nodes'),
            nodeIds: z.array(z.enum(ids)).min(1),
          }),
        ]
      : []),
  ]);
  const decisions: z.ZodType[] = [
    z.strictObject({
      kind: z.literal('report-capability-gap'),
      finding: createWorkflowDraftCapabilityGapFindingSchema(
        sources.operationSchema,
      ).describe(
        'An explicitly requested role that supplied OAS/native contracts cannot fulfill. This creates a structural unresolved node, not an API, schema, fabricated response or permission to substitute another task.',
      ),
      ...fields,
    }),
    z.strictObject({
      kind: z.literal('needs-clarification'),
      owner: z
        .union([
          z
            .strictObject({ kind: z.literal('semantic'), scope })
            .describe(
              'A consequential unresolved meaning/selection choice not owned by a selected planning step. Only this owner creates a new blocking semantic requirement.',
            ),
          z
            .strictObject({
              kind: z.literal('planning-step'),
              stage: workflowDraftClarificationPlanningStageSchema.describe(
                'The exact question-owning stage of the referenced decision: API literals use api-arguments; replacement requirement fields use requirements. Do not replay input questions as connection questions.',
              ),
              decisionIndex: z
                .number()
                .int()
                .min(0)
                .max(Number.MAX_SAFE_INTEGER)
                .describe(
                  'Zero-based position of the actual value, requirement or connection planning decision in this same decisions array. Not a node ID or another clarification.',
                ),
            })
            .describe(
              'The identified planning step owns this concern and its typed questions; do not also create a semantic/workflow blocker for it.',
            ),
        ])
        .describe(
          'Declare the real question owner. API inputs, native settings, connection details and typed requirement replacement fields belong to their selected planning decision, not a generic semantic blocker.',
        ),
      ...fields,
    }),
  ];
  if (sources.operationSchema) {
    decisions.push(
      z.strictObject({
        kind: z.literal('add-api-call'),
        operation: sources.operationSchema,
        ...fields,
      }),
    );
    if (sources.apiNodeIds.length)
      decisions.push(
        z.strictObject({
          kind: z.literal('replace-api-operation'),
          nodeId: z.enum(sources.apiNodeIds),
          operation: sources.operationSchema,
          ...fields,
        }),
      );
  }
  if (sources.capabilityNames.length)
    decisions.push(
      z.strictObject({
        kind: z.literal('add-native-node'),
        capability: z.enum(sources.capabilityNames),
        ...fields,
      }),
    );
  if (sources.apiNodeIds.length)
    for (const kind of ['revise-api-inputs', 'revise-api-bindings'] as const)
      decisions.push(
        z.strictObject({
          kind: z.literal(kind),
          nodeId: z.enum(sources.apiNodeIds),
          ...fields,
        }),
      );
  if (sources.nativeNodeIds.length)
    decisions.push(
      z.strictObject({
        kind: z.literal('revise-native-node'),
        nodeId: z.enum(sources.nativeNodeIds),
        ...fields,
      }),
    );
  if (ids.length)
    decisions.push(
      z
        .strictObject({
          kind: z.literal('remove-node'),
          nodeId: z.enum(ids),
          ...fields,
        })
        .describe(
          'Explicitly withdraw this existing instance. Code records and removes its incident control edges; other nodes and replacement routes require separate justified decisions.',
        ),
      z.strictObject({
        kind: z.literal('revise-connections'),
        nodeIds: z.array(z.enum(ids)).min(1),
        ...fields,
      }),
    );
  if (sources.requirementIds.length)
    for (const kind of ['revise-requirement', 'remove-requirement'] as const)
      decisions.push(
        z
          .strictObject({
            kind: z.literal(kind),
            requirementId: z.enum(sources.requirementIds),
            ...fields,
          })
          .describe(
            kind === 'revise-requirement'
              ? 'An explicit request to edit the existing requirement record itself: its stored statement, state or scope; not a request to change workflow behavior. API/native node, input, source and connection changes use their own decisions and do not require this bookkeeping edit. A later typed human answer supplies replacement fields.'
              : 'An explicit request to withdraw this existing requirement record itself, not its API/native nodes or connections. Do not infer record withdrawal from workflow behavior changes.',
          ),
      );
  if (sources.removedRequirementIds.length)
    decisions.push(
      z.strictObject({
        kind: z.literal('restore-requirement'),
        requirementId: z
          .enum(sources.removedRequirementIds)
          .describe(
            'A currently removed requirement explicitly requested for restoration. Historical text/state/scope are reference only; a separate typed human answer supplies replacement fields.',
          ),
        ...fields,
      }),
    );
  // Conditional field omission loses generic inference in Zod's object output;
  // this boundary names the same runtime-validated decision contract.
  return z.strictObject({
    decisions: z.union([
      z
        .array(z.strictObject({ kind: z.literal('no-change'), ...fields }))
        .length(1)
        .describe(
          'Exactly one no-change decision for the entire request; never combine it with edits or concerns about selected work.',
        ),
      z
        .array(z.union(decisions))
        .min(1)
        .describe(
          'Actual edits and explicitly owned concerns. Unchanged sibling nodes are preserved by code; do not append a no-change decision for them.',
        ),
    ]),
  }) as z.ZodType<WorkflowDraftEditProposal<Operation, Evidence>>;
}

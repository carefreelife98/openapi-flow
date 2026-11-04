import { workflowConnectionRegionSchema } from './workflow-connection-region-schema.js';
import { z } from 'zod';
import { workflowConnectionEvidenceReferenceSchema } from './workflow-connection-evidence-schema.js';
import { workflowConnectionMaterialRepairRequestSchema } from './workflow-connection-material-repair-request-schema.js';
import {
  planningEvidenceTextSchema as text,
  workflowMessageEvidenceSchema,
} from './planning-evidence-schema.js';
import {
  draftRevisionSchema,
  workflowDraftEdgeSchema,
  workflowDraftNativeNodeSchema,
} from './workflow-draft-schema.js';

const factIds = z.array(text).min(1);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const workflowConnectionNativeMaterialsSchema = z.strictObject({
  additionalNativeNodes: z.array(workflowDraftNativeNodeSchema).min(1),
});
export const workflowConnectionStepExpectationSchema = z.strictObject({
  sessionId: z.uuid(),
  sourceFingerprint: fingerprintSchema,
  revision: draftRevisionSchema,
});
export const connectionRequirementFactsSchema = z
  .array(
    z.strictObject({
      id: text,
      text,
      sources: z
        .array(
          z.union([
            workflowMessageEvidenceSchema,
            z.strictObject({
              kind: z.literal('clarification-answer'),
              roundId: text,
              questionId: text,
            }),
          ]),
        )
        .min(1),
    }),
  )
  .min(1);
const goalBasis = { factIds, reason: text };
export const workflowConnectionMaterialShapeGoalSchema = z.strictObject({
  kind: z.literal('material-shape'),
  nodeId: text,
  materialKind: z.enum(['api-operation', 'api-arguments', 'native-material']),
  pointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)?$/u),
  container: z.enum(['array', 'object']),
  size: z.int().nonnegative(),
  ...goalBasis,
});
export const workflowConnectionMaterialValueGoalSchema = z.strictObject({
  kind: z.literal('material-value'),
  nodeId: text,
  materialKind: z.enum(['api-operation', 'api-arguments', 'native-material']),
  pointer: z.string().regex(/^(?:\/(?:[^~]|~[01])*)?$/u),
  expected: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ...goalBasis,
});
export const workflowConnectionOperationSetGoalSchema = z.strictObject({
  kind: z.literal('operation-set'),
  nodeIds: z.array(text),
  ...goalBasis,
});
export const workflowConnectionUnsupportedGoalSchema = z.strictObject({
  kind: z.literal('unsupported'),
  limitation: z.enum(['implementation', 'material', 'verification']),
  nodeIds: z.array(text).min(1),
  ...goalBasis,
});
export const workflowConnectionGoalProposalSchema = z.discriminatedUnion(
  'kind',
  [
    workflowConnectionMaterialShapeGoalSchema,
    workflowConnectionMaterialValueGoalSchema,
    workflowConnectionOperationSetGoalSchema,
    workflowConnectionUnsupportedGoalSchema,
    z.strictObject({
      kind: z.literal('precedence'),
      ...goalBasis,
      before: text,
      after: text,
    }),
    z.strictObject({
      kind: z.literal('route'),
      ...goalBasis,
      from: text,
      output: text,
      to: text,
    }),
    z.strictObject({
      kind: z.literal('independent'),
      ...goalBasis,
      nodeIds: z.array(text).min(2),
    }),
    z.strictObject({
      kind: z.literal('join'),
      ...goalBasis,
      nodeId: text,
      producerIds: z.array(text).min(2),
    }),
    z.strictObject({
      kind: z.literal('semantic'),
      scope: z.enum(['materials', 'workflow']),
      ...goalBasis,
    }),
  ],
);
export const workflowConnectionGoalSchema = z.strictObject({
  id: text,
  decision: workflowConnectionGoalProposalSchema,
});
export const workflowConnectionTerminalSchema = z.strictObject({
  nodeId: text,
  output: text,
});
export const workflowConnectionAssessmentSchema = z.strictObject({
  goalId: text,
  status: z.enum(['satisfied', 'violated', 'insufficient-evidence']),
  scope: z.enum(['materials', 'workflow']),
  evidenceRefs: z.array(workflowConnectionEvidenceReferenceSchema),
  nodeIds: z.array(text),
  reason: text,
});
export const workflowConnectionPatchSchema = z.strictObject({
  kind: z.literal('patch'),
  addEdges: z.array(workflowDraftEdgeSchema),
  removeEdgeIds: z.array(text),
  addRootNodeIds: z.array(text),
  removeRootNodeIds: z.array(text),
  addTerminals: z.array(workflowConnectionTerminalSchema),
  removeTerminals: z.array(workflowConnectionTerminalSchema),
  factIds,
  reason: text,
});
export const workflowConnectionStepProposalSchema = z.discriminatedUnion(
  'kind',
  [
    workflowConnectionPatchSchema,
    z.strictObject({
      kind: z.literal('request-completion'),
      assessments: z.array(workflowConnectionAssessmentSchema),
      reason: text,
    }),
  ],
);
export const workflowConnectionMaterialRequestSchema = z.strictObject({
  kind: z.literal('request-native-material'),
  capability: text,
  purpose: text,
  factIds,
  reason: text,
});
export const workflowConnectionUserDecisionSchema = z.strictObject({
  kind: z.literal('require-user-decision'),
  question: text,
  factIds,
  reason: text,
});
export const workflowConnectionPlanningDecisionSchema = z.union([
  workflowConnectionStepProposalSchema,
  workflowConnectionMaterialRequestSchema,
  workflowConnectionUserDecisionSchema,
  workflowConnectionMaterialRepairRequestSchema,
]);
export const workflowConnectionViolationSchema = z.strictObject({
  code: z.enum([
    'INVALID_PROPOSAL',
    'INVALID_EDGE',
    'CYCLE',
    'INVALID_BOUNDARY',
    'CLOSED_REGION_INVALID',
    'PROTECTED_EDGE',
    'NO_PROGRESS',
    'GOAL_CONTRADICTION',
  ]),
  message: text,
  details: z
    .union([
      z.strictObject({
        kind: z.literal('root-precondition'),
        nodeId: text,
        incomingEdges: z.array(workflowDraftEdgeSchema),
        blockingConditions: z
          .array(
            z.enum([
              'missing-node',
              'incoming-edges',
              'all-input-join',
              'exclusive-rejoin',
              'response-references',
              'planned-dependencies',
              'input-references',
            ]),
          )
          .min(1),
      }),
      z.strictObject({
        kind: z.literal('region-selection'),
        rule: z.enum([
          'duplicate-node',
          'invalid-facts',
          'retired-boundary',
          'unknown-node',
          'invalid-terminal',
          'unknown-port',
          'duplicate-connection',
          'protected-edge',
        ]),
        nodeId: text.optional(),
        connection: workflowDraftEdgeSchema.optional(),
        indexes: z.array(z.int().nonnegative()).optional(),
      }),
      z.strictObject({
        kind: z.literal('independence'),
        goalId: text,
        from: text,
        to: text,
      }),
    ])
    .optional(),
});
export const workflowConnectionRejectedProposalSchema = z.strictObject({
  expected: workflowConnectionStepExpectationSchema,
  proposal: z.union([
    workflowConnectionPlanningDecisionSchema,
    workflowConnectionRegionSchema,
  ]),
  violations: z.array(workflowConnectionViolationSchema).min(1),
});
export const workflowConnectionSessionSchema = z.strictObject({
  id: z.uuid(),
  revision: draftRevisionSchema,
  sourceFingerprint: fingerprintSchema,
  goalFingerprint: fingerprintSchema,
  goals: z.array(workflowConnectionGoalSchema).min(1),
  edges: z.array(workflowDraftEdgeSchema),
  rootNodeIds: z.array(text),
  terminals: z.array(workflowConnectionTerminalSchema),
  assessments: z.array(workflowConnectionAssessmentSchema),
  history: z.array(
    z.strictObject({
      baseRevision: draftRevisionSchema,
      proposal: workflowConnectionStepProposalSchema,
    }),
  ),
});

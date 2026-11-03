import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';
import { workflowDraftEdgeSchema } from './workflow-draft-schema.js';

/** Complete incoming connections and boundaries for each explicitly owned node. */
export const workflowConnectionRegionNodeSchema = z.strictObject({
  nodeId: text,
  incoming: z.array(workflowDraftEdgeSchema.omit({ to: true })),
  root: z.boolean(),
  terminalOutputs: z.array(text),
});
export const workflowConnectionRegionSchema = z.strictObject({
  kind: z.literal('set-region'),
  nodes: z.array(workflowConnectionRegionNodeSchema).min(1),
  factIds: z.array(text).min(1),
  reason: text,
});

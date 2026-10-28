import { z } from 'zod';
import { planningEvidenceTextSchema as text } from './planning-evidence-schema.js';

export const workflowConnectionMaterialRepairTargetSchema = z.strictObject({
  stage: z.enum([
    'api-bindings',
    'api-arguments',
    'native-dependencies',
    'native-parameters',
  ]),
  nodeId: text,
});
export const workflowConnectionMaterialRepairRequestSchema = z.strictObject({
  kind: z.literal('replan-materials'),
  targets: z.array(workflowConnectionMaterialRepairTargetSchema).min(1),
  factIds: z.array(text).min(1),
  reason: text,
});

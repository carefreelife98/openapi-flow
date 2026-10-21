import { z } from 'zod';
import type {
  WorkflowDraftApiInputEditAnswerSchemaInput,
  WorkflowDraftApiInputEditAnswersSchema,
} from '../types/workflow-draft-api-input-edit.js';
import { createWorkflowDraftApiInputEditValuesSchema } from './create-workflow-draft-api-input-edit-values-schema.js';
import { createWorkflowDraftApiInputEditTargetValueSchema } from './create-workflow-draft-api-input-edit-target-value-schema.js';
import { createSchemaResourceContext } from '../bindings/resources/create-schema-resource-context.js';
import {
  workflowDraftApiInputEditAnswerSchema,
  workflowDraftApiInputEditAnswersSchema,
} from './workflow-draft-api-input-edit-answers-schema.js';

/** Human replies own values only for targets the original proposal left pending. */
export function createWorkflowDraftApiInputEditAnswersSchema(
  input: WorkflowDraftApiInputEditAnswerSchemaInput,
): WorkflowDraftApiInputEditAnswersSchema {
  const output = createWorkflowDraftApiInputEditValuesSchema(input).parse(
    input.output,
  );
  const targets = input.contract.targets
    .filter((target) => target.kind === 'set')
    .filter((target) => output.values[target.id].status === 'needs-input');
  const resources = createSchemaResourceContext(input.contract.schemaResource);
  const wire = resources.bundleStaticProjections(
    Object.fromEntries(targets.map((target) => [target.id, target.schema])),
  );
  const alternatives = targets.map((target) =>
    workflowDraftApiInputEditAnswerSchema.extend({
      targetId: z
        .literal(target.id)
        .describe(
          `The pending input target ${target.pointer} in this contract.`,
        ),
      value: createWorkflowDraftApiInputEditTargetValueSchema(
        target,
        resources,
        input.contract.nodeId,
        wire.projections[target.id],
      ),
    }),
  );
  const answers =
    alternatives.length === 0
      ? z.array(z.never()).max(0)
      : z
          .array(
            alternatives.length === 1 ? alternatives[0] : z.union(alternatives),
          )
          .superRefine((items, context) => {
            if (
              new Set(items.map((item) => item.targetId)).size !== items.length
            )
              context.addIssue({
                code: 'custom',
                message:
                  'Typed API edit answers require distinct pending target IDs',
              });
          });
  return workflowDraftApiInputEditAnswersSchema
    .extend({
      contractId: z.literal(input.contract.id),
      answers,
    })
    .meta({
      $defs: wire.definitions,
    }) as WorkflowDraftApiInputEditAnswersSchema;
}

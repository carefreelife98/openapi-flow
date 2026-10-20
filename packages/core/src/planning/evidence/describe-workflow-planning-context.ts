import { z } from 'zod';
import { apiOperationKeySchema } from '../../schemas/api-operation-key-schema.js';
import { workflowEntryPointContractSchema } from '../../schemas/planning-evidence-schema.js';
import type {
  WorkflowPlanningContext,
  WorkflowPlanningContextDescription,
} from '../../types/planning-evidence.js';
import { describeWorkflowDraftClarification } from '../../requirements/clarification/describe-workflow-draft-clarification.js';
import { nativeMaterialRequirementsSchema } from '../../schemas/native-material-requirements-schema.js';
import { resolveWorkflowPlanningMessages } from './resolve-workflow-planning-messages.js';

/** Source declarations, never placeholders or fabricated native parameters. */
export function describeWorkflowPlanningContext(
  input: WorkflowPlanningContext,
): WorkflowPlanningContextDescription {
  const messages = resolveWorkflowPlanningMessages(input);
  const operations = input.operations === undefined ? [] : input.operations;
  const entrypoint = workflowEntryPointContractSchema
    .optional()
    .safeParse(input.entrypoint);
  if (!entrypoint.success)
    throw new Error('planning context.entrypoint is invalid', {
      cause: entrypoint.error,
    });
  const capabilities =
    input.capabilities === undefined ? [] : input.capabilities;
  if (!Array.isArray(operations) || !Array.isArray(capabilities))
    throw new Error(
      'planning context.operations and capabilities must be arrays when supplied',
    );
  const keys = operations.map((operation, index) => {
    const key = apiOperationKeySchema.safeParse(operation?.key);
    if (!key.success)
      throw new Error(`planning context.operations[${index}].key is invalid`, {
        cause: key.error,
      });
    return JSON.stringify(key.data);
  });
  if (new Set(keys).size !== keys.length)
    throw new Error(
      'planning context.operations requires distinct operation keys and snapshots',
    );
  if (
    capabilities.some(
      (capability) =>
        !capability ||
        typeof capability.name !== 'string' ||
        !capability.name.trim() ||
        typeof capability.description !== 'string' ||
        !capability.description.trim(),
    ) ||
    new Set(capabilities.map((capability) => capability.name)).size !==
      capabilities.length
  )
    throw new Error(
      'planning context.capabilities requires distinct non-empty names and descriptions',
    );
  const clarification = describeWorkflowDraftClarification({
    ...input,
    messages,
  });
  return {
    messages,
    ...(clarification === undefined ? {} : { clarification }),
    ...(entrypoint.data === undefined ? {} : { entrypoint: entrypoint.data }),
    operations: structuredClone(operations),
    capabilities: capabilities.map((capability) => {
      try {
        return {
          name: capability.name,
          description: capability.description,
          ...(capability.materialRequirements === undefined
            ? {}
            : {
                materialRequirements: nativeMaterialRequirementsSchema.parse(
                  capability.materialRequirements,
                ),
              }),
          ...(capability.supportsRuntimeParameters === true
            ? { supportsRuntimeParameters: true as const }
            : {}),
          parametersSchema: z.toJSONSchema(capability.parametersSchema, {
            io: 'input',
          }),
        };
      } catch (error) {
        throw new Error(
          `Native capability ${capability.name} cannot describe its input contract`,
          { cause: error },
        );
      }
    }),
  };
}

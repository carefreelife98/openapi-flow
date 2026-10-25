import { isDeepStrictEqual } from 'node:util';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import type { InvokeConnectionPlanningModelInput } from '../../types/incremental-connection-planning.js';
import { invokeStructuredModel } from '../../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../../schemas/serialize-structured-output-schema.js';
import { validateConnectionProposal } from './workflow-connection-planning-error.js';

/** Exactly one invocation. Loop policy and rejected-proposal handling belong to the host. */
export async function invokeConnectionPlanningModel<Output extends object>(
  input: InvokeConnectionPlanningModelInput<Output>,
): Promise<Output> {
  const wireSchema = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: input.operation,
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => serializeStructuredOutputSchema(input.schema, 'draft-2020-12'),
  );
  const output = await invokeStructuredModel<Output>({
    model: input.model,
    operation: input.operation,
    name: input.name,
    schema: wireSchema,
    method: 'functionCalling',
    strict: true,
    messages: input.messages,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  return validateConnectionProposal(
    {
      operation: input.operation,
      stage: 'model-output',
      code: 'MODEL_OUTPUT_INVALID',
      output,
    },
    () => {
      const parsed = input.schema.parse(output);
      if (!isDeepStrictEqual(parsed, output))
        throw new Error(
          'Connection output schema must not default, coerce or transform model data',
        );
      return parsed;
    },
  );
}

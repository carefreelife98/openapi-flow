import { OpenApiFlowError } from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import type { GenerateApiValuesInput } from '../types/workflow-api-values.js';
import { generateWorkflowApiValues } from './generate-workflow-api-values.js';

/** A scoped value replan uses the same protocol as initial shared planning. */
export async function generateApiValues(
  input: GenerateApiValuesInput,
): Promise<ApiCallArguments> {
  const result = await generateWorkflowApiValues({
    scenario: input.scenario,
    messages: input.literalSourceMessages,
    interpretSchemaChoices: input.selectOasEnums === true,
    calls: [
      {
        callId: input.callId,
        operation: input.operation,
        bindings: input.bindings,
        ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
        ...(input.requestMediaType === undefined
          ? {}
          : { requestMediaType: input.requestMediaType }),
        ...(input.confirmedInputs === undefined
          ? {}
          : { confirmedInputs: input.confirmedInputs }),
      },
    ],
    model: input.model,
    signal: input.signal,
    ...(input.materialRepair === undefined
      ? {}
      : { materialRepairs: { [input.callId]: input.materialRepair } }),
  });
  const checked = result.arguments.find((call) => call.callId === input.callId);
  if (checked !== undefined) return checked;
  const rejection = result.rejections.find(
    (call) => call.callId === input.callId,
  );
  if (rejection === undefined)
    throw new Error(
      `API value planning has no checked result for ${input.callId}`,
    );
  throw new OpenApiFlowError({
    message: rejection.reason,
    diagnostic: {
      owner: 'langchain',
      operation: 'generateApiValues',
      stage: 'contract-validation',
      code: 'API_ARGUMENT_VALIDATION_FAILED',
    },
  });
}

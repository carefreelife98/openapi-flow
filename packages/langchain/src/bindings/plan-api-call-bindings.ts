import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeApiCallBindingPlanning,
  resolveApiBindingSourceSelection,
  resolveApiCallBindingPlan,
  listApiResponsePointers,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type {
  ApiCallBindingPlan,
  ApiCallBindingProposal,
} from '@openapi-flow/core';
import type { PlanApiCallBindingsInput } from '../types/api-call-binding-planning.js';
import { createApiCallBindingPlanSchema } from '../schemas/api-call-binding-plan-schema.js';
import { apiCallBindingsPrompt } from '../prompts/api-call-bindings-prompt.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function planApiCallBindings(
  input: PlanApiCallBindingsInput,
): Promise<ApiCallBindingPlan> {
  const { description, sources } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'planApiCallBindings',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeApiCallBindingPlanning(input);
      const sources = structuredClone(input.sources);
      const expected = resolveApiBindingSourceSelection({
        ...description.input,
        proposal: {
          sourceNodeIds: sources.sourceNodeIds,
          gaps: sources.gaps,
          ...(sources.reason === undefined ? {} : { reason: sources.reason }),
        },
      });
      if (!isDeepStrictEqual(sources, expected))
        throw new Error(
          'binding source selection changed or belongs to another call or source snapshot',
        );
      return { description, sources };
    },
  );
  input.signal?.throwIfAborted();
  if (!sources.sourceNodeIds.length)
    return resolveApiCallBindingPlan({
      ...description.input,
      sources,
      proposal: {
        bindings: [],
        gaps: [],
        ...(sources.reason === undefined ? {} : { reason: sources.reason }),
      },
    });
  const selected = new Set(sources.sourceNodeIds);
  const schema = createApiCallBindingPlanSchema(
    description,
    sources.sourceNodeIds,
  );
  const output = await invokeStructuredModel<ApiCallBindingProposal>({
    model: input.model,
    schema,
    operation: 'planApiCallBindings',
    name: 'plan_api_call_bindings',
    method: 'functionCalling',
    signal: input.signal,
    messages: [
      new SystemMessage(apiCallBindingsPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: description.input.scenario,
          target: description.target,
          requestSchema: description.requestSchema,
          apiSources: description.input.materials
            .filter((material) => selected.has(material.callId))
            .map((material) => ({
              nodeId: material.callId,
              key: material.operation.key,
              method: material.operation.method,
              path: material.operation.path,
              purpose: material.purpose,
              responses: material.operation.operation.responses,
              responsePointerCatalog: listApiResponsePointers(
                material.operation,
              ),
            })),
          nativeSources: description.input.nativeOutputs?.filter((source) =>
            selected.has(source.nodeId),
          ),
        }),
      ),
    ],
  });
  input.signal?.throwIfAborted();
  return runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'planApiCallBindings',
      stage: 'contract-validation',
      code: 'API_BINDING_VALIDATION_FAILED',
    },
    () =>
      resolveApiCallBindingPlan({
        ...description.input,
        sources,
        proposal: parseStructuredOutput(schema, output, 'API call bindings'),
      }),
  );
}

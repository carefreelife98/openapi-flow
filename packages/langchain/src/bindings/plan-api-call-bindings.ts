import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  describeApiCallBindingPlanning,
  resolveApiBindingSourceSelection,
  resolveApiCallBindingPlan,
  listApiResponsePointers,
  runOpenApiFlowOperation,
  describeWorkflowConnectionApiRepair,
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
import { apiMaterialRepairPrompt } from '../prompts/api-material-repair-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';

export async function planApiCallBindings(
  input: PlanApiCallBindingsInput,
): Promise<ApiCallBindingPlan> {
  const { description, sources, materialRepair } = runOpenApiFlowOperation(
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
      const materialRepair =
        input.materialRepair === undefined
          ? undefined
          : describeWorkflowConnectionApiRepair({
              stage: 'api-bindings',
              repair: input.materialRepair,
              planning: input,
            });
      return { description, sources, materialRepair };
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
    schema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
    operation: 'planApiCallBindings',
    name: 'plan_api_call_bindings',
    method: 'functionCalling',
    strict: true,
    signal: input.signal,
    messages: [
      new SystemMessage(
        materialRepair === undefined
          ? apiCallBindingsPrompt
          : [apiCallBindingsPrompt, apiMaterialRepairPrompt].join('\n'),
      ),
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
          ...(materialRepair === undefined ? {} : { materialRepair }),
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
    () => {
      if (
        materialRepair !== undefined &&
        (input.materialRepair === undefined ||
          !isDeepStrictEqual(
            materialRepair,
            describeWorkflowConnectionApiRepair({
              stage: 'api-bindings',
              repair: input.materialRepair,
              planning: input,
            }),
          ))
      )
        throw new Error(
          'API material repair feedback changed during binding planning',
        );
      return resolveApiCallBindingPlan({
        ...description.input,
        sources,
        proposal: parseStructuredOutput(
          createApiCallBindingPlanSchema(
            description,
            sources.sourceNodeIds,
            false,
          ),
          output,
          'API call bindings',
        ),
      });
    },
  );
}

import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  validateApiBindingAssignments,
  validateApiBindingGaps,
  describeApiBindingPlanning,
  createApiBindingPlanningRecord,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { ApiBindingPlan } from '@openapi-flow/core';
import type {
  PlanApiBindingsInput,
  ApiBindingPlanOutput,
} from '../types/binding-planning.js';
import {
  createApiBindingPlanSchema,
  apiBindingPlanningOptionsSchema,
} from '../schemas/api-binding-plan-schema.js';
import { apiBindingsPrompt } from '../prompts/api-bindings-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';

export async function planApiBindings(
  input: PlanApiBindingsInput,
): Promise<ApiBindingPlan> {
  const { options, snapshot, context, schema } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'planApiBindings',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      assertSelectionInput(input.scenario, input.model);
      const options = apiBindingPlanningOptionsSchema.parse({
        includeExplanations: input.includeExplanations,
      });
      const { input: snapshot, context } = describeApiBindingPlanning(input);
      const schema = createApiBindingPlanSchema(
        snapshot.materials,
        snapshot.nativeOutputs,
        options.includeExplanations === true,
      );
      return { options, snapshot, context, schema };
    },
  );
  const proposed = await invokeStructuredModel<ApiBindingPlanOutput>({
    model: input.model,
    schema,
    operation: 'planApiBindings',
    name: 'plan_api_bindings',
    method: 'functionCalling',
    messages: [
      new SystemMessage(apiBindingsPrompt),
      new HumanMessage(JSON.stringify(context)),
    ],
  });
  const parsed = parseStructuredOutput<ApiBindingPlanOutput>(
    schema,
    proposed,
    'model API bindings',
  );
  const plan: ApiBindingPlan = {
    calls: parsed.calls.map(({ callId, bindings }) => ({
      callId,
      bindings: structuredClone(bindings),
    })),
    gaps: structuredClone(parsed.gaps),
  };
  validateApiBindingAssignments({
    calls: plan.calls,
    materials: snapshot.materials,
    nativeOutputs: snapshot.nativeOutputs,
  });
  validateApiBindingGaps({ plan, materials: snapshot.materials });
  if (options.includeExplanations === true) {
    plan.bindingPlanning = runOpenApiFlowOperation(
      {
        owner: 'langchain',
        operation: 'planApiBindings',
        stage: 'contract-validation',
        code: 'API_BINDING_VALIDATION_FAILED',
      },
      () =>
        createApiBindingPlanningRecord({
          ...snapshot,
          plan,
          reasons: parsed.calls.map((call) => {
            if (!('reason' in call))
              throw new Error(
                `model API bindings are missing reason for ${call.callId}`,
              );
            return { callId: call.callId, reason: call.reason };
          }),
        }),
    );
  }
  return plan;
}

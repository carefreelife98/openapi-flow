import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  validateApiBindingAssignments,
  validateApiBindingGaps,
  validateNativeOutputContracts,
} from '@openapi-flow/core';
import type { ApiBindingPlan } from '@openapi-flow/core';
import type { PlanApiBindingsInput } from '../types/binding-planning.js';
import { createApiBindingPlanSchema } from '../schemas/api-binding-plan-schema.js';
import { apiBindingsPrompt } from '../prompts/api-bindings-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function planApiBindings(
  input: PlanApiBindingsInput,
): Promise<ApiBindingPlan> {
  assertSelectionInput(input.scenario, input.model);
  validateNativeOutputContracts(input.nativeOutputs ?? []);
  const schema = createApiBindingPlanSchema(
    input.materials,
    input.nativeOutputs,
  );
  const proposed: ApiBindingPlan = await input.model
    .withStructuredOutput<ApiBindingPlan>(schema, {
      name: 'plan_api_bindings',
      method: 'functionCalling',
      strict: true,
    })
    .invoke([
      new SystemMessage(apiBindingsPrompt),
      new HumanMessage(
        JSON.stringify({
          scenario: input.scenario,
          nativeOutputs: input.nativeOutputs,
          materials: input.materials.map(({ operation, ...material }) => ({
            ...material,
            operation: {
              key: operation.key,
              method: operation.method,
              path: operation.path,
              operation: operation.operation,
              effective: operation.effective,
            },
          })),
        }),
      ),
    ]);
  const plan = parseStructuredOutput(schema, proposed, 'model API bindings');
  validateApiBindingAssignments({
    calls: plan.calls,
    materials: input.materials,
    nativeOutputs: input.nativeOutputs,
  });
  validateApiBindingGaps({ plan, materials: input.materials });
  return plan;
}

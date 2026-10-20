import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeNativeNodePlanning,
  createNativeNodePlan,
  createNativeNodePlanningRecord,
} from '@openapi-flow/core';
import type {
  NativeNodePlan,
  NativeNodePlanningOutput,
  PlanNativeNodesInput,
} from '../types/native-node-planning.js';
import { createNativeNodePlanningContract } from '../schemas/native-node-planning-contract.js';
import { nativeNodeExplanationOptionsSchema } from '../schemas/native-node-explanation-schema.js';
import { nativeNodePlanningPrompt } from '../prompts/native-node-planning-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { resolveNativeNodePlanningOutput } from './resolve-native-node-planning-output.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';

export async function planNativeNodes(
  input: PlanNativeNodesInput,
): Promise<NativeNodePlan> {
  if (!input.planId?.trim())
    throw new Error('planNativeNodes.planId is required');
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'planNativeNodes.model must support structured output when supplied',
    );
  const options = nativeNodeExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  const {
    input: snapshot,
    context,
    planningCapabilities,
  } = describeNativeNodePlanning(input);
  // No registered choice means no native-selection model call, not an inferred registry.
  if (!snapshot.capabilities.length) {
    const plan = createNativeNodePlan({
      ...snapshot,
      proposal: { nativeNodes: [], gaps: [] },
    });
    return {
      ...plan,
      ...(options.includeExplanations === true
        ? {
            nativePlanning: createNativeNodePlanningRecord({
              ...snapshot,
              plan,
            }),
          }
        : {}),
    };
  }
  const model = input.model;
  if (!model)
    throw new Error(
      'planNativeNodes.model is required when supplied capabilities need a planning decision',
    );
  assertSelectionInput(snapshot.scenario, model);
  const contract = createNativeNodePlanningContract(
    planningCapabilities,
    snapshot.allowRuntimeParameters === true,
    options.includeExplanations === true,
  );
  if (!isDeepStrictEqual(contract.capabilities, context.capabilities))
    throw new Error(
      'native planning schema differs from its supplied capability material',
    );
  const { schema } = contract;
  const output: NativeNodePlanningOutput = await model
    .withStructuredOutput<NativeNodePlanningOutput>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_native_nodes',
        method: 'functionCalling',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(nativeNodePlanningPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  let parsed: NativeNodePlanningOutput;
  try {
    parsed = parseStructuredOutput<NativeNodePlanningOutput>(
      schema,
      output,
      'model native node plan',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error(
        'native model schema must validate without defaults, coercion or transformation',
      );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new NativeNodePlanningError(
      { stage: 'proposal-schema', output },
      error,
    );
  }
  const { proposal, assessment } = resolveNativeNodePlanningOutput(parsed);
  try {
    if (
      !isDeepStrictEqual(describeNativeNodePlanning(snapshot).context, context)
    )
      throw new Error(
        'native planning source contracts changed during the model invocation',
      );
    const plan = createNativeNodePlan({ ...snapshot, proposal });
    return {
      ...plan,
      ...(options.includeExplanations === true
        ? {
            nativePlanning: createNativeNodePlanningRecord({
              ...snapshot,
              plan,
              assessment,
            }),
          }
        : {}),
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new NativeNodePlanningError(
      {
        stage: 'node-validation',
        output: proposal,
        sourceOutput: parsed,
      },
      error,
    );
  }
}

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeNativeInstanceDependencies,
  createNativeInstanceDependenciesSchema,
  resolveNativeInstanceDependencies,
} from '@openapi-flow/core';
import type {
  NativeInstanceDependencyPlan,
  NativeInstanceDependencyProposal,
} from '@openapi-flow/core';
import type { PlanNativeInstanceDependenciesInput } from '../types/native-node-planning.js';
import { nativeInstanceDependenciesPrompt } from '../prompts/native-instance-dependencies-prompt.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { NativeNodePlanningError } from './native-node-planning-error.js';

/** Zero or one producer-choice call; no parameters, output contracts or runtime DAG edges. */
export async function planNativeInstanceDependencies(
  input: PlanNativeInstanceDependenciesInput,
): Promise<NativeInstanceDependencyPlan> {
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'planNativeInstanceDependencies.model must support structured output when supplied',
    );
  const context = describeNativeInstanceDependencies(input);
  const explanations = input.includeExplanations;
  if (
    Object.values(context.sourceCandidatesByNodeId).every(
      (ids) => ids.length === 0,
    )
  )
    return resolveNativeInstanceDependencies({
      ...input,
      proposal: {
        sourcesByNodeId: Object.fromEntries(
          context.instances.map((node) => [node.id, { sourceNodeIds: [] }]),
        ),
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planNativeInstanceDependencies.model must support structured output for producer choices',
    );
  const schema = createNativeInstanceDependenciesSchema(input);
  const output = await input.model
    .withStructuredOutput<NativeInstanceDependencyProposal>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_native_instance_dependencies',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(nativeInstanceDependenciesPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  try {
    if (
      !isDeepStrictEqual(describeNativeInstanceDependencies(input), context) ||
      explanations !== input.includeExplanations
    )
      throw new Error(
        'Native dependency source contracts changed during planning; no automatic rebase',
      );
    return resolveNativeInstanceDependencies({ ...input, proposal: output });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new NativeNodePlanningError(
      { stage: 'dependency-plan', output },
      cause,
    );
  }
}

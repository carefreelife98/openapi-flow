import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowDraftNativeDependencies,
  createWorkflowDraftNativeDependenciesSchema,
  resolveWorkflowDraftNativeDependencies,
} from '@openapi-flow/core';
import type {
  NativeInstanceDependencyProposal,
  WorkflowDraftNativeDependencies,
} from '@openapi-flow/core';
import type { PlanWorkflowDraftNativeDependenciesInput } from '../types/workflow-draft-native-node-addition.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { workflowDraftNativeDependenciesPrompt } from '../prompts/workflow-draft-native-dependencies-prompt.js';
import { WorkflowDraftNativeNodeAdditionPlanningError } from './workflow-draft-native-node-addition-planning-error.js';

/** Separate checkpointable choice stage. No model call when no producer choice exists. */
export async function planWorkflowDraftNativeDependencies(
  input: PlanWorkflowDraftNativeDependenciesInput,
): Promise<WorkflowDraftNativeDependencies> {
  if (
    input.model !== undefined &&
    (!input.model || typeof input.model.withStructuredOutput !== 'function')
  )
    throw new Error(
      'planWorkflowDraftNativeDependencies.model must support structured output when supplied',
    );
  const context = describeWorkflowDraftNativeDependencies(input);
  if (
    Object.values(context.sourceCandidatesByNodeId).every(
      (ids) => ids.length === 0,
    )
  )
    return resolveWorkflowDraftNativeDependencies({
      ...input,
      proposal: {
        sourcesByNodeId: Object.fromEntries(
          context.roles.map((role) => [role.nodeId, { sourceNodeIds: [] }]),
        ),
      },
    });
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'planWorkflowDraftNativeDependencies.model must support structured output for producer choices',
    );
  const output = await input.model
    .withStructuredOutput<NativeInstanceDependencyProposal>(
      serializeStructuredOutputSchema(
        createWorkflowDraftNativeDependenciesSchema(input),
        'draft-2020-12',
      ),
      {
        name: 'plan_draft_native_dependencies',
        method: 'jsonSchema',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowDraftNativeDependenciesPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  try {
    if (
      !isDeepStrictEqual(
        describeWorkflowDraftNativeDependencies(input),
        context,
      )
    )
      throw new Error(
        'Draft native producer source contracts changed during planning; no automatic rebase',
      );
    return resolveWorkflowDraftNativeDependencies({
      ...input,
      proposal: output,
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowDraftNativeNodeAdditionPlanningError(
      { stage: 'producer-dependencies', output },
      cause,
    );
  }
}

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowGraphPlanning,
  createWorkflowGraphPlanningResult,
  createWorkflowGraphPlanningRecord,
} from '@openapi-flow/core';
import type { ReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type {
  PlanReviewableWorkflowGraphInput,
  ReviewableWorkflowGraphModelOutput,
} from '../types/reviewable-workflow-planning.js';
import type { ResolvedWorkflowGraphOutput } from '../types/workflow-planning.js';
import { createReviewableWorkflowGraphSchema } from '../schemas/reviewable-workflow-graph-schema.js';
import { workflowGraphExplanationOptionsSchema } from '../schemas/workflow-graph-explanation-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { resolveReviewableWorkflowGraphOutput } from './resolve-workflow-graph-output.js';
import { reviewableWorkflowGraphPrompt } from '../prompts/reviewable-workflow-graph-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { ReviewableWorkflowGraphPlanningError } from './reviewable-workflow-graph-planning-error.js';

export async function planReviewableWorkflowGraph(
  input: PlanReviewableWorkflowGraphInput,
): Promise<ReviewableWorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const options = workflowGraphExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  const {
    input: snapshot,
    context,
    sources,
    planningCapabilities,
  } = describeWorkflowGraphPlanning({ ...input, mode: 'reviewable' });
  const readyIds = snapshot.materials.flatMap((material) =>
    material.status === 'ready' ? [material.arguments.callId] : [],
  );
  const schema = createReviewableWorkflowGraphSchema(
    planningCapabilities,
    readyIds,
    options.includeExplanations === true ? 'graph' : 'none',
  );
  const output: ReviewableWorkflowGraphModelOutput = await input.model
    .withStructuredOutput<ReviewableWorkflowGraphModelOutput>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_reviewable_workflow_graph',
        method: 'functionCalling',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(reviewableWorkflowGraphPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  let resolved: ResolvedWorkflowGraphOutput;
  try {
    const parsed = parseStructuredOutput<ReviewableWorkflowGraphModelOutput>(
      schema,
      output,
      'model reviewable workflow graph',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error(
        'native model schema must validate without defaults, coercion or transformation',
      );
    resolved = resolveReviewableWorkflowGraphOutput(
      parsed,
      snapshot.capabilities.length,
      readyIds.length,
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new ReviewableWorkflowGraphPlanningError(
      { stage: 'proposal-schema', output },
      error,
    );
  }
  try {
    const current = describeWorkflowGraphPlanning(snapshot);
    if (
      !isDeepStrictEqual(current.context, context) ||
      !isDeepStrictEqual(current.sources, sources)
    )
      throw new Error(
        'reviewable workflow graph source contracts changed during the model invocation',
      );
    const plan = createWorkflowGraphPlanningResult({
      ...snapshot,
      proposal: resolved.proposal,
    });
    if (!('blockedCalls' in plan))
      throw new Error('reviewable graph result is missing blockedCalls');
    if (options.includeExplanations === true) {
      if (!resolved.assessment)
        throw new Error(
          'model reviewable workflow graph is missing its explanation assessment',
        );
      plan.graphPlanning = createWorkflowGraphPlanningRecord({
        ...snapshot,
        proposal: resolved.proposal,
        plan,
        assessment: resolved.assessment,
      });
    }
    return plan;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new ReviewableWorkflowGraphPlanningError(
      { stage: 'graph-validation', output },
      error,
    );
  }
}

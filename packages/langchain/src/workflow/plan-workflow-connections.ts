import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionPlanning,
  createWorkflowConnectionPlan,
  createWorkflowConnectionPlanningRecord,
} from '@openapi-flow/core';
import type { ReviewableWorkflowGraphPlan } from '@openapi-flow/core';
import type {
  PlanWorkflowConnectionsInput,
  ResolvedWorkflowConnectionOutput,
} from '../types/workflow-orchestration.js';
import { createWorkflowConnectionSelectionSchema } from '../schemas/workflow-connection-selection-schema.js';
import type { WorkflowConnectionSelectionOutput } from '../types/workflow-connection-selection.js';
import { resolveWorkflowConnectionSelection } from './resolve-workflow-connection-selection.js';
import { resolveWorkflowConnectionOutput } from './resolve-workflow-connection-output.js';
import { workflowConnectionsPrompt } from '../prompts/workflow-connections-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { ReviewableWorkflowGraphPlanningError } from './reviewable-workflow-graph-planning-error.js';
import { workflowConnectionExplanationOptionsSchema } from '../schemas/workflow-connection-explanation-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';

export async function planWorkflowConnections(
  input: PlanWorkflowConnectionsInput,
): Promise<ReviewableWorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const options = workflowConnectionExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  const {
    input: snapshot,
    context,
    sources,
  } = describeWorkflowConnectionPlanning(input);
  const readyIds = context.readyCallIds;
  const schema = createWorkflowConnectionSelectionSchema(
    context,
    options.includeExplanations === true,
  );
  const output: WorkflowConnectionSelectionOutput = await input.model
    .withStructuredOutput<WorkflowConnectionSelectionOutput>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_workflow_connections',
        method: 'functionCalling',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowConnectionsPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  let resolved: ResolvedWorkflowConnectionOutput;
  try {
    const parsed = parseStructuredOutput<WorkflowConnectionSelectionOutput>(
      schema,
      output,
      'model workflow connections',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error(
        'connection model schema must validate without defaults, coercion or transformation',
      );
    resolved = resolveWorkflowConnectionOutput(
      resolveWorkflowConnectionSelection(
        parsed,
        context,
        options.includeExplanations === true,
      ),
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
    const current = describeWorkflowConnectionPlanning(snapshot);
    if (
      !isDeepStrictEqual(current.context, context) ||
      !isDeepStrictEqual(current.sources, sources)
    )
      throw new Error(
        'connection planning source contracts changed during the model invocation',
      );
    const plan = createWorkflowConnectionPlan({
      ...snapshot,
      proposal: resolved.proposal,
    });
    if (options.includeExplanations === true) {
      if (!resolved.decision)
        throw new Error(
          'model workflow connections are missing the explanation decision',
        );
      plan.connectionPlanning = createWorkflowConnectionPlanningRecord({
        ...snapshot,
        plan,
        decision: resolved.decision,
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

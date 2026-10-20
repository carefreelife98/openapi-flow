import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowGraphPlanning,
  createWorkflowGraphPlanningResult,
  createWorkflowGraphPlanningRecord,
} from '@openapi-flow/core';
import type {
  WorkflowGraphPlan,
  WorkflowGraphPlanningInput,
} from '@openapi-flow/core';
import type {
  PlanWorkflowGraphInput,
  WorkflowGraphModelOutput,
  ResolvedWorkflowGraphOutput,
} from '../types/workflow-planning.js';
import { createWorkflowGraphProposalSchema } from '../schemas/workflow-graph-proposal-schema.js';
import { workflowGraphExplanationOptionsSchema } from '../schemas/workflow-graph-explanation-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { resolveExecutableWorkflowGraphOutput } from './resolve-workflow-graph-output.js';
import { WorkflowGraphPlanningError } from './workflow-graph-planning-error.js';
import { workflowGraphPrompt } from '../prompts/workflow-graph-prompt.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';

export async function planWorkflowGraph(
  input: PlanWorkflowGraphInput,
): Promise<WorkflowGraphPlan> {
  assertSelectionInput(input.scenario, input.model);
  const options = workflowGraphExplanationOptionsSchema.parse({
    includeExplanations: input.includeExplanations,
  });
  if (!Array.isArray(input.materials))
    throw new Error('planWorkflowGraph.materials must be an array');
  const source: WorkflowGraphPlanningInput = {
    mode: 'executable',
    scenario: input.scenario,
    materials: input.materials.map((material) => ({
      ...material,
      status: 'ready',
    })),
    capabilities: input.capabilities,
    preparedNativeNodes: input.preparedNativeNodes,
    gaps: [],
  };
  const {
    input: snapshot,
    context,
    sources,
    planningCapabilities,
  } = describeWorkflowGraphPlanning(source);
  const schema = createWorkflowGraphProposalSchema(
    planningCapabilities,
    options.includeExplanations === true,
  );
  const output: WorkflowGraphModelOutput = await input.model
    .withStructuredOutput<WorkflowGraphModelOutput>(
      serializeStructuredOutputSchema(schema, 'draft-2020-12'),
      {
        name: 'plan_workflow_graph',
        method: 'functionCalling',
        strict: true,
      },
    )
    .invoke([
      new SystemMessage(workflowGraphPrompt),
      new HumanMessage(JSON.stringify(context)),
    ]);
  let resolved: ResolvedWorkflowGraphOutput;
  try {
    const parsed = parseStructuredOutput<WorkflowGraphModelOutput>(
      schema,
      output,
      'model workflow graph',
    );
    if (!isDeepStrictEqual(parsed, output))
      throw new Error(
        'native model schema must validate without defaults, coercion or transformation',
      );
    resolved = resolveExecutableWorkflowGraphOutput(
      parsed,
      snapshot.capabilities.length,
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    throw new WorkflowGraphPlanningError(
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
        'workflow graph source contracts changed during the model invocation',
      );
    const plan = createWorkflowGraphPlanningResult({
      ...snapshot,
      proposal: resolved.proposal,
    });
    if (options.includeExplanations === true) {
      if (!resolved.assessment)
        throw new Error(
          'model workflow graph is missing its explanation assessment',
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
    throw new WorkflowGraphPlanningError(
      { stage: 'graph-validation', output },
      error,
    );
  }
}

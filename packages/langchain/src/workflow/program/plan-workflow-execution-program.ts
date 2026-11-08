import {
  describeWorkflowExecutionProgram,
  resolveWorkflowExecutionProgram,
} from '@openapi-flow/core';
import type { ResolvedWorkflowExecutionProgram } from '@openapi-flow/core';
import type { PlanWorkflowExecutionProgramInput } from '../../types/workflow-execution-program.js';
import { createWorkflowExecutionProgramSchema } from '../../schemas/create-workflow-execution-program-schema.js';
import { workflowExecutionProgramPrompt } from '../../prompts/workflow-execution-program-prompt.js';
import { invokeWorkflowProgramModel } from './invoke-workflow-program-model.js';
import { WorkflowProgramPlanningError } from './workflow-program-planning-error.js';

export async function planWorkflowExecutionProgram(
  input: PlanWorkflowExecutionProgramInput,
): Promise<ResolvedWorkflowExecutionProgram> {
  input.signal?.throwIfAborted();
  const description = describeWorkflowExecutionProgram(input);
  if (
    input.feedback &&
    input.feedback.sourceFingerprint !== description.sourceFingerprint
  )
    throw new Error('Execution program feedback belongs to a stale source');
  const program = await invokeWorkflowProgramModel({
    input,
    description,
    name: 'plan_workflow_execution_program',
    operation: 'planWorkflowExecutionProgram',
    schema: createWorkflowExecutionProgramSchema(description),
    prompt: workflowExecutionProgramPrompt,
  });
  try {
    return resolveWorkflowExecutionProgram({ ...input, program });
  } catch (cause) {
    throw new WorkflowProgramPlanningError({
      operation: 'planWorkflowExecutionProgram',
      sourceFingerprint: description.sourceFingerprint,
      stage: 'contract-validation',
      output: program,
      cause,
    });
  }
}

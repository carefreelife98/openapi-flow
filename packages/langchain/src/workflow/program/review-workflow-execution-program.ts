import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowExecutionProgram,
  validateWorkflowExecutionProgram,
  createWorkflowProgramMaterialRepair,
} from '@openapi-flow/core';
import type {
  ReviewWorkflowExecutionProgramInput,
  WorkflowProgramReview,
} from '../../types/workflow-execution-program.js';
import { workflowProgramReviewSchema } from '../../schemas/workflow-program-review-schema.js';
import { workflowExecutionProgramReviewPrompt } from '../../prompts/workflow-execution-program-prompt.js';
import { invokeWorkflowProgramModel } from './invoke-workflow-program-model.js';
import { WorkflowProgramPlanningError } from './workflow-program-planning-error.js';

export async function reviewWorkflowExecutionProgram(
  input: ReviewWorkflowExecutionProgramInput,
): Promise<WorkflowProgramReview> {
  const result = validateWorkflowExecutionProgram(input);
  const description = describeWorkflowExecutionProgram(input);
  const review = await invokeWorkflowProgramModel({
    input,
    description,
    result,
    schema: workflowProgramReviewSchema,
    name: 'review_workflow_execution_program',
    operation: 'reviewWorkflowExecutionProgram',
    prompt: workflowExecutionProgramReviewPrompt,
  });
  try {
    if (!isDeepStrictEqual(validateWorkflowExecutionProgram(input), result))
      throw new Error('Reviewed program changed during model invocation');
    if (
      review.status === 'accepted' &&
      (review.findings.length ||
        review.question !== null ||
        review.materialRepair !== null)
    )
      throw new Error(
        'An accepted execution program review must not contain findings, questions or material work',
      );
    if (review.status !== 'accepted' && !review.findings.length)
      throw new Error(
        'A rejected execution program review requires concrete findings',
      );
    if ((review.status === 'needs-user-input') !== (review.question !== null))
      throw new Error('Only an unresolved business review requires a question');
    if (
      review.findings.some((f) =>
        f.nodeIds.some(
          (id) => !description.context.nodes.some((n) => n.id === id),
        ),
      )
    )
      throw new Error('Execution program review references an unknown node');
    if (
      (review.status === 'needs-revision') !==
      (review.revisionTarget !== null)
    )
      throw new Error(
        'Only needs-revision requires an explicit revisionTarget',
      );
    if (
      (review.revisionTarget === 'change-prepared-materials') !==
      (review.materialRepair !== null)
    )
      throw new Error(
        'Material revision requires its explicit owner request; execution revision cannot change material values',
      );
    if (review.materialRepair !== null) {
      if (review.status !== 'needs-revision')
        throw new Error('Material work requires needs-revision status');
      createWorkflowProgramMaterialRepair({
        ...input,
        decision: review.materialRepair,
        expectedSourceFingerprint: description.sourceFingerprint,
      });
    }
    return {
      sourceFingerprint: description.sourceFingerprint,
      program: result.program,
      review,
    };
  } catch (cause) {
    throw new WorkflowProgramPlanningError({
      operation: 'reviewWorkflowExecutionProgram',
      sourceFingerprint: description.sourceFingerprint,
      stage: 'contract-validation',
      output: review,
      cause,
    });
  }
}

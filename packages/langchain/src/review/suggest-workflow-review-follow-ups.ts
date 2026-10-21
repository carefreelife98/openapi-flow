import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  createWorkflowReviewSuggestions,
  describeWorkflowReviewSuggestions,
} from '@openapi-flow/core';
import type { WorkflowReviewSuggestions } from '@openapi-flow/core';
import type {
  SuggestWorkflowReviewFollowUpsInput,
  WorkflowReviewSuggestionsModelOutput,
} from '../types/workflow-review-suggestions.js';
import type { WorkflowMessageSelectionOutput } from '../types/workflow-message-evidence-selection.js';
import { workflowReviewSuggestionsPrompt } from '../prompts/workflow-review-suggestions-prompt.js';
import { createWorkflowReviewSuggestionsSchema } from '../schemas/workflow-review-suggestions-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { WorkflowReviewSuggestionPlanningError } from './workflow-review-suggestion-planning-error.js';
import { resolveWorkflowReviewSuggestions } from './resolve-workflow-review-suggestions.js';

/** One fresh bounded call. An unselected suggestion never becomes intent or an executable edit. */
export async function suggestWorkflowReviewFollowUps(
  input: SuggestWorkflowReviewFollowUpsInput,
): Promise<WorkflowReviewSuggestions> {
  const description = describeWorkflowReviewSuggestions(input);
  if (!input.model || typeof input.model.withStructuredOutput !== 'function')
    throw new Error(
      'suggestWorkflowReviewFollowUps.model must support structured output',
    );
  const candidates = description.context.operations.map((operation, index) => ({
    candidateId: `candidate-${index + 1}`,
    operation,
  }));
  const schema = createWorkflowReviewSuggestionsSchema(
    description,
    candidates.map((candidate) => candidate.candidateId),
  );
  const output = await input.model
    .withStructuredOutput<
      WorkflowMessageSelectionOutput<WorkflowReviewSuggestionsModelOutput>
    >(serializeStructuredOutputSchema(schema, 'draft-7', 'input'), {
      name: 'suggest_workflow_review_follow_ups',
      method: 'jsonSchema',
      strict: true,
    })
    .invoke([
      new SystemMessage(workflowReviewSuggestionsPrompt),
      new HumanMessage(
        JSON.stringify({
          boundary: {
            contentRole: 'review-material-not-user-intent',
            kind: description.boundary.kind,
            questions: description.boundary.questions,
            data: description.boundary.data,
          },
          messages: description.context.messages,
          candidates: candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            method: candidate.operation.method,
            path: candidate.operation.path,
            summary: candidate.operation.operation.summary,
            description: candidate.operation.operation.description,
            tags: candidate.operation.operation.tags,
          })),
          capabilities: description.context.capabilities,
          entrypoint: description.context.entrypoint,
          limits: description.limits,
          options: description.options,
        }),
      ),
    ]);
  let proposal: WorkflowReviewSuggestionsModelOutput;
  try {
    proposal = parseStructuredOutput(
      schema,
      output,
      'workflow review follow-ups',
    );
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowReviewSuggestionPlanningError(
      { stage: 'proposal-schema', output },
      cause,
    );
  }
  try {
    if (
      description.fingerprint !==
      describeWorkflowReviewSuggestions(input).fingerprint
    )
      throw new Error(
        'Review sources changed during model invocation; no automatic rebase',
      );
    return createWorkflowReviewSuggestions({
      ...input,
      proposal: resolveWorkflowReviewSuggestions(input, proposal, candidates),
    });
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new WorkflowReviewSuggestionPlanningError(
      { stage: 'source-validation', output },
      cause,
    );
  }
}

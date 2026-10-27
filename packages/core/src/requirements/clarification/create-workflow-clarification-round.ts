import { createHash } from 'node:crypto';
import type {
  CreateWorkflowClarificationRoundInput,
  WorkflowClarificationRound,
} from '../../types/workflow-clarification.js';
import { createWorkflowRequirementsProposalSchema } from '../../schemas/create-workflow-requirements-proposal-schema.js';
import {
  workflowPlanningEvidenceSchema,
  workflowMessageEvidenceSchema,
} from '../../schemas/planning-evidence-schema.js';
import { clarificationQuestionLimitsSchema } from '../../schemas/workflow-clarification-settings-schema.js';
import { workflowPlanningContextFingerprintFromDescription } from '../../planning/evidence/workflow-planning-context-fingerprint.js';
import { describeWorkflowPlanningContext } from '../../planning/evidence/describe-workflow-planning-context.js';
import { validateDescribedWorkflowPlanningEvidence } from '../../planning/evidence/validate-workflow-planning-evidence.js';
import { resolveWorkflowClarificationOptions } from '../configuration/resolve-workflow-clarification-options.js';

/** The model proposes meaning; code validates sources and owns every identity. */
export function createWorkflowClarificationRound(
  input: CreateWorkflowClarificationRoundInput,
): WorkflowClarificationRound {
  const limits = clarificationQuestionLimitsSchema.parse(input.limits);
  const options = resolveWorkflowClarificationOptions(input.options);
  const context = describeWorkflowPlanningContext(input.context);
  const contextFingerprint =
    workflowPlanningContextFingerprintFromDescription(context);
  const explanationEvidence = workflowPlanningEvidenceSchema.transform(
    (evidence) => {
      validateDescribedWorkflowPlanningEvidence(context, [evidence]);
      return evidence;
    },
  );
  const proposal = createWorkflowRequirementsProposalSchema(
    limits,
    options,
    explanationEvidence,
    workflowMessageEvidenceSchema,
    false,
  ).parse(input.proposal);
  for (const statement of proposal.statements)
    validateDescribedWorkflowPlanningEvidence(context, statement.sources);
  const id =
    'clarification:' +
    createHash('sha256')
      .update(JSON.stringify([contextFingerprint, limits, options, proposal]))
      .digest('hex');
  return {
    id,
    contextFingerprint,
    sourceMessages: structuredClone(context.messages),
    limits,
    options,
    statements: proposal.statements.map((statement, index) => ({
      ...statement,
      id: `${id}:statement:${index + 1}`,
    })),
    categories: proposal.categories.map((category, categoryIndex) => ({
      ...category,
      id: `${id}:category:${categoryIndex + 1}`,
      questions: category.questions.map((question, questionIndex) => {
        const questionId = `${id}:question:${categoryIndex + 1}:${questionIndex + 1}`;
        return {
          ...question,
          id: questionId,
          answer:
            question.answer.kind === 'text'
              ? question.answer
              : {
                  ...question.answer,
                  choices: question.answer.choices.map(
                    (choice, choiceIndex) => ({
                      ...choice,
                      id: `${questionId}:choice:${choiceIndex + 1}`,
                    }),
                  ),
                },
        };
      }),
    })),
    ...(proposal.suggestions === undefined
      ? {}
      : {
          suggestions: proposal.suggestions.map((suggestion, index) => ({
            ...suggestion,
            id: `${id}:suggestion:${index + 1}`,
          })),
        }),
  };
}

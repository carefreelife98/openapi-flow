import type {
  ResolveWorkflowDraftApiCallBindingsInput,
  WorkflowDraftApiCallBindingResult,
  WorkflowDraftApiCallBindingChoice,
} from '../../../types/workflow-draft-api-call-planning.js';
import { describeWorkflowDraftApiCallBindings } from './describe-workflow-draft-api-call-bindings.js';
import { createWorkflowDraftApiCallBindingsSchema } from '../../../schemas/workflow-draft-api-call-bindings-schema.js';
import { resolveWorkflowDraftSourceEvidence } from '../references/resolve-workflow-draft-source-evidence.js';
import { jsonValuesEqual } from '../../../utils/json-values-equal.js';
import { createWorkflowDraftApiBindingQuestions } from './create-workflow-draft-api-binding-questions.js';
import { validateWorkflowDraftApiCallMappings } from './validate-workflow-draft-api-call-mappings.js';
import { workflowDraftApiBindingAnswersSchema } from '../../../schemas/workflow-draft-api-binding-answer-schema.js';

/** Check one target without fabricating calls for unrelated source nodes or changing any graph. */
export function resolveWorkflowDraftApiCallBindings(
  input: ResolveWorkflowDraftApiCallBindingsInput,
): WorkflowDraftApiCallBindingResult {
  const description = describeWorkflowDraftApiCallBindings(input);
  if (input.fingerprint !== description.fingerprint)
    throw new Error(
      'API call bindings fingerprint is stale or describes different staged materials',
    );
  const proposal = createWorkflowDraftApiCallBindingsSchema(input).parse(
    input.proposal,
  );
  if (!jsonValuesEqual(proposal, input.proposal))
    throw new Error(
      'API call bindings must validate without defaults, coercion or transformation',
    );
  const evidence = resolveWorkflowDraftSourceEvidence({
    description,
    decision: proposal.decision,
    capabilities: input.context.capabilities,
  });
  const mappings =
    description.hasRequestInputs &&
    description.sources.values.length > 0 &&
    description.inputIntent?.targets.length !== 0
      ? proposal.decision.mappings!
      : [];
  validateWorkflowDraftApiCallMappings(description, mappings);
  const answers =
    input.answers === undefined
      ? undefined
      : workflowDraftApiBindingAnswersSchema.parse(input.answers);
  if (proposal.decision.status === 'provided' && answers !== undefined)
    throw new Error('Binding answers require an original unresolved proposal');
  const questions =
    proposal.decision.status === 'needs-clarification'
      ? createWorkflowDraftApiBindingQuestions(
          description,
          proposal,
          mappings,
          evidence,
        )
      : [];
  if (description.inputIntent !== undefined) {
    const addressed = [
      ...mappings.map((mapping) => mapping.targetPointer),
      ...questions.map((question) => question.targetPointer),
    ];
    if (
      addressed.length !== description.inputIntent.targets.length ||
      description.inputIntent.targets.some(
        (target) => !addressed.includes(target),
      )
    )
      throw new Error(
        'API binding proposal must resolve or ask about every selected input-intent target exactly once',
      );
  }
  const answeredMappings = [...mappings];
  for (const answer of answers === undefined ? [] : answers) {
    const question = questions.find(
      (question) => question.id === answer.questionId,
    );
    if (!question)
      throw new Error(
        `Binding answer references an unknown or stale question: ${answer.questionId}`,
      );
    if (answer.kind === 'no-binding') continue;
    if (answer.kind === 'choose-source') {
      const choice = question.choices.find(
        (choice) => choice.id === answer.choiceId,
      );
      if (!choice)
        throw new Error(
          `Binding answer references an unknown source choice: ${answer.choiceId}`,
        );
      answeredMappings.push({
        targetPointer: question.targetPointer,
        sourceNodeId: choice.sourceNodeId,
        sourcePointer: choice.sourcePointer,
      });
    } else
      answeredMappings.push({
        targetPointer: question.targetPointer,
        sourceNodeId: answer.sourceNodeId,
        sourcePointer: answer.sourcePointer,
      });
  }
  const bindings = validateWorkflowDraftApiCallMappings(
    description,
    answeredMappings,
  );
  const pending = questions.filter(
    (question) => !answers?.some((answer) => answer.questionId === question.id),
  );
  const choice: WorkflowDraftApiCallBindingChoice =
    pending.length && proposal.decision.status === 'needs-clarification'
      ? {
          status: 'needs-clarification',
          mappings,
          questions: proposal.decision.questions,
        }
      : { status: 'provided', mappings: answeredMappings };
  const fields = {
    ...(description.inputIntent === undefined
      ? {}
      : { inputIntent: description.inputIntent }),
    fingerprint: description.fingerprint,
    proposal,
    decision: { ...choice, ...evidence },
    ...(answers === undefined ? {} : { answers }),
  };
  if (choice.status === 'needs-clarification')
    return {
      ...fields,
      status: 'needs-clarification',
      questions: pending,
    };
  return { ...fields, status: 'ready', bindings };
}

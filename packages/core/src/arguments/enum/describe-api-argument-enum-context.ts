import type { ApiArgumentEnumContextInput } from '../../types/api-argument-enum.js';
import type { ApiInputAnswerContext } from '../../types/api-input-answer-extraction.js';
import { describeApiLiteralGeneration } from '../generation/describe-api-literal-generation.js';
import { inspectApiArgumentRequirements } from '../clarification/inspect-api-argument-requirements.js';
import { describeApiInputEnumAnswerChoices } from './describe-api-input-enum-answer-choices.js';
import { applyConfirmedApiInputs } from '../clarification/apply-confirmed-api-inputs.js';
import { resolveApiLiteralProposalSources } from '../sources/resolve-api-literal-proposal-sources.js';
import { expandRequestedEnumRequirements } from './expand-requested-enum-requirements.js';
import { requestedApiInputsSchema } from '../../schemas/requested-api-inputs-schema.js';

/** Derive real unanswered OAS enum questions, not a synthetic draft/edit plan. */
export function describeApiArgumentEnumContext(
  input: ApiArgumentEnumContextInput,
): ApiInputAnswerContext {
  const { input: snapshot, contract } = describeApiLiteralGeneration(input);
  const proposal = contract.schema.parse(input.proposal);
  resolveApiLiteralProposalSources({
    callId: snapshot.callId,
    values: proposal.values,
    sources: input.literalSources,
    messages:
      snapshot.literalSourceMessages === undefined
        ? [{ id: 'scenario', text: snapshot.scenario }]
        : snapshot.literalSourceMessages,
  });
  const values = applyConfirmedApiInputs({
    ...snapshot,
    values: proposal.values,
  });
  const inspected = inspectApiArgumentRequirements({
    ...snapshot,
    values,
    requestedInputs: input.requestedInputs,
  });
  const context: ApiInputAnswerContext = {
    reply: snapshot.scenario,
    ...(snapshot.literalSourceMessages === undefined
      ? {}
      : { sourceMessages: snapshot.literalSourceMessages }),
    requirements: expandRequestedEnumRequirements({
      ...input,
      values,
      requirements: inspected.requirements,
    }),
    selectOasEnums: true,
    ...(snapshot.purpose === undefined ? {} : { purpose: snapshot.purpose }),
  };
  const ids = new Set(
    describeApiInputEnumAnswerChoices(context).map(
      (choice) => choice.requirementId,
    ),
  );
  const requirements = context.requirements.filter((item) => ids.has(item.id));
  if (input.enumIntentInputs === undefined) return { ...context, requirements };
  const selected = requestedApiInputsSchema.safeParse(input.enumIntentInputs);
  if (!selected.success)
    throw new Error(
      'API enumIntentInputs must contain distinct non-root JSON Pointers',
      { cause: selected.error },
    );
  for (const pointer of selected.data)
    if (!requirements.some((item) => item.targetPointer === pointer))
      throw new Error(
        `API enumIntentInputs ${pointer} is not an unanswered OAS enum input for ${snapshot.callId}`,
      );
  return {
    ...context,
    requirements: requirements.filter((item) =>
      selected.data.includes(item.targetPointer),
    ),
  };
}

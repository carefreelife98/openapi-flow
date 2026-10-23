import type {
  ResolveApiArgumentEnumInterpretationInput,
  ApiArgumentEnumResolution,
} from '../../types/api-argument-enum.js';
import { describeApiArgumentEnumContext } from './describe-api-argument-enum-context.js';
import { validateApiInputAnswerAnalysis } from '../clarification/extraction/validate-api-input-answer-analysis.js';
import { assignApiInputValue } from '../clarification/assign-api-input-value.js';
import { inspectApiArgumentRequirements } from '../clarification/inspect-api-argument-requirements.js';
import { applyConfirmedApiInputs } from '../clarification/apply-confirmed-api-inputs.js';

/** Replay copied OAS values against independently supplied input; keep semantic evidence separate. */
export function resolveApiArgumentEnumInterpretation(
  input: ResolveApiArgumentEnumInterpretationInput,
): ApiArgumentEnumResolution {
  const context = describeApiArgumentEnumContext(input);
  validateApiInputAnswerAnalysis({ ...context, analysis: input.analysis });
  const values = applyConfirmedApiInputs({
    ...input,
    values: input.proposal.values,
  });
  for (const answer of input.analysis.answers) {
    const requirement = context.requirements.find(
      (item) => item.id === answer.requirementId,
    );
    if (!requirement)
      throw new Error(
        `API enum answer ${answer.requirementId} has no current OAS requirement`,
      );
    assignApiInputValue(
      values,
      requirement.targetPointer,
      structuredClone(answer.value),
      input,
    );
  }
  const inspected = inspectApiArgumentRequirements({ ...input, values });
  return {
    values,
    unresolvedInputs: inspected.requirements.map((item) => item.targetPointer),
    interpretation: structuredClone({ ...context, analysis: input.analysis }),
  };
}

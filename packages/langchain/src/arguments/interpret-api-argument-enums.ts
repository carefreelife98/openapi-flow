import {
  describeApiArgumentEnumContext,
  resolveApiArgumentEnumInterpretation,
} from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import type { InterpretApiArgumentEnumsInput } from '../types/argument-generation.js';
import { analyzeApiInputAnswers } from './analyze-api-input-answers.js';

/** An opt-in semantic stage for actual unanswered enum questions, not an invalid-output retry. */
export async function interpretApiArgumentEnums(
  input: InterpretApiArgumentEnumsInput,
): Promise<ApiCallArguments> {
  const material = {
    ...input,
    requestedInputs: input.arguments.requestedInputs,
  };
  const context = describeApiArgumentEnumContext(material);
  if (!context.requirements.length) return input.arguments;
  const analysis = await analyzeApiInputAnswers({
    ...context,
    model: input.model,
    includeExplanations: input.includeExplanations,
    signal: input.signal,
  });
  const resolved = resolveApiArgumentEnumInterpretation({
    ...material,
    analysis,
  });
  return {
    ...input.arguments,
    values: resolved.values,
    unresolvedInputs: resolved.unresolvedInputs,
    enumInterpretation: resolved.interpretation,
  };
}

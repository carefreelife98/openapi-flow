import type { ApiInputAnswer } from '@openapi-flow/core';
import type { ExtractApiInputAnswersInput } from '../types/api-input-answers.js';
import { analyzeApiInputAnswers } from './analyze-api-input-answers.js';

export async function extractApiInputAnswers(
  input: ExtractApiInputAnswersInput,
): Promise<ApiInputAnswer[]> {
  return (await analyzeApiInputAnswers(input)).answers;
}

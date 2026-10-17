import type { z } from 'zod';
import type { ApiArgumentProposal } from '../types/api-arguments.js';
import { createApiArgumentGenerationContract } from './create-api-argument-generation-contract.js';
import type { ApiArgumentGenerationInput } from '../types/api-clarification.js';

export function createApiArgumentsSchema(
  input: ApiArgumentGenerationInput,
): z.ZodType<ApiArgumentProposal> {
  return createApiArgumentGenerationContract(input).schema;
}

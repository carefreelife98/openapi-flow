import type { z } from 'zod';
import type {
  ApiArgumentProposal,
  ApiArgumentsSchemaInput,
} from '../types/api-arguments.js';
import { createApiArgumentGenerationContract } from './create-api-argument-generation-contract.js';

export function createApiArgumentsSchema(
  input: ApiArgumentsSchemaInput,
): z.ZodType<ApiArgumentProposal> {
  return createApiArgumentGenerationContract(input).schema;
}

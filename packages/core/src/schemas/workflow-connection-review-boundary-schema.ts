import { z } from 'zod';

/** Explicit host policy, never inferred from a model verdict or checkpoint flag. */
export const workflowConnectionReviewBoundarySchema =
  z.literal('declared-contract');

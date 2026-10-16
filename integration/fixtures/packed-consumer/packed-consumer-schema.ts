import { z } from 'zod';

export const packedConsumerFixtureSchema = z.strictObject({
  operationRef: z.string().min(1),
  argumentProposal: z.json(),
});

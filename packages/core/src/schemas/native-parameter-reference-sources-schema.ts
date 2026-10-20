import { z } from 'zod';

export const nativeParameterReferenceSourcesSchema = z
  .array(z.enum(['response', 'node-output', 'exclusive-output']))
  .refine(
    (sources) => new Set(sources).size === sources.length,
    'Duplicate native parameter reference source',
  );

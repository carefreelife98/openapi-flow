import { z } from 'zod';

export const nativeMaterialRequirementsSchema = z
  .array(
    z.strictObject({
      field: z.enum(['apiMaterials', 'nativeOutputs']),
      minimumItems: z.number().int().positive(),
    }),
  )
  .refine(
    (requirements) =>
      new Set(requirements.map((entry) => entry.field)).size ===
      requirements.length,
    'Native material requirements must name distinct source collections',
  );

import { z } from 'zod';
import type { ApiInputRequirement } from '../types/api-clarification.js';
import { createOasValueSchema } from './create-oas-value-schema.js';

export function createApiInputAnswersSchema(
  requirements: ApiInputRequirement[],
) {
  if (
    !Array.isArray(requirements) ||
    !requirements.length ||
    new Set(requirements.map((item) => item.id)).size !== requirements.length
  )
    throw new Error('Answer schema requires distinct pending requirements');
  const alternatives = requirements.map((requirement) =>
    z.strictObject({
      requirementId: z.literal(requirement.id).describe(requirement.message),
      value: createOasValueSchema(
        requirement.schema,
        requirement.openapiVersion.startsWith('3.0.')
          ? 'openapi-3.0'
          : 'draft-2020-12',
        requirement.targetPointer,
      ).describe(
        'Only the value explicitly supplied by the current user reply for this requested input.',
      ),
    }),
  );
  return z.strictObject({
    answers: z
      .array(
        alternatives.length === 1 ? alternatives[0] : z.union(alternatives),
      )
      .describe(
        'Return only explicitly answered pending inputs. Return [] when no requested value is supplied; do not invent values or copy OAS examples/defaults.',
      ),
  });
}

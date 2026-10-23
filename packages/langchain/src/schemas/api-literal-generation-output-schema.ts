import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  apiInputLiteralSourceSchema,
} from '@openapi-flow/core';
import type {
  ApiArgumentGenerationContract,
  JsonObject,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutputSchema } from '../types/argument-generation.js';

export const apiLiteralGenerationOptionsSchema = z.strictObject({
  includeExplanations: z.boolean().optional(),
  selectOasEnums: z.boolean().optional(),
  trackRequestedInputs: z.boolean().optional(),
});

export const apiLiteralGenerationReasonSchema = z.strictObject({
  reason: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0)
    .describe(
      'Brief user-facing reason in the scenario language for these proposed literals or their deliberate omission. It applies only to values in this proposal, not confirmed inputs or preceding-node bindings. Code attaches the original scenario, optional call role and the actual projected literal input contract. Do not generate evidence, source quotes, OAS schemas, metadata, missing-input reports or private chain-of-thought.',
    ),
});

export const apiLiteralGenerationSourcesSchema = z.array(
  apiInputLiteralSourceSchema.extend({
    targetPointer: z
      .string()
      .describe(
        'RFC 6901 pointer relative to values, e.g. /query/id, never /values/query/id. Cover each proposed literal leaf or an explicitly quoted whole object/array. Code verifies exact occurrence, JSON type equality and complete coverage. The original scenario is the only source; purpose and OAS values are not literal quotations.',
      ),
  }),
);

/** The core values schema is unchanged; only optional human-readable attribution is added. */
export function createApiLiteralGenerationOutputSchema(
  contract: ApiArgumentGenerationContract,
  includeExplanations: boolean,
  requestSchema?: JsonObject,
): ApiLiteralGenerationOutputSchema {
  z.boolean().parse(includeExplanations);
  if (requestSchema !== undefined) {
    const schema = contract.schema.extend({
      literalSources: apiLiteralGenerationSourcesSchema,
      requestedInputs: z
        .array(createApiRequestInputPointerSchema(requestSchema))
        .refine((pointers) => new Set(pointers).size === pointers.length)
        .describe(
          'Exact OAS request pointers explicitly requested for this call, even when the value is not given verbatim. Include requested optional inputs. Do not select unrequested filters, OAS defaults or examples. Code validates the original OAS and missing presence. This field contains paths, never values or bindings.',
        ),
    });
    return includeExplanations && contract.hasLiteralInputs
      ? schema.extend({ explanation: apiLiteralGenerationReasonSchema })
      : schema;
  }
  return includeExplanations && contract.hasLiteralInputs
    ? contract.schema.extend({ explanation: apiLiteralGenerationReasonSchema })
    : contract.schema;
}

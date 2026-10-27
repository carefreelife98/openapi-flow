import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  apiInputLiteralSourceSchema,
  optionalPlanningExplanationObjectSchema,
} from '@openapi-flow/core';
import type {
  ApiArgumentGenerationContract,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type {
  ApiLiteralGenerationOutputSchema,
  ApiLiteralGenerationSource,
} from '../types/argument-generation.js';

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
        'RFC 6901 pointer relative to values, e.g. /query/id, never /values/query/id. Cover each proposed literal leaf or an explicitly quoted whole object/array. Code verifies exact occurrence, JSON type equality and complete coverage. Use literalSourceMessages when supplied; otherwise use the original scenario. Purpose, OAS and feedback are not literal quotations.',
      ),
  }),
);

function createLiteralSourcesSchema(
  messages?: WorkflowSourceMessage[],
): z.ZodType<ApiLiteralGenerationSource[]> {
  if (messages === undefined || messages.length === 1)
    return apiLiteralGenerationSourcesSchema.min(1);
  const ids = messages.map((message) => message.id);
  return z
    .array(
      apiLiteralGenerationSourcesSchema.element.extend({
        messageId: z
          .enum(ids)
          .describe(
            'Select the supplied original message containing this exact quotation. Never cite scenario context or feedback instead.',
          ),
      }),
    )
    .min(1);
}

export const apiLiteralNotProvidedSchema = z.strictObject({
  state: z
    .literal('not-provided')
    .describe(
      'No request literal was supplied by the scenario for this call. Code owns the empty values and source list. Do not supply a placeholder body, values, or literalSources in this decision.',
    ),
});

export function createApiLiteralProvidedSchema(
  contract: ApiArgumentGenerationContract,
  messages?: WorkflowSourceMessage[],
) {
  return z.strictObject({
    state: z.literal('provided'),
    values: contract.valuesSchema.refine(
      (values) =>
        Object.entries(values).some(
          ([group, value]) =>
            group === 'body' ||
            (value !== null &&
              typeof value === 'object' &&
              Object.keys(value).length > 0),
        ),
      'Provided literals require an actual request value, not empty parameter-location containers.',
    ),
    literalSources: createLiteralSourcesSchema(messages).describe(
      'Every provided literal, including an empty object, empty array, empty string or null, needs its original exact user source. Never use a source-free placeholder.',
    ),
  });
}

export function createApiTrackedLiteralGenerationSchema(
  contract: ApiArgumentGenerationContract,
  requestSchema: JsonObject,
  messages?: WorkflowSourceMessage[],
) {
  const provided = createApiLiteralProvidedSchema(contract, messages);
  const schema = z.strictObject({
    literalInputs: z.union([apiLiteralNotProvidedSchema, provided]),
    requestedInputs: z
      .array(createApiRequestInputPointerSchema(requestSchema))
      .refine((pointers) => new Set(pointers).size === pointers.length)
      .describe(
        'Exact OAS request pointers explicitly requested for this call, even when the value is not given verbatim. Include requested optional inputs. Do not select unrequested filters, OAS defaults or examples. Code validates the original OAS and missing presence. This field contains paths, never values or bindings.',
      ),
  });
  return schema;
}

export function createApiExplainedTrackedLiteralGenerationSchema(
  contract: ApiArgumentGenerationContract,
  requestSchema: JsonObject,
  messages?: WorkflowSourceMessage[],
  requireExplanations = true,
) {
  return createApiTrackedLiteralGenerationSchema(
    contract,
    requestSchema,
    messages,
  ).extend({
    explanation: requireExplanations
      ? apiLiteralGenerationReasonSchema
      : optionalPlanningExplanationObjectSchema,
  });
}

/** Tracked generation separates absence from literal empty values; the OAS value contract stays unchanged. */
export function createApiLiteralGenerationOutputSchema(
  contract: ApiArgumentGenerationContract,
  includeExplanations: boolean,
  requestSchema?: JsonObject,
  messages?: WorkflowSourceMessage[],
  requireExplanations = true,
): ApiLiteralGenerationOutputSchema {
  z.boolean().parse(includeExplanations);
  if (requestSchema !== undefined)
    return includeExplanations && contract.hasLiteralInputs
      ? createApiExplainedTrackedLiteralGenerationSchema(
          contract,
          requestSchema,
          messages,
          requireExplanations,
        )
      : createApiTrackedLiteralGenerationSchema(
          contract,
          requestSchema,
          messages,
        );
  return includeExplanations && contract.hasLiteralInputs
    ? contract.schema.extend({
        explanation: requireExplanations
          ? apiLiteralGenerationReasonSchema
          : optionalPlanningExplanationObjectSchema,
      })
    : contract.schema;
}

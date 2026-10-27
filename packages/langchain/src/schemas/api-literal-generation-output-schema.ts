import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationObjectSchema,
} from '@openapi-flow/core';
import type {
  ApiArgumentGenerationContract,
  JsonObject,
  WorkflowSourceMessage,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutputSchema } from '../types/argument-generation.js';
import { createApiLiteralSourceSelectionsSchema } from './api-literal-source-selection-schema.js';

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

export const apiLiteralNotProvidedSchema = z.strictObject({
  state: z
    .literal('not-provided')
    .describe(
      'No actual request literal was selected by the user for this call. Examples, unchosen alternatives and values the user will supply later are not selected literals. Code owns the empty values and source list. Do not supply a placeholder body, values, or literalSources in this decision.',
    ),
});

export function createApiLiteralProvidedSchema(
  contract: ApiArgumentGenerationContract,
  messages: WorkflowSourceMessage[],
) {
  return z.strictObject({
    state: z
      .literal('provided')
      .describe(
        'The user explicitly directs using these actual values for this call. Source occurrence alone does not turn an example, an unchosen alternative or a future input into a selected literal.',
      ),
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
    literalSources: createApiLiteralSourceSelectionsSchema(messages).describe(
      'Attribute each proposed literal to an original message without re-generating quotations. Select a JSON candidate for JSON values or text for an exact unquoted string. Code creates and verifies the source text.',
    ),
  });
}

export function createApiEnumIntentInputsSchema(requestSchema: JsonObject) {
  return z
    .array(createApiRequestInputPointerSchema(requestSchema))
    .refine((pointers) => new Set(pointers).size === pointers.length)
    .describe(
      'Only missing input paths whose actual requested value meaning is expressed in natural language and therefore needs OAS enum interpretation. Code includes these paths in requested-input presence; do not duplicate them solely for that purpose. Return [] for unknown values, examples, unchosen alternatives or values to supply later. Requiredness or a requested field name is not a supplied value meaning. Do not include already supplied literals, confirmed inputs or bindings. Code schedules the next semantic call only for this explicit list and validates each path against unanswered OAS enum contracts.',
    );
}

export function createApiTrackedLiteralGenerationSchema(
  contract: ApiArgumentGenerationContract,
  requestSchema: JsonObject,
  messages: WorkflowSourceMessage[],
  selectOasEnums = false,
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
  return selectOasEnums
    ? schema.extend({
        enumIntentInputs: createApiEnumIntentInputsSchema(requestSchema),
      })
    : schema;
}

export function createApiExplainedTrackedLiteralGenerationSchema(
  contract: ApiArgumentGenerationContract,
  requestSchema: JsonObject,
  messages: WorkflowSourceMessage[],
  requireExplanations = true,
  selectOasEnums = false,
) {
  return createApiTrackedLiteralGenerationSchema(
    contract,
    requestSchema,
    messages,
    selectOasEnums,
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
  selectOasEnums = false,
): ApiLiteralGenerationOutputSchema {
  z.boolean().parse(includeExplanations);
  if (requestSchema !== undefined) {
    if (messages === undefined)
      throw new Error(
        'Tracked literal generation requires original source messages',
      );
    return includeExplanations && contract.hasLiteralInputs
      ? createApiExplainedTrackedLiteralGenerationSchema(
          contract,
          requestSchema,
          messages,
          requireExplanations,
          selectOasEnums,
        )
      : createApiTrackedLiteralGenerationSchema(
          contract,
          requestSchema,
          messages,
          selectOasEnums,
        );
  }
  return includeExplanations && contract.hasLiteralInputs
    ? contract.schema.extend({
        explanation: requireExplanations
          ? apiLiteralGenerationReasonSchema
          : optionalPlanningExplanationObjectSchema,
      })
    : contract.schema;
}

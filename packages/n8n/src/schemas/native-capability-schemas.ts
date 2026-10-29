import { z } from 'zod';

// Disjoint source literals retain the same validation contract with anyOf.
// OpenAI-compatible strict tools reject the oneOf emitted by discriminatedUnion.
export const nativeResponseOperandSchema = z.strictObject({
  source: z.literal('response'),
  nodeId: z
    .string()
    .min(1)
    .describe('API callId whose response is guaranteed to have executed.'),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into the response body. Empty string means the whole body.',
    ),
});
export const nativeLiteralOperandSchema = z.strictObject({
  source: z.literal('literal'),
  value: z
    .union([z.string(), z.number(), z.boolean(), z.null()])
    .describe(
      'An explicitly requested scalar comparison value; no expressions or code.',
    ),
});
export const nativeOutputOperandSchema = z.strictObject({
  source: z.literal('node-output'),
  nodeId: z
    .string()
    .min(1)
    .describe(
      'Exact actual native JSON producer ID, not an API or future role.',
    ),
  pointer: z
    .string()
    .describe(
      'RFC 6901 pointer into that declared native output; no coercion or inferred field mapping.',
    ),
});
export const nativeOperandSchema = z.union([
  nativeResponseOperandSchema,
  nativeLiteralOperandSchema,
  nativeOutputOperandSchema,
]);

export const nativeCheckSchema = z.strictObject({
  left: nativeOperandSchema,
  operator: z
    .enum(['equals', 'notEquals', 'greaterThan', 'lessThan', 'keysEqual'])
    .describe(
      'equals is deep, type-strict JSON equality. keysEqual compares object key sets. Numeric operators require numbers.',
    ),
  right: nativeOperandSchema,
});
/** Unary predicates inspect declared pointers without requiring a comparison value. */
export const nativePresenceCheckSchema = z.strictObject({
  left: z.union([nativeResponseOperandSchema, nativeOutputOperandSchema]),
  operator: z
    .enum(['exists', 'notExists', 'isEmpty', 'isNotEmpty'])
    .describe(
      'exists excludes missing and null. isEmpty accepts missing, null, empty string, array or object. No conversion or replacement values.',
    ),
});
export const nativeConditionSchema = z.union([
  nativeCheckSchema,
  nativePresenceCheckSchema,
]);
export const ifParametersSchema = z.strictObject({
  combinator: z
    .enum(['and', 'or'])
    .describe('Combine all conditions. Outputs: true, false; input: main.'),
  conditions: z
    .array(nativeConditionSchema)
    .min(1)
    .describe(
      'Only conditions required by the scenario, with OAS-derived response pointers.',
    ),
});
export const mergeParametersSchema = z.strictObject({
  numberInputs: z
    .number()
    .int()
    .min(2)
    .describe(
      'Append waits for ALL inputs named input1..inputN. Output: main. Never join mutually exclusive branches.',
    ),
});
export const assertionParametersSchema = z.strictObject({
  checks: z
    .array(
      nativeCheckSchema.extend({
        message: z
          .string()
          .min(1)
          .describe('Actionable failure message for this scenario assertion.'),
      }),
    )
    .min(1)
    .describe(
      'Declarative assertions over API responses; compiled to Code by the library, never model-written JavaScript. Input/output: main.',
    ),
});
export const stopParametersSchema = z.strictObject({
  message: z
    .string()
    .min(1)
    .describe(
      'StopAndError message when this branch executes. Input: main; no output.',
    ),
});
export const passThroughParametersSchema = z.strictObject({});

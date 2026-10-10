import { z } from 'zod';

// Disjoint source literals retain the same validation contract with anyOf.
// OpenAI-compatible strict tools reject the oneOf emitted by discriminatedUnion.
export const nativeOperandSchema = z.union([
  z.strictObject({
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
  }),
  z.strictObject({
    source: z.literal('literal'),
    value: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .describe(
        'An explicitly requested scalar comparison value; no expressions or code.',
      ),
  }),
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
export const ifParametersSchema = z.strictObject({
  combinator: z
    .enum(['and', 'or'])
    .describe('Combine all conditions. Outputs: true, false; input: main.'),
  conditions: z
    .array(nativeCheckSchema)
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

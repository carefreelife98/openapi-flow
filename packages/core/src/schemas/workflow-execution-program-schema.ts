import { z } from 'zod';

const nodeId = z.string().min(1);
export const workflowExecutionBlockSchema = z.union([
  z.strictObject({ kind: z.literal('node'), nodeId }),
  z.strictObject({ kind: z.literal('empty') }),
  z.strictObject({
    kind: z.literal('sequence'),
    get steps() {
      return z.array(workflowExecutionBlockSchema).min(1);
    },
  }),
  z.strictObject({
    kind: z.literal('parallel'),
    get branches() {
      return z.array(workflowExecutionBlockSchema).min(2);
    },
    join: z.union([
      z.strictObject({ kind: z.literal('node'), nodeId }),
      z.strictObject({ kind: z.literal('barrier') }),
      z.strictObject({ kind: z.literal('none') }),
    ]),
  }),
  z.strictObject({
    kind: z.literal('branch'),
    nodeId,
    get paths() {
      return z
        .array(
          z.strictObject({
            output: z.string().min(1),
            body: workflowExecutionBlockSchema,
          }),
        )
        .min(2);
    },
  }),
]);
export const workflowExecutionProgramSchema = z.strictObject({
  kind: z.literal('execution-program'),
  body: workflowExecutionBlockSchema,
});
export const workflowProgramLimitsSchema = z.strictObject({
  maxDepth: z.int().positive(),
  maxBlocks: z.int().positive(),
});

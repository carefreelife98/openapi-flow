import { z } from 'zod';
import type {
  WorkflowExecutionBlock,
  WorkflowExecutionProgram,
  WorkflowExecutionProgramDescription,
} from '@openapi-flow/core';

/** Compact recursive control grammar. IDs and branch labels come from actual supplied contracts. */
export function createWorkflowExecutionProgramSchema(
  description: WorkflowExecutionProgramDescription,
): z.ZodType<WorkflowExecutionProgram> {
  const nodes = description.context.nodes;
  const ordinary = nodes.filter(
    (n) =>
      !n.waitsForAllInputs &&
      !n.exclusiveOutputPorts &&
      n.inputs.length <= 1 &&
      n.outputs.length <= 1,
  );
  const joins = nodes.filter(
    (n) =>
      n.waitsForAllInputs &&
      n.inputs.length >= 2 &&
      n.outputs.length === 1 &&
      !n.exclusiveOutputPorts,
  );
  const conditional = nodes.filter(
    (n) => n.exclusiveOutputPorts && n.outputs.length >= 2,
  );
  const block: z.ZodType<WorkflowExecutionBlock> = z.lazy(() =>
    z.union([
      ...(ordinary.length
        ? [
            z.strictObject({
              kind: z.literal('node'),
              nodeId: z.enum(ordinary.map((n) => n.id)),
            }),
          ]
        : []),
      z.strictObject({ kind: z.literal('empty') }),
      z.strictObject({
        kind: z.literal('sequence'),
        steps: z.array(block).min(1),
      }),
      z.strictObject({
        kind: z.literal('parallel'),
        branches: z.array(block).min(2),
        join: z.strictObject({ kind: z.literal('none') }),
      }),
      ...joins.map((join) =>
        z.strictObject({
          kind: z.literal('parallel'),
          branches: z.array(block).length(join.inputs.length),
          join: z.strictObject({
            kind: z.literal('node'),
            nodeId: z.literal(join.id),
          }),
        }),
      ),
      ...(description.controlsAvailable
        ? [
            z.strictObject({
              kind: z.literal('parallel'),
              branches: z.array(block).min(2),
              join: z.strictObject({ kind: z.literal('barrier') }),
            }),
          ]
        : []),
      ...conditional.map((n) =>
        z.strictObject({
          kind: z.literal('branch'),
          nodeId: z.literal(n.id),
          paths: z
            .array(z.strictObject({ output: z.enum(n.outputs), body: block }))
            .length(n.outputs.length),
        }),
      ),
    ]),
  );
  return z.strictObject({ kind: z.literal('execution-program'), body: block });
}

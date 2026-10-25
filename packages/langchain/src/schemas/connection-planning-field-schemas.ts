import { z } from 'zod';
import type { WorkflowPlanNodeContract } from '@openapi-flow/core';
import type { WorkflowConnectionEndpointSelection } from '../types/incremental-connection-planning.js';

export const connectionDecisionTextSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);

export function connectionChoicesSchema<Output>(
  choices: z.ZodType<Output>[],
): z.ZodType<Output> {
  if (!choices.length)
    throw new Error('Connection schema requires an available choice');
  return choices.length === 1 ? choices[0]! : z.union(choices);
}

export function connectionIdListSchema(ids: string[]): z.ZodType<string[]> {
  return ids.length ? z.array(z.enum(ids)) : z.array(z.string()).max(0);
}

/** A single port is a code-owned fact. Only a genuine port choice is generated. */
export function connectionPortSelectionListSchema(
  nodes: WorkflowPlanNodeContract[],
  direction: 'inputs' | 'outputs',
): z.ZodArray<z.ZodType<WorkflowConnectionEndpointSelection>> {
  const choices = nodes
    .filter((node) => node[direction].length)
    .map((node) => {
      const identity = z.strictObject({ nodeId: z.literal(node.id) });
      return node[direction].length === 1
        ? identity
        : identity.extend({ port: z.enum(node[direction]) });
    });
  return choices.length
    ? z.array(
        connectionChoicesSchema<WorkflowConnectionEndpointSelection>(choices),
      )
    : z.array(z.strictObject({ nodeId: z.string() })).max(0);
}

import { z } from 'zod';
import { describeWorkflowConnectionCandidates } from '@openapi-flow/core';
import type {
  WorkflowConnectionRegionContext,
  WorkflowConnectionOutlineBundleDescription,
  WorkflowConnectionPortCandidate,
} from '@openapi-flow/core';
import type {
  WorkflowConnectionRegionSelection,
  WorkflowConnectionRegionNodeSelection,
  WorkflowConnectionEndpointSelection,
} from '../types/incremental-connection-planning.js';
import {
  connectionChoicesSchema,
  connectionDecisionTextSchema as text,
} from './connection-planning-field-schemas.js';

/** Node-local intent removes redundant target IDs; shared source schemas use local JSON references. */
export function createWorkflowConnectionRegionSelectionSchema(
  description: WorkflowConnectionRegionContext,
  outline?: WorkflowConnectionOutlineBundleDescription,
): z.ZodType<WorkflowConnectionRegionSelection> {
  const nodes = description.context.nodes;
  const groups = describeWorkflowConnectionCandidates(description);
  const focus =
    outline === undefined ? undefined : new Set(outline.bundle.nodeIds);
  const cache = new Map<
    string,
    z.ZodType<WorkflowConnectionEndpointSelection>
  >();
  function sourceSchema(
    candidates: WorkflowConnectionPortCandidate[],
  ): z.ZodType<WorkflowConnectionEndpointSelection> {
    const key = JSON.stringify(
      candidates.map((node) => [node.id, node.outputs]),
    );
    const saved = cache.get(key);
    if (saved) return saved;
    const choices = candidates.map((node) => {
      const original = nodes.find((original) => original.id === node.id)!;
      const identity = z.strictObject({ nodeId: z.literal(node.id) });
      return original.outputs.length === 1
        ? identity
        : identity.extend({ port: z.enum(node.outputs) });
    });
    const schema =
      connectionChoicesSchema<WorkflowConnectionEndpointSelection>(choices);
    cache.set(key, schema);
    return schema;
  }
  const choices: z.ZodType<WorkflowConnectionRegionNodeSelection>[] = nodes.map(
    (target) => {
      const inputs = target.inputs.flatMap((input) => {
        const permitted = new Map<string, WorkflowConnectionPortCandidate>();
        for (const group of groups)
          if (
            group.targets.some(
              (node) => node.id === target.id && node.inputs.includes(input),
            )
          )
            for (const source of group.sources) {
              const outputs =
                focus === undefined ||
                focus.has(target.id) ||
                focus.has(source.id)
                  ? source.outputs
                  : source.outputs.filter((output) =>
                      description.edgeCatalog.some(
                        ({ edge }) =>
                          edge.from === source.id &&
                          edge.output === output &&
                          edge.to === target.id &&
                          edge.input === input,
                      ),
                    );
              if (outputs.length)
                permitted.set(source.id, { ...source, outputs });
            }
        if (!permitted.size) return [];
        const basic = z.strictObject({
          source: sourceSchema([...permitted.values()]),
        });
        return [
          target.inputs.length === 1
            ? basic
            : basic.extend({ input: z.literal(input) }),
        ];
      });
      const incoming = inputs.length
        ? z.array(connectionChoicesSchema(inputs))
        : z
            .array(
              z.strictObject({
                source: z.strictObject({ nodeId: z.string() }),
              }),
            )
            .max(0);
      const eligible =
        !target.waitsForAllInputs &&
        target.rejoinsExclusiveOutputs === undefined &&
        !target.references.length &&
        !target.dependencyNodeIds.length &&
        !Object.values(target.inputReferences ?? {}).some(
          (refs) => refs.length,
        );
      const base = z.strictObject({
        nodeId: z.literal(target.id),
        incoming,
        root: eligible ? z.boolean() : z.literal(false),
      });
      return target.outputs.length === 1
        ? base.extend({ finish: z.boolean() })
        : base.extend({
            finishOutputs: target.outputs.length
              ? z.array(z.enum(target.outputs))
              : z.array(z.string()).max(0),
          });
    },
  );
  for (const node of description.retiredNodes ?? [])
    choices.push(
      z.strictObject({
        nodeId: z.literal(node.id),
        incoming: z
          .array(
            z.strictObject({ source: z.strictObject({ nodeId: z.string() }) }),
          )
          .max(0),
        root: z.literal(false),
        finishOutputs: z.array(z.string()).max(0),
      }),
    );
  return z.strictObject({
    kind: z.literal('set-region'),
    nodes: z
      .array(connectionChoicesSchema(choices))
      .min(1)
      .describe(
        'One distinct entry per owned target. Supply its complete desired incoming connections, independent root intent and finish intent. Unselected nodes retain their state. Code derives changes; never generate a delta.',
      ),
    factIds: z
      .array(z.enum(description.requirements.map((fact) => fact.id)))
      .min(1),
    reason: text,
  });
}

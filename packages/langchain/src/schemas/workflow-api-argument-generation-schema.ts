import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  describeApiLiteralGeneration,
  describeWorkflowApiArgumentTargets,
  describeWorkflowInputSourceChoices,
  workflowApiArgumentPlanSchema,
} from '@openapi-flow/core';
import type {
  WorkflowApiArgumentContext,
  WorkflowInputSelection,
  WorkflowApiArgumentPlanProposal,
  JsonObject,
} from '@openapi-flow/core';

/** Target and source references share one typed choice. Code owns both endpoints. */
export function createWorkflowApiArgumentGenerationSchema(
  input: WorkflowApiArgumentContext,
): z.ZodType<WorkflowApiArgumentPlanProposal> {
  const text = input.catalog.sources.flatMap((entry) =>
    entry.sources.text.map((segment) =>
      z.strictObject({
        kind: z.literal('text'),
        sourceId: z.literal(segment.id),
        startTokenId: z.enum(segment.tokens.map((token) => token.id)),
        endTokenId: z.enum(segment.tokens.map((token) => token.id)),
      }),
    ),
  );
  const sourceSchemas = new Map<
    string,
    z.ZodType<WorkflowInputSelection> | null
  >();
  const sourceSchema = (types: string[]) => {
    const key = JSON.stringify(types);
    const cached = sourceSchemas.get(key);
    if (cached !== undefined) return cached;
    const candidates = describeWorkflowInputSourceChoices(
      input.catalog,
      types,
    ).json;
    const choices: z.ZodType<WorkflowInputSelection>[] = types.includes(
      'string',
    )
      ? [...text]
      : [];
    if (candidates.length)
      choices.push(
        z.strictObject({
          kind: z.literal('json'),
          sourceId: z.enum(candidates.map((candidate) => candidate.id)),
        }),
      );
    const schema = choices.length ? z.union(choices) : null;
    sourceSchemas.set(key, schema);
    return schema;
  };
  const calls = Object.fromEntries(
    input.calls.map((call) => {
      const material = {
        ...call,
        scenario: input.scenario,
        literalSourceMessages: input.catalog.messages,
      };
      const description = describeApiLiteralGeneration(material);
      const pointer = createApiRequestInputPointerSchema(
        z.toJSONSchema(description.contract.valuesSchema) as JsonObject,
      );
      const assignments = describeWorkflowApiArgumentTargets(material).flatMap(
        (target) => {
          const source = sourceSchema(target.template.types);
          if (source === null) return [];
          const slots: Record<string, z.ZodType> = {};
          for (const segment of target.template.segments) {
            if (segment.kind === 'property') continue;
            const key = `s${Object.keys(slots).length}`;
            if (segment.kind === 'index') {
              const index = z.number().int().min(segment.minimum);
              slots[key] =
                segment.maximum === undefined
                  ? index
                  : index.max(segment.maximum);
            } else
              slots[key] =
                segment.kind === 'key'
                  ? z.string()
                  : z.array(z.string()).min(1);
          }
          return [
            z.strictObject({
              targetId: z.literal(target.id),
              targetSelections: z.strictObject(slots),
              source,
            }),
          ];
        },
      );
      return [
        call.callId,
        workflowApiArgumentPlanSchema.shape.calls.valueType
          .omit({ reason: true })
          .extend({
            assignments: assignments.length
              ? z.array(z.union(assignments))
              : z.array(z.strictObject({})).max(0),
            requestedInputs: z.array(pointer),
          }),
      ];
    }),
  );
  return workflowApiArgumentPlanSchema
    .omit({ sourceFingerprint: true })
    .extend({
      calls: z.strictObject(calls),
    }) as z.ZodType<WorkflowApiArgumentPlanProposal>;
}

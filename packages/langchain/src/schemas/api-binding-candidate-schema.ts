import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationSchema,
} from '@openapi-flow/core';
import type {
  ApiBindingCandidate,
  ApiBindingCandidateCatalog,
  ApiBindingCandidateProposal,
  ApiCallBindingPlanningDescription,
  BindingPointerTemplate,
  BindingPointerSelections,
} from '@openapi-flow/core';
import { apiBindingCallReasonSchema } from './api-binding-plan-schema.js';

function selectionsSchema(template: BindingPointerTemplate) {
  const fields: Record<
    string,
    z.ZodType<BindingPointerSelections[string]>
  > = {};
  for (const segment of template.segments) {
    if (segment.kind === 'property') continue;
    const key = 's' + Object.keys(fields).length;
    if (segment.kind === 'index') {
      const schema = z.number().int().min(segment.minimum);
      fields[key] = (
        segment.maximum === undefined ? schema : schema.max(segment.maximum)
      ).describe(
        'Explicit array index required by the scenario; never guess the first item.',
      );
    } else if (segment.kind === 'key') {
      fields[key] = z
        .string()
        .describe(
          'Explicit runtime dictionary key required by the scenario. Code validates the original key constraints.',
        );
    } else {
      fields[key] = z
        .array(z.string())
        .min(1)
        .describe(
          'Explicit JSON property/index tokens below an open or recursive contract. These are checked against the original schema, not executable expressions.',
        );
    }
  }
  return z.strictObject(fields);
}

export function createApiBindingCandidateSchema(
  description: ApiCallBindingPlanningDescription,
  catalog: ApiBindingCandidateCatalog,
  requireExplanations = true,
): z.ZodType<ApiBindingCandidateProposal> {
  const groups = new Map<string, ApiBindingCandidate[]>();
  for (const candidate of catalog.candidates) {
    const key = JSON.stringify([
      candidate.source.segments.filter(
        (segment) => segment.kind !== 'property',
      ),
      candidate.target.segments.filter(
        (segment) => segment.kind !== 'property',
      ),
    ]);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  const choices = [...groups.values()].map((group) =>
    z.strictObject({
      candidateId: z.enum(group.map((candidate) => candidate.id)),
      sourceSelections: selectionsSchema(group[0].source),
      targetSelections: selectionsSchema(group[0].target),
    }),
  );
  const bindings =
    choices.length === 0
      ? z
          .array(
            z.strictObject({
              candidateId: z.string(),
              sourceSelections: z.strictObject({}),
              targetSelections: z.strictObject({}),
            }),
          )
          .max(0)
      : z.array(choices.length === 1 ? choices[0] : z.union(choices));
  const schema = z.strictObject({
    bindings,
    gaps: z.array(
      z.strictObject({
        targetPointer: createApiRequestInputPointerSchema(
          description.requestSchema,
        ),
        description: z
          .string()
          .min(1)
          .describe(
            'Only a requested response dependency that cannot be represented, never a missing independent literal.',
          ),
      }),
    ),
  });
  const explained = !requireExplanations
    ? schema.extend({ reason: optionalPlanningExplanationSchema })
    : description.input.includeExplanations === true
      ? schema.extend({ reason: apiBindingCallReasonSchema })
      : schema;
  // The empty branch uses a standards-compliant maxItems:0 array, never an empty tuple.
  return explained;
}

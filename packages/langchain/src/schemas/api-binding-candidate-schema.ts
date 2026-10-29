import { z } from 'zod';
import {
  createApiRequestInputPointerSchema,
  optionalPlanningExplanationSchema,
} from '@openapi-flow/core';
import type {
  ApiBindingCandidate,
  ApiBindingCandidateCatalog,
  ApiCallBindingPlanningDescription,
  BindingPointerTemplate,
} from '@openapi-flow/core';
import { listBindingKeyChoices } from '../bindings/list-binding-key-choices.js';
import type {
  ApiBindingModelCandidateProposal,
  ApiBindingModelSelection,
} from '../types/api-binding-model-selection.js';
import type { ApiBindingKeyCandidate } from '@openapi-flow/core';
import { apiBindingCallReasonSchema } from './api-binding-plan-schema.js';

function selectionsSchema(
  template: BindingPointerTemplate,
  nodeId: string,
  keys: ApiBindingKeyCandidate[],
) {
  const fields: Record<string, z.ZodType<ApiBindingModelSelection>> = {};
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
    } else {
      const choices = listBindingKeyChoices(segment, nodeId, keys);
      if (!choices.length)
        throw new Error(
          'Model binding name slots require verified key/path candidates',
        );
      fields[key] =
        segment.kind === 'key'
          ? z
              .strictObject({ keyId: z.enum(choices.map((item) => item.id)) })
              .describe(
                'Select an ID for an original, code-verified key. Never generate a property name.',
              )
          : z
              .strictObject({ pathId: z.enum(choices.map((item) => item.id)) })
              .describe(
                'Select an ID for an original, code-verified relative path. Never generate path tokens.',
              );
    }
  }
  return z.strictObject(fields);
}

export function createApiBindingCandidateSchema(
  description: ApiCallBindingPlanningDescription,
  catalog: ApiBindingCandidateCatalog,
  keys: ApiBindingKeyCandidate[],
  requireExplanations = true,
): z.ZodType<ApiBindingModelCandidateProposal> {
  const groups = new Map<string, ApiBindingCandidate[]>();
  for (const candidate of catalog.candidates) {
    const key = JSON.stringify([
      candidate.source.segments.some(
        (segment) => segment.kind === 'key' || segment.kind === 'descendant',
      )
        ? candidate.sourceNodeId
        : null,
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
      sourceSelections: selectionsSchema(
        group[0].source,
        group[0].sourceNodeId,
        keys,
      ),
      targetSelections: selectionsSchema(
        group[0].target,
        description.input.callId,
        keys,
      ),
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

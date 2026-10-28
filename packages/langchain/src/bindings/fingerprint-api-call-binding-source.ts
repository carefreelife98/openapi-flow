import { createHash } from 'node:crypto';
import {
  describeApiCallBindingPlanning,
  describeWorkflowConnectionApiRepair,
} from '@openapi-flow/core';
import type { PlanApiCallBindingsInput } from '../types/api-call-binding-planning.js';

export function fingerprintApiCallBindingSource(
  input: Omit<
    PlanApiCallBindingsInput,
    'model' | 'signal' | 'rejectedProposals'
  >,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        describeApiCallBindingPlanning(input).fingerprint,
        input.sources,
        input.materialRepair === undefined
          ? null
          : describeWorkflowConnectionApiRepair({
              stage: 'api-bindings',
              repair: input.materialRepair,
              planning: input,
            }),
      ]),
    )
    .digest('hex');
}

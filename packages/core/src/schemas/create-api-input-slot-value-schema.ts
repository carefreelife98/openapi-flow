import type { z } from 'zod';
import type { JsonValue } from '../types/api-arguments.js';
import type { DeferredApiInputSlot } from '../types/deferred-api-inputs.js';
import { createOasValueSchema } from './create-oas-value-schema.js';
import { listMissingRequestedApiInputs } from '../arguments/clarification/list-missing-requested-api-inputs.js';

/** Keep original OAS wire metadata; in-process presence is a separate assertion. */
export function createApiInputSlotValueSchema(
  slot: DeferredApiInputSlot,
): z.ZodType<JsonValue> {
  const schema = createOasValueSchema(
    slot.schema,
    slot.openapiVersion.startsWith('3.0.') ? 'openapi-3.0' : 'draft-2020-12',
    `inputValues[${slot.id}] for ${slot.callId}${slot.targetPointer}`,
  );
  if (slot.requestedInputs === undefined) return schema;
  const metadata = schema.meta();
  if (metadata === undefined)
    throw new Error(`Input slot ${slot.id} requires its original OAS metadata`);
  return schema
    .superRefine((value, context) => {
      const missing = listMissingRequestedApiInputs({
        source: `Runtime input ${slot.id}`,
        rootPointer: slot.targetPointer,
        value,
        requestedInputs: slot.requestedInputs,
      });
      if (missing.length)
        context.addIssue({
          code: 'custom',
          message: `Runtime input omits scenario-requested inputs: ${missing.join(', ')}`,
        });
    })
    .meta(metadata);
}

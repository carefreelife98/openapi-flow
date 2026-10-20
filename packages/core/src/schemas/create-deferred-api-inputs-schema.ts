import { z } from 'zod';
import type {
  DeferredApiInputSlot,
  DeferredApiInputValues,
} from '../types/deferred-api-inputs.js';
import { deferredApiInputSlotsSchema } from './deferred-api-input-schema.js';
import { createApiInputSlotValueSchema } from './create-api-input-slot-value-schema.js';

/** Presentation/input contract; execution re-derives slots from OAS materials. */
export function createDeferredApiInputsSchema(
  slots: DeferredApiInputSlot[],
): z.ZodType<DeferredApiInputValues> {
  const checked = deferredApiInputSlotsSchema.parse(slots);
  return z
    .strictObject(
      Object.fromEntries(
        checked.map((slot) => [
          slot.id,
          createApiInputSlotValueSchema(slot).describe(
            `Actual runtime value for ${slot.callId}${slot.targetPointer}. Preserve the OAS type and constraints; no placeholder, example or default is a confirmed value.`,
          ),
        ]),
      ),
    )
    .describe('Explicit runtime values keyed by the declared input slot IDs.');
}

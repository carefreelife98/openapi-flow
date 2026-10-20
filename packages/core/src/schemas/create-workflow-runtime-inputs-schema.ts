import { z } from 'zod';
import type { WorkflowRuntimeInputSlot } from '../types/native-runtime-inputs.js';
import { deferredApiInputSlotsSchema } from './deferred-api-input-schema.js';
import {
  nativeRuntimeInputSlotSchema,
  nativeParameterValuesSchema,
} from './native-runtime-input-slot-schema.js';
import { createOasValueSchema } from './create-oas-value-schema.js';
import { createApiInputSlotValueSchema } from './create-api-input-slot-value-schema.js';

/** In-process input contract; export each field separately to retain independent resource IDs. */
export function createWorkflowRuntimeInputsSchema(
  slots: WorkflowRuntimeInputSlot[],
) {
  const fields = slots.map((slot) => {
    if (slot.kind === 'api-request-input') {
      deferredApiInputSlotsSchema.parse([slot]);
      return [slot.id, createApiInputSlotValueSchema(slot)] as const;
    }
    nativeRuntimeInputSlotSchema.parse(slot);
    return [
      slot.id,
      slot.targetPointer === ''
        ? z.intersection(
            nativeParameterValuesSchema,
            createOasValueSchema(
              slot.schema,
              'draft-2020-12',
              `inputValues[${slot.id}] for native ${slot.nodeId}`,
            ),
          )
        : createOasValueSchema(
            slot.schema,
            'draft-2020-12',
            `inputValues[${slot.id}] for native ${slot.nodeId}${slot.targetPointer}`,
          ),
    ] as const;
  });
  if (new Set(fields.map(([id]) => id)).size !== fields.length)
    throw new Error('Workflow input slots require distinct IDs');
  return z.strictObject(Object.fromEntries(fields));
}

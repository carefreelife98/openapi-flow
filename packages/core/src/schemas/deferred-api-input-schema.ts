import { z } from 'zod';
import type { DeferredApiInputSlot } from '../types/deferred-api-inputs.js';
import { apiOperationKeySchema } from './api-operation-key-schema.js';
import { requestedApiInputsSchema } from './requested-api-inputs-schema.js';

export const deferredApiInputSlotSchema: z.ZodType<DeferredApiInputSlot> =
  z.strictObject({
    kind: z.literal('api-request-input'),
    state: z.literal('deferred'),
    id: z.string().min(1),
    callId: z.string().refine((value) => value.trim().length > 0),
    operation: apiOperationKeySchema,
    targetPointer: z
      .string()
      .regex(/^\/(?:[^~]|~[01])*$/u)
      .min(2),
    requestedInputs: requestedApiInputsSchema.optional(),
    schema: z.union([z.boolean(), z.record(z.string(), z.unknown())]),
    openapiVersion: z.string().min(1),
    operationSummary: z.string().optional(),
    parameterDescription: z.string().optional(),
  });

export const deferredApiInputSlotsSchema = z
  .array(deferredApiInputSlotSchema)
  .superRefine((slots, context) => {
    const ids = new Set<string>();
    const targets = new Map<string, string[]>();
    for (const [index, slot] of slots.entries()) {
      const previous = targets.get(slot.callId) ?? [];
      if (
        ids.has(slot.id) ||
        previous.some(
          (target) =>
            target === slot.targetPointer ||
            target.startsWith(slot.targetPointer + '/') ||
            slot.targetPointer.startsWith(target + '/'),
        )
      )
        context.addIssue({
          code: 'custom',
          path: [index],
          message:
            'Input slots require distinct IDs and non-overlapping call targets',
        });
      ids.add(slot.id);
      targets.set(slot.callId, [...previous, slot.targetPointer]);
    }
  });

export const deferredApiInputValuesSchema = z.record(z.string(), z.json());

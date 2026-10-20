import { z } from 'zod';
export const nativeParameterValuesSchema = z.record(z.string(), z.json());
export const nativeRuntimeParametersSchema = z.union([
  z.literal(true),
  z.strictObject({ pointers: z.array(z.string().min(1)).min(1) }),
]);
export const nativeRuntimeInputSlotSchema = z.strictObject({
  kind: z.literal('native-parameters-input'),
  state: z.literal('deferred'),
  id: z.string().min(1),
  nodeId: z.string().min(1),
  capability: z.string().min(1),
  targetPointer: z.string(),
  schema: z.union([z.boolean(), z.record(z.string(), z.json())]),
  description: z.string().min(1),
});

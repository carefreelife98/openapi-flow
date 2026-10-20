import { z } from 'zod';
import type {
  WorkflowDraftEditResolution,
  WorkflowDraftEditRepair,
  WorkflowDraftEditConnectionChange,
  WorkflowDraftValueEdit,
  WorkflowDraftBindingEdit,
} from '../types/workflow-draft-edit-assembly.js';
import {
  workflowDraftApiCallSchema,
  workflowDraftRequirementSchema,
  workflowDraftEdgeSchema,
} from './workflow-draft-schema.js';
import type { WorkflowDraftNativeParameterChange } from '../types/workflow-draft-native-parameter-edit.js';
import { nativeRuntimeParametersSchema } from './native-runtime-input-slot-schema.js';

export const workflowDraftValueEditSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set'),
    pointer: z.string(),
    value: z.json(),
  }),
  z.strictObject({ kind: z.literal('remove'), pointer: z.string() }),
]) satisfies z.ZodType<WorkflowDraftValueEdit>;
export const workflowDraftNativeParameterChangeSchema = z.union([
  workflowDraftValueEditSchema,
  z.strictObject({ kind: z.literal('defer'), pointer: z.string().min(1) }),
]) satisfies z.ZodType<WorkflowDraftNativeParameterChange>;
export const workflowDraftBindingEditSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set'),
    binding: workflowDraftApiCallSchema.shape.bindings.element,
  }),
  z.strictObject({
    kind: z.literal('remove'),
    targetPointer: z.string().min(1),
  }),
]) satisfies z.ZodType<WorkflowDraftBindingEdit>;
const stepId = z.string().min(1);
export const workflowDraftEditResolutionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    stepId,
    kind: z.literal('api-call'),
    values: workflowDraftApiCallSchema.shape.values,
    requestedInputs: workflowDraftApiCallSchema.shape.requestedInputs,
    bindings: workflowDraftApiCallSchema.shape.bindings,
    requestMediaType: z.string().min(1).optional(),
  }),
  z.strictObject({
    stepId,
    kind: z.literal('api-inputs'),
    edits: z.array(workflowDraftValueEditSchema),
    requestMediaType: z.string().min(1).optional(),
  }),
  z.strictObject({
    stepId,
    kind: z.literal('api-bindings'),
    edits: z.array(workflowDraftBindingEditSchema),
    valueEdits: z.array(workflowDraftValueEditSchema),
  }),
  z.strictObject({
    stepId,
    kind: z.literal('native-literal'),
    parameters: z.record(z.string(), z.json()),
  }),
  z.strictObject({
    stepId,
    kind: z.literal('native-mixed'),
    parameters: z.record(z.string(), z.json()),
    runtimeParameters: nativeRuntimeParametersSchema.options[1],
  }),
  z.strictObject({
    stepId,
    kind: z.literal('native-parameters'),
    edits: z.array(workflowDraftNativeParameterChangeSchema).min(1),
  }),
  z.strictObject({ stepId, kind: z.literal('native-runtime') }),
  z.strictObject({
    stepId,
    kind: z.literal('requirement'),
    answerMessageId: z.string().refine((value) => value.trim().length > 0),
    text: workflowDraftRequirementSchema.shape.text,
    state: workflowDraftRequirementSchema.shape.state,
    scope: workflowDraftRequirementSchema.shape.scope,
  }),
]) satisfies z.ZodType<WorkflowDraftEditResolution>;
export const workflowDraftEditRepairSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    taskId: z.string().min(1),
    kind: z.literal('api-bindings'),
    edits: z.array(workflowDraftBindingEditSchema),
  }),
  z.strictObject({
    taskId: z.string().min(1),
    kind: z.literal('native-parameters'),
    edits: z.array(workflowDraftValueEditSchema),
  }),
]) satisfies z.ZodType<WorkflowDraftEditRepair>;
export const workflowDraftEditConnectionChangeSchema = z.strictObject({
  stepIds: z
    .array(stepId)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length),
  kind: z.enum(['add-edge', 'remove-edge']),
  edge: workflowDraftEdgeSchema,
}) satisfies z.ZodType<WorkflowDraftEditConnectionChange>;

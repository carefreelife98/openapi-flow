import type { ApiOperationKey } from './api-catalog.js';
import type { ApiCallArguments, JsonValue } from './api-arguments.js';
import type { InspectApiArgumentRequirementsInput } from './api-clarification.js';
import type { BindingSchema } from './api-bindings.js';

/** A declared input location, never a fake value in the API request. */
export interface DeferredApiInputSlot {
  kind: 'api-request-input';
  state: 'deferred';
  id: string;
  callId: string;
  operation: ApiOperationKey;
  targetPointer: string;
  requestedInputs?: string[];
  schema: BindingSchema;
  openapiVersion: string;
  operationSummary?: string;
  parameterDescription?: string;
}

export type DeferredApiInputMaterial = InspectApiArgumentRequirementsInput;
export type DeferredApiInputValues = Record<string, JsonValue>;

export interface CollectDeferredApiInputSlotsInput {
  materials: DeferredApiInputMaterial[];
}

export interface InspectDeferredApiInputsInput extends CollectDeferredApiInputSlotsInput {
  inputValues: DeferredApiInputValues;
}

export interface DeferredApiInputIssue {
  code: 'missing-input' | 'unknown-input' | 'invalid-value';
  inputId: string;
  callId?: string;
  targetPointer?: string;
  message: string;
}

export interface ResolvedDeferredApiInputs {
  status: 'ready';
  slots: DeferredApiInputSlot[];
  arguments: ApiCallArguments[];
  issues: DeferredApiInputIssue[];
}

export interface PendingDeferredApiInputs {
  status: 'needs-input' | 'invalid-input';
  slots: DeferredApiInputSlot[];
  issues: DeferredApiInputIssue[];
}

export type DeferredApiInputInspection =
  ResolvedDeferredApiInputs | PendingDeferredApiInputs;

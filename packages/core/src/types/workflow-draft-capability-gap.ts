import type { ApiOperationKey } from './api-catalog.js';
import type { WorkflowDraftContext } from './workflow-draft.js';
import type { WorkflowMessageEvidence } from './planning-evidence.js';

/** A scoped planning finding, never proof that no API exists outside supplied contracts. */
export type WorkflowDraftCapabilityGapFinding<Operation = ApiOperationKey> =
  | { kind: 'missing-api'; reason: string }
  | { kind: 'api-contract-gap'; operation: Operation; reason: string }
  | { kind: 'unsupported-native'; reason: string };

export interface WorkflowDraftGapCapabilityFingerprint {
  name: string;
  fingerprint: string;
}
export interface WorkflowDraftGapInventory {
  operations: ApiOperationKey[];
  capabilities: WorkflowDraftGapCapabilityFingerprint[];
}
export interface WorkflowDraftCapabilityGap {
  id: string;
  requestedBehavior: string;
  finding: WorkflowDraftCapabilityGapFinding;
  sources: WorkflowMessageEvidence[];
  inventory: WorkflowDraftGapInventory;
  fingerprint: string;
}
export interface CreateWorkflowDraftCapabilityGapInput {
  id: string;
  requestedBehavior: string;
  finding: WorkflowDraftCapabilityGapFinding;
  sourceMessageIds: string[];
  context: WorkflowDraftContext;
}
export interface InspectWorkflowDraftCapabilityGapInput {
  gap: WorkflowDraftCapabilityGap;
  context: WorkflowDraftContext;
}
export interface WorkflowDraftCapabilityGapInspection {
  inventoryCurrent: boolean;
}
export interface WorkflowDraftCapabilityGapDescription extends WorkflowDraftCapabilityGapInspection {
  id: string;
  requestedBehavior: string;
  finding: WorkflowDraftCapabilityGapFinding;
}

/** Control-flow placeholder only: it declares no API response or native value output. */
export interface WorkflowUnresolvedNode {
  id: string;
}

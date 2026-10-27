import assert from 'node:assert/strict';
import {
  planWorkflowConnectionOutline,
  reviewNativeInstanceSelection,
  reviewWorkflowConnectionGoals,
  planWorkflowConnectionRevision,
  planWorkflowConnectionGoalRecovery,
} from '@openapi-flow/langchain';
import type {
  PlanWorkflowConnectionOutlineInput,
  ReviewNativeInstanceSelectionInput,
  ReviewWorkflowConnectionGoalsInput,
  PlanWorkflowConnectionRevisionInput,
  PlanWorkflowConnectionGoalRecoveryInput,
} from '@openapi-flow/langchain';
import {
  createNativeValueCollectionCapability,
  createNativeOutputProjectionCapability,
  createN8nOfficialNodePlanningCatalog,
  validateN8nOfficialNodeConfiguration,
  createN8nOfficialNode,
} from '@openapi-flow/n8n';

// Compile real public peer types without invoking a model or importing workspace sources.
export const verifyOutlineTypes = (input: PlanWorkflowConnectionOutlineInput) =>
  planWorkflowConnectionOutline(input);
export const verifyNativeReviewTypes = (
  input: ReviewNativeInstanceSelectionInput,
) => reviewNativeInstanceSelection(input);
export const verifyGoalReviewTypes = (
  input: ReviewWorkflowConnectionGoalsInput,
) => reviewWorkflowConnectionGoals(input);
export const verifyRevisionTypes = (
  input: PlanWorkflowConnectionRevisionInput,
) => planWorkflowConnectionRevision(input);
export const verifyRecoveryTypes = (
  input: PlanWorkflowConnectionGoalRecoveryInput,
) => planWorkflowConnectionGoalRecovery(input);

for (const implementation of [
  planWorkflowConnectionOutline,
  reviewNativeInstanceSelection,
  reviewWorkflowConnectionGoals,
  planWorkflowConnectionRevision,
  planWorkflowConnectionGoalRecovery,
  createNativeValueCollectionCapability,
  createNativeOutputProjectionCapability,
  createN8nOfficialNodePlanningCatalog,
  validateN8nOfficialNodeConfiguration,
  createN8nOfficialNode,
])
  assert.equal(typeof implementation, 'function');

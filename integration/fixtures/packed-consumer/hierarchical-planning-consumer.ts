import assert from 'node:assert/strict';
import {
  createNativeInstanceSelectionReview,
  resolveNativeInstanceSelection,
  resolveWorkflowIntent,
  validateWorkflowIntent,
  formatWorkflowIntentScenario,
} from '@openapi-flow/core';
import type { NativeInstanceGapAssessment } from '@openapi-flow/core';
import type { NativeInstanceSelectionReviewOptions } from '@openapi-flow/core';
import {
  planWorkflowConnectionOutline,
  reviewNativeInstanceSelection,
  reviewWorkflowConnectionGoals,
  planWorkflowConnectionRevision,
  planWorkflowConnectionGoalRecovery,
  planWorkflowIntent,
} from '@openapi-flow/langchain';
import type {
  PlanWorkflowConnectionOutlineInput,
  ReviewNativeInstanceSelectionInput,
  ReviewWorkflowConnectionGoalsInput,
  PlanWorkflowConnectionRevisionInput,
  PlanWorkflowConnectionGoalRecoveryInput,
  PlanWorkflowIntentInput,
} from '@openapi-flow/langchain';
import {
  createNativeValueCollectionCapability,
  createNativeOutputProjectionCapability,
  createN8nOfficialNodePlanningCatalog,
  validateN8nOfficialNodeConfiguration,
  createN8nOfficialNode,
} from '@openapi-flow/n8n';

// Compile real public peer types without invoking a model or importing workspace sources.
const intentSource = {
  scenario: 'Read the original records.',
  messages: [{ id: 'request', text: 'Read the original records.' }],
};
const intentPlan = resolveWorkflowIntent({
  ...intentSource,
  proposal: {
    objective: 'Read records',
    roles: [
      {
        task: 'Read records',
        scope: 'required',
        sourceMessageIds: ['request'],
      },
    ],
    flows: [],
  },
});
validateWorkflowIntent({ ...intentSource, plan: intentPlan });
assert.equal(
  JSON.parse(
    formatWorkflowIntentScenario({ ...intentSource, plan: intentPlan }),
  ).originalRequirements,
  intentSource.scenario,
);
export const verifyIntentTypes = (input: PlanWorkflowIntentInput) =>
  planWorkflowIntent(input);
const scopeSource = {
  planId: 'consumer-outside-scope',
  scenario: 'Preserve the response. Do not add a classification.',
  capabilities: [],
  apiMaterials: [],
};
const scopeSelection = resolveNativeInstanceSelection({
  ...scopeSource,
  proposal: {
    instances: [],
    gaps: [{ description: 'No classification rule.' }],
  },
});
const scopeGap = scopeSelection.gaps[0];
if (scopeGap === undefined)
  throw new Error('Consumer requires its original gap');
const scopeAssessment: NativeInstanceGapAssessment = {
  kind: 'not-required',
  reason: 'The original request excludes this behavior.',
};
assert.equal(
  createNativeInstanceSelectionReview({
    ...scopeSource,
    selection: scopeSelection,
    proposal: { assessments: { [scopeGap.id]: scopeAssessment } },
  }).status,
  'needs-reselection',
);
assert.equal(scopeSelection.gaps.length, 1);
const scopeOptions: NativeInstanceSelectionReviewOptions = {
  reviewInstances: true,
};
const fullScopeReview = createNativeInstanceSelectionReview({
  ...scopeSource,
  ...scopeOptions,
  selection: scopeSelection,
  proposal: {
    assessments: { [scopeGap.id]: scopeAssessment },
    instanceAssessments: {},
    coverageAssessment: {
      kind: 'covered',
      reason: 'The supplied API alone preserves the response in this fixture.',
    },
  },
});
assert.equal(fullScopeReview.reviewInstances, true);
assert.equal(fullScopeReview.status, 'needs-reselection');

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
  planWorkflowIntent,
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

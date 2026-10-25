import assert from 'node:assert/strict';
import {
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  finalizeWorkflowConnectionSession,
  extendWorkflowConnectionSession,
  describeApiOperationCandidate,
} from '@openapi-flow/core';
import type {
  ReadyWorkflowApiMaterial,
  WorkflowConnectionSessionSource,
  WorkflowConnectionSession,
  ReviewableWorkflowGraphPlan,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
  createWorkflowConnectionGoalRejection,
  workflowConnectionGoalRejectionSchema,
} from '@openapi-flow/langchain';
import type {
  PlanWorkflowConnectionGoalsInput,
  PlanWorkflowConnectionStepInput,
  PlanWorkflowConnectionStepResult,
  CreateWorkflowConnectionGoalRejectionInput,
  WorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';

/** Installed API/type proof only. The assertions are explicit fixture input, not model assessments. */
export function verifyConsumerIncrementalConnections(
  material: ReadyWorkflowApiMaterial,
): ReviewableWorkflowGraphPlan {
  assert.deepEqual(
    describeApiOperationCandidate(material.operation).key,
    material.operation.key,
  );
  const scenario = 'Execute this supplied independent API once.';
  const source: WorkflowConnectionSessionSource = {
    scenario,
    materials: [material],
    capabilities: createN8nNativeCapabilities(),
    requirements: [
      {
        id: 'intent',
        text: scenario,
        sources: [
          { kind: 'message', messageId: 'consumer-request', quote: scenario },
        ],
      },
    ],
  };
  let session = createWorkflowConnectionSession({
    ...source,
    goals: [
      {
        kind: 'semantic',
        factIds: ['intent'],
        reason: 'The consumer supplies the independent-call requirement.',
      },
    ],
  });
  const first = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: {
      kind: 'patch',
      addEdges: [],
      removeEdgeIds: [],
      addRootNodeIds: [material.arguments.callId],
      removeRootNodeIds: [],
      addTerminals: [{ nodeId: material.arguments.callId, output: 'main' }],
      removeTerminals: [],
      factIds: ['intent'],
      reason:
        'Place the actual supplied request as the explicit independent root.',
    },
  });
  assert.equal(first.status, 'accepted');
  if (first.status !== 'accepted')
    throw new Error('Installed consumer root was rejected');
  session = first.session;
  const completion = applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal: {
      kind: 'request-completion',
      assessments: [
        {
          goalId: session.goals[0]!.id,
          satisfied: true,
          nodeIds: [material.arguments.callId],
          reason: 'Explicit fixture assessment of the one supplied request.',
        },
      ],
      reason: 'Inspect the complete fixture graph.',
    },
  });
  assert.equal(completion.status, 'accepted');
  if (completion.status !== 'accepted')
    throw new Error('Installed completion receipt was rejected');
  session = completion.session;
  assert.equal(
    inspectWorkflowConnectionCompletion({ ...source, session }).ready,
    true,
  );
  const plan = finalizeWorkflowConnectionSession({ ...source, session });
  assert.deepEqual(plan.starts, [material.arguments.callId]);
  const additionalNativeNodes = [
    {
      id: 'consumer-new-join',
      capability: 'merge-append',
      parameters: { numberInputs: 2 },
    },
  ];
  const extended = extendWorkflowConnectionSession({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    additionalNativeNodes,
  });
  assert.equal(extended.session.revision, session.revision);
  assert.notEqual(
    extended.session.sourceFingerprint,
    session.sourceFingerprint,
  );
  assert.equal(
    inspectWorkflowConnectionCompletion({
      ...source,
      nativeNodes: additionalNativeNodes,
      session: extended.session,
    }).ready,
    false,
  );
  return plan;
}

export function verifyConsumerConnectionGoalTypes(
  input: PlanWorkflowConnectionGoalsInput,
): Promise<WorkflowConnectionSession> {
  return planWorkflowConnectionGoals(input);
}
export function verifyConsumerConnectionStepTypes(
  input: PlanWorkflowConnectionStepInput,
): Promise<PlanWorkflowConnectionStepResult> {
  return planWorkflowConnectionStep(input);
}

export function verifyConsumerGoalRejectionTypes(
  input: CreateWorkflowConnectionGoalRejectionInput,
): WorkflowConnectionGoalRejection | undefined {
  const rejection = createWorkflowConnectionGoalRejection(input);
  return rejection === undefined
    ? undefined
    : workflowConnectionGoalRejectionSchema.parse(rejection);
}

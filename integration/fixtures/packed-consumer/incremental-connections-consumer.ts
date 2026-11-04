import assert from 'node:assert/strict';
import {
  WorkflowConnectionRegionValidationError,
  createWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  finalizeWorkflowConnectionSession,
  extendWorkflowConnectionSession,
  describeApiOperationCandidate,
  inspectWorkflowPlanningConstraints,
  createWorkflowConnectionOutline,
  describeWorkflowConnectionOutlineBundle,
  applyWorkflowConnectionOutlineStep,
} from '@openapi-flow/core';
import type {
  ReadyWorkflowApiMaterial,
  WorkflowConnectionSessionSource,
  WorkflowConnectionSession,
  ReviewableWorkflowGraphPlan,
  WorkflowConnectionRejectedProposal,
} from '@openapi-flow/core';
import {
  createWorkflowConnectionStepRejection,
  workflowConnectionProposalAttemptSchema,
  planWorkflowConnectionGoals,
  planWorkflowConnectionStep,
  createWorkflowConnectionGoalRejection,
  workflowConnectionGoalRejectionSchema,
} from '@openapi-flow/langchain';
import type {
  WorkflowConnectionProposalAttempt,
  CreateWorkflowConnectionStepRejectionInput,
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
        scope: 'workflow',
        factIds: ['intent'],
        reason: 'The consumer supplies the independent-call requirement.',
      },
    ],
  });
  assert.equal(
    inspectWorkflowPlanningConstraints({ ...source, goals: [] }).conflicts
      .length,
    0,
  );
  const outline = createWorkflowConnectionOutline({
    ...source,
    session,
    proposal: {
      purpose: scenario,
      bundles: [
        {
          purpose: 'Place the supplied independent call',
          nodeIds: [material.arguments.callId],
          goalIds: session.goals.map((goal) => goal.id),
          factIds: ['intent'],
          reason: 'Explicit consumer fixture, not a model business judgment',
        },
      ],
    },
  });
  const bundle = outline.bundles[0];
  assert.ok(bundle);
  const scoped = describeWorkflowConnectionOutlineBundle({
    ...source,
    session,
    outline,
    bundleId: bundle.id,
  });
  assert.equal(scoped.bundle.id, bundle.id);
  assert.equal(scoped.step.context.nodes.length, 1);
  const first = applyWorkflowConnectionOutlineStep({
    ...source,
    session,
    outline,
    bundleId: bundle.id,
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
          status: 'satisfied',
          scope: 'workflow',
          evidenceRefs: describeWorkflowConnectionStep({
            ...source,
            session,
          }).evidence.map((item) =>
            item.kind === 'requirement'
              ? {
                  evidenceId: item.id,
                  pointer: '/text',
                  quote: source.requirements.find(
                    (fact) => fact.id === item.factId,
                  )!.text,
                }
              : { evidenceId: item.id, pointer: '' },
          ),
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
  assert.notEqual(extended.session.id, session.id);
  assert.deepEqual(extended.previousSession, session);
  assert.deepEqual(extended.session.assessments, []);
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

/** Public exports must remain usable by an independent strict TypeScript consumer. */
export function readConsumerConnectionProposalAttempt(
  result: PlanWorkflowConnectionStepResult,
): WorkflowConnectionProposalAttempt {
  return workflowConnectionProposalAttemptSchema.parse(result.proposalAttempt);
}
export function rejectConsumerConnectionRegion(
  input: CreateWorkflowConnectionStepRejectionInput,
): WorkflowConnectionRejectedProposal | undefined {
  return createWorkflowConnectionStepRejection(input);
}
export function isConsumerRegionValidationError(
  error: unknown,
): error is WorkflowConnectionRegionValidationError {
  return error instanceof WorkflowConnectionRegionValidationError;
}

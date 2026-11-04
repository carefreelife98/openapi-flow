import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkflowConnectionSession,
  extendWorkflowConnectionSession,
  describeWorkflowConnectionStep,
  applyWorkflowConnectionStep,
  inspectWorkflowConnectionCompletion,
  assertWorkflowConnectionReviewCanContinue,
  WorkflowConnectionCompletionIncompleteError,
  listWorkflowConnectionEvidencePointers,
  createApiCatalog,
  resolveApiOperations,
  resolveApiLiteralProposalSources,
} from '@openapi-flow/core';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  planWorkflowConnectionStep,
  WorkflowConnectionPlanningError,
} from '@openapi-flow/langchain';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelRegion,
} from './fixtures/incremental-connection-fixture.mjs';
import {
  connectionAssessment,
  modelConnectionAssessment,
} from './fixtures/connection-assessment-fixture.mjs';

function fixture(scope = 'workflow') {
  const { source, goals, plan } = incrementalConnectionFixture();
  goals.push({
    kind: 'semantic',
    scope,
    factIds: ['intent'],
    reason:
      'Check the actual configured values against the original requirement.',
  });
  const session = createWorkflowConnectionSession({ ...source, goals });
  return { source, goals, plan, session };
}
function apply(source, session, proposal) {
  return applyWorkflowConnectionStep({
    ...source,
    session,
    expected: describeWorkflowConnectionStep({ ...source, session }).expected,
    proposal,
  });
}
function review(source, session, nodeIds = ['source'], status = 'satisfied') {
  const description = describeWorkflowConnectionStep({ ...source, session });
  const goal = session.goals.find((item) => item.decision.kind === 'semantic');
  return {
    kind: 'request-completion',
    assessments: [connectionAssessment(description, goal.id, nodeIds, status)],
    reason: 'Review the current synthetic fixture.',
  };
}
function wire(f) {
  const result = apply(
    f.source,
    f.session,
    incrementalConnectionPatch({
      addRootNodeIds: ['source'],
      addEdges: f.plan.edges,
      addTerminals: [{ nodeId: 'summary', output: 'main' }],
    }),
  );
  assert.equal(result.status, 'accepted');
  return result.session;
}

test('unreviewed semantic goals are distinct from violated goals and do not imply completion', () => {
  const f = fixture();
  const session = wire(f);
  const check = inspectWorkflowConnectionCompletion({ ...f.source, session });
  assert.deepEqual(check.unmetGoalIds, []);
  assert.equal(check.unassessedGoalIds.length, 1);
  assert.deepEqual(check.insufficientEvidenceGoalIds, []);
  assert.equal(check.ready, false);
  assert.doesNotThrow(() => assertWorkflowConnectionReviewCanContinue(check));
});

test('completion receives exact API values and source facts instead of assuming values from API purposes', () => {
  const f = fixture();
  const description = describeWorkflowConnectionStep({
    ...f.source,
    session: f.session,
  });
  const material = f.source.materials[0];
  const actual = description.evidence.find(
    (item) =>
      item.kind === 'api-arguments' &&
      item.nodeId === material.arguments.callId,
  );
  assert.deepEqual(actual.value.arguments.values, material.arguments.values);
  assert.deepEqual(
    description.evidence.find((item) => item.kind === 'requirement').value,
    f.source.requirements[0],
  );
  assert.ok(
    description.evidence.some((item) => item.kind === 'material-inventory'),
  );
});

for (const invalid of [
  'missing-id',
  'missing-pointer',
  'duplicate-reference',
  'missing-requirement',
  'missing-material',
  'scope-mismatch',
  'forged-quote',
  'missing-quote',
]) {
  test(`completion rejects ${invalid} evidence atomically`, () => {
    const f = fixture();
    const session = wire(f);
    const proposal = review(f.source, session);
    const assessment = proposal.assessments[0];
    if (invalid === 'missing-id')
      assessment.evidenceRefs[0].evidenceId = 'unavailable-evidence';
    if (invalid === 'missing-pointer')
      assessment.evidenceRefs[0].pointer = '/missing';
    if (invalid === 'duplicate-reference')
      assessment.evidenceRefs.push(assessment.evidenceRefs[0]);
    const evidence = describeWorkflowConnectionStep({
      ...f.source,
      session,
    }).evidence;
    if (invalid === 'missing-requirement')
      assessment.evidenceRefs = assessment.evidenceRefs.filter(
        (ref) =>
          evidence.find((item) => item.id === ref.evidenceId).kind !==
          'requirement',
      );
    if (invalid === 'missing-material')
      assessment.evidenceRefs = assessment.evidenceRefs.filter((ref) =>
        ['graph', 'requirement'].includes(
          evidence.find((item) => item.id === ref.evidenceId).kind,
        ),
      );
    if (invalid === 'scope-mismatch') assessment.scope = 'materials';
    if (invalid === 'forged-quote')
      assessment.evidenceRefs.find((ref) => ref.quote !== undefined).quote =
        'Invented requirement absent from the original source.';
    if (invalid === 'missing-quote')
      delete assessment.evidenceRefs.find((ref) => ref.quote !== undefined)
        .quote;
    const before = globalThis.structuredClone(session);
    const result = apply(f.source, session, proposal);
    assert.equal(result.status, 'rejected');
    assert.equal(result.violations[0].code, 'INVALID_PROPOSAL');
    assert.deepEqual(session, before);
  });
}

test('actual JSON pointer evidence checks the selected configured argument object', () => {
  const f = fixture('materials');
  const description = describeWorkflowConnectionStep({
    ...f.source,
    session: f.session,
  });
  const material = description.evidence.find(
    (item) => item.kind === 'api-arguments',
  );
  const proposal = review(f.source, f.session);
  proposal.assessments[0].evidenceRefs =
    proposal.assessments[0].evidenceRefs.filter(
      (ref) =>
        description.evidence.find((item) => item.id === ref.evidenceId).kind ===
        'requirement',
    );
  proposal.assessments[0].evidenceRefs.push({
    evidenceId: material.id,
    pointer: '/arguments/values',
  });
  proposal.assessments[0].nodeIds = [material.nodeId];
  assert.equal(apply(f.source, f.session, proposal).status, 'accepted');
});

test('unchanged API material evidence survives graph patches and JSON replay; workflow reviews are invalidated', () => {
  for (const scope of ['materials', 'workflow']) {
    const f = fixture(scope);
    const assessed = apply(f.source, f.session, review(f.source, f.session));
    assert.equal(assessed.status, 'accepted');
    const session = wire({ ...f, session: assessed.session });
    const check = inspectWorkflowConnectionCompletion({
      ...f.source,
      session: JSON.parse(JSON.stringify(session)),
    });
    assert.equal(check.ready, scope === 'materials');
    assert.equal(session.assessments.length, scope === 'materials' ? 1 : 0);
  }
});

test('material conclusions cannot hide graph dependencies inside their evidence references', () => {
  const f = fixture('materials');
  const proposal = review(f.source, f.session);
  const graph = describeWorkflowConnectionStep({
    ...f.source,
    session: f.session,
  }).evidence.find((item) => item.kind === 'graph');
  proposal.assessments[0].evidenceRefs.push({
    evidenceId: graph.id,
    pointer: '',
  });
  assert.equal(apply(f.source, f.session, proposal).status, 'rejected');
});

test('a workflow-only review retains the previously checked material obligation', () => {
  const f = fixture('materials');
  f.goals.push({
    kind: 'semantic',
    scope: 'workflow',
    factIds: ['intent'],
    reason: 'Review the complete response collection graph.',
  });
  f.session = createWorkflowConnectionSession({ ...f.source, goals: f.goals });
  const material = apply(f.source, f.session, review(f.source, f.session));
  assert.equal(material.status, 'accepted');
  const session = wire({ ...f, session: material.session });
  const description = describeWorkflowConnectionStep({ ...f.source, session });
  const goal = session.goals.find(
    (item) =>
      item.decision.kind === 'semantic' && item.decision.scope === 'workflow',
  );
  const completed = apply(f.source, session, {
    kind: 'request-completion',
    assessments: [connectionAssessment(description, goal.id, ['summary'])],
    reason: 'Review graph meaning without erasing the material assessment.',
  });
  assert.equal(completed.status, 'accepted');
  assert.equal(completed.inspection.ready, true);
  assert.equal(completed.session.assessments.length, 2);
});

test('graph evidence cannot be reused across graph revisions', () => {
  const f = fixture();
  const old = review(f.source, f.session);
  const session = wire(f);
  assert.equal(apply(f.source, session, old).status, 'rejected');
});

test('incomplete reviews are distinct, retain actual decisions and stop without waiting for rejection budget exhaustion', () => {
  for (const status of ['violated', 'insufficient-evidence']) {
    const f = fixture();
    const session = wire(f);
    const result = apply(
      f.source,
      session,
      review(f.source, session, ['source'], status),
    );
    assert.equal(result.status, 'accepted');
    assert.equal(result.inspection.ready, false);
    assert.equal(result.inspection.unassessedGoalIds.length, 0);
    assert.equal(
      result.inspection.unmetGoalIds.length,
      status === 'violated' ? 1 : 0,
    );
    assert.equal(
      result.inspection.insufficientEvidenceGoalIds.length,
      status === 'insufficient-evidence' ? 1 : 0,
    );
    assert.throws(
      () => assertWorkflowConnectionReviewCanContinue(result.inspection),
      WorkflowConnectionCompletionIncompleteError,
      listWorkflowConnectionEvidencePointers,
    );
  }
});

test('the real reference LangGraph stops after one insufficient-evidence review instead of eleven repeated proposals', async () => {
  const f = fixture();
  let calls = 0;
  let reviews = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          if (calls === 1) return { goals: f.goals };
          if (calls === 2)
            return {
              decision: incrementalConnectionModelRegion(
                f.source,
                incrementalConnectionPatch({
                  addRootNodeIds: ['source'],
                  addEdges: f.plan.edges,
                  addTerminals: [{ nodeId: 'summary', output: 'main' }],
                }),
              ),
            };
          reviews++;
          const goal = payload.goals.find(
            (item) => item.decision.kind === 'semantic',
          );
          return {
            decision: {
              kind: 'request-completion',
              assessments: {
                [goal.id]: modelConnectionAssessment(
                  payload,
                  goal.id,
                  ['source'],
                  'insufficient-evidence',
                ),
              },
              reason:
                'Required evidence is unavailable; do not approve or retry unchanged.',
            },
          };
        },
      };
    },
  };
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => f.source,
    model,
    policy: {
      maxModelInvocations: 20,
      maxRejectedProposals: 10,
      deadlineMs: 60000,
    },
  });
  await assert.rejects(
    graph.invoke({}),
    WorkflowConnectionCompletionIncompleteError,
    listWorkflowConnectionEvidencePointers,
  );
  assert.equal(calls, 3);
  assert.equal(reviews, 1);
});

test('model pointer choices come from actual values and cannot invent an extra value wrapper', () => {
  const f = fixture();
  const description = describeWorkflowConnectionStep({
    ...f.source,
    session: f.session,
  });
  for (const evidence of description.evidence) {
    const choices = listWorkflowConnectionEvidencePointers(evidence);
    assert.ok(choices.length);
    assert.equal(
      choices.some((pointer) => pointer.startsWith('/value')),
      false,
    );
    if (evidence.kind === 'requirement') assert.deepEqual(choices, ['/text']);
  }
});

test('the model wire preserves strict reference syntax and only code-derived evidence pointer choices', async () => {
  const f = fixture();
  const session = wire(f);
  const d = describeWorkflowConnectionStep({ ...f.source, session });
  const g = session.goals.find((item) => item.decision.kind === 'semantic');
  const output = {
    decision: {
      kind: 'request-completion',
      assessments: { [g.id]: modelConnectionAssessment(d, g.id, ['source']) },
      reason: 'Synthetic model review.',
    },
  };
  let inspected = false;
  const model = {
    withStructuredOutput(schema) {
      return {
        async invoke() {
          const visit = (value) => {
            if (!value || typeof value !== 'object') return;
            if ('$ref' in value) assert.deepEqual(Object.keys(value), ['$ref']);
            for (const child of Object.values(value)) visit(child);
          };
          visit(schema);
          inspected = true;
          return output;
        },
      };
    },
  };
  const result = await planWorkflowConnectionStep({
    ...f.source,
    session,
    model,
  });
  assert.equal(result.decision.kind, 'request-completion');
  assert.equal(inspected, true);
});

test('the fixed-material review has its own prompt and cannot copy prior verdicts or generate another unchanged region', async () => {
  const f = fixture();
  const session = wire(f);
  let reviewed = false;
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          assert.equal(options.name, 'review_workflow_connection_completion');
          const payload = JSON.parse(messages[1].content);
          assert.equal(Object.hasOwn(payload, 'inspection'), false);
          assert.equal(Object.hasOwn(payload, 'rejectedProposals'), false);
          assert.equal(Object.hasOwn(payload, 'connectionCandidates'), false);
          assert.deepEqual(
            payload.availableNativeCapabilities,
            f.source.capabilities.map(({ name, description }) => ({
              name,
              description,
            })),
          );
          assert.ok(messages[0].content.includes('Independently audit'));
          assert.equal(JSON.stringify(schema).includes('set-region'), false);
          reviewed = true;
          const g = payload.goals.find(
            (item) => item.decision.kind === 'semantic',
          );
          return {
            decision: {
              kind: 'request-completion',
              assessments: {
                [g.id]: modelConnectionAssessment(payload, g.id, ['source']),
              },
              reason: 'Synthetic fixed-material review.',
            },
          };
        },
      };
    },
  };
  await planWorkflowConnectionStep({
    ...f.source,
    session,
    model,
    capabilities: f.source.capabilities,
  });
  assert.equal(reviewed, true);
});

async function attributedSource() {
  const catalog = await createApiCatalog([
    {
      id: 'literal-audit',
      spec: {
        openapi: '3.1.0',
        info: { title: 'Literal audit fixture', version: '1' },
        paths: {
          '/items/{id}': {
            get: {
              parameters: [
                {
                  in: 'path',
                  name: 'id',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: { 200: { description: 'Read result' } },
            },
          },
        },
      },
    },
  ]);
  const [operation] = await resolveApiOperations(catalog, [
    catalog.operations[0].key,
  ]);
  const text = 'Read item "alpha".';
  const messages = [{ id: 'original', text }];
  const values = { path: { id: 'alpha' } };
  const literalSources = resolveApiLiteralProposalSources({
    callId: 'read',
    values,
    messages,
    sources: [
      {
        targetPointer: '/path/id',
        messageId: 'original',
        sourceFormat: 'json',
        sourceText: '"alpha"',
      },
    ],
  });
  return {
    scenario: text,
    literalSourceMessages: messages,
    requirements: [
      {
        id: 'intent',
        text,
        sources: [{ kind: 'message', messageId: 'original', quote: text }],
      },
    ],
    materials: [
      {
        status: 'ready',
        operation,
        arguments: {
          callId: 'read',
          values,
          bindings: [],
          unresolvedInputs: [],
          literalSources,
        },
      },
    ],
  };
}

test('the argument owner source receipt is rechecked against actual values before any model can approve them', async () => {
  const source = await attributedSource();
  const goals = [
    {
      kind: 'semantic',
      scope: 'materials',
      factIds: ['intent'],
      reason: 'Keep the explicitly requested item.',
    },
  ];
  assert.doesNotThrow(() =>
    createWorkflowConnectionSession({ ...source, goals }),
  );
  source.materials[0].arguments.values.path.id = 'different-item';
  assert.throws(
    () => createWorkflowConnectionSession({ ...source, goals }),
    /does not equal its exact user source/,
  );
});

test('invalid completion evidence stops the real reference graph after one review instead of entering its retry ledger', async () => {
  const f = fixture();
  let calls = 0;
  const model = {
    withStructuredOutput() {
      return {
        async invoke(messages) {
          calls++;
          const payload = JSON.parse(messages[1].content);
          if (calls === 1) return { goals: f.goals };
          if (calls === 2)
            return {
              decision: incrementalConnectionModelRegion(
                f.source,
                incrementalConnectionPatch({
                  addRootNodeIds: ['source'],
                  addEdges: f.plan.edges,
                  addTerminals: [{ nodeId: 'summary', output: 'main' }],
                }),
              ),
            };
          const goal = payload.goals.find(
            (item) => item.decision.kind === 'semantic',
          );
          const assessment = modelConnectionAssessment(
            payload,
            goal.id,
            [],
            'satisfied',
          );
          assessment.evidence[
            payload.evidence.find(
              (item) => item.kind === 'material-inventory',
            ).id
          ] = null;
          return {
            decision: {
              kind: 'request-completion',
              assessments: {
                [goal.id]: assessment,
              },
              reason:
                'Synthetic invalid review: only original text and graph, no material evidence.',
            },
          };
        },
      };
    },
  };
  const graph = createIncrementalWorkflowConnectionGraph({
    source: () => f.source,
    model,
    policy: {
      maxModelInvocations: 20,
      maxRejectedProposals: 10,
      deadlineMs: 60000,
    },
  });
  await assert.rejects(graph.invoke({}), WorkflowConnectionPlanningError);
  assert.equal(calls, 3);
});

test('source receipts cannot be checked against replacement prose or fabricated source offsets', async () => {
  const goals = [
    {
      kind: 'semantic',
      scope: 'materials',
      factIds: ['intent'],
      reason: 'Keep the original item source.',
    },
  ];
  const source = await attributedSource();
  const missing = globalThis.structuredClone(source);
  delete missing.literalSourceMessages;
  assert.throws(
    () => createWorkflowConnectionSession({ ...missing, goals }),
    /requires original literalSourceMessages/,
  );
  const stale = globalThis.structuredClone(source);
  stale.materials[0].arguments.literalSources[0].occurrences[0].offset++;
  assert.throws(
    () => createWorkflowConnectionSession({ ...stale, goals }),
    /original verified source locations/,
  );
});

test('native extension preserves the original epoch and invalidates changed inventory evidence', () => {
  const f = fixture('materials');
  const wired = wire(f);
  const proposal = review(f.source, wired);
  const inventory = describeWorkflowConnectionStep({
    ...f.source,
    session: wired,
  }).evidence.find((item) => item.kind === 'material-inventory');
  proposal.assessments[0].evidenceRefs.push({
    evidenceId: inventory.id,
    pointer: '',
  });
  const accepted = apply(f.source, wired, proposal);
  assert.equal(accepted.status, 'accepted');
  const before = globalThis.structuredClone(accepted.session);
  const addition = {
    id: 'new-join',
    capability: 'merge-append',
    parameters: { numberInputs: 2 },
  };
  const extension = extendWorkflowConnectionSession({
    ...f.source,
    session: before,
    expected: describeWorkflowConnectionStep({ ...f.source, session: before })
      .expected,
    additionalNativeNodes: [addition],
  });
  assert.deepEqual(extension.previousSession, before);
  assert.notEqual(extension.session.id, before.id);
  assert.deepEqual(extension.session.assessments, []);
  assert.deepEqual(extension.session.edges, before.edges);
  const current = {
    ...f.source,
    nativeNodes: [...f.source.nativeNodes, addition],
    session: JSON.parse(JSON.stringify(extension.session)),
  };
  assert.equal(inspectWorkflowConnectionCompletion(current).ready, false);
  assert.deepEqual(before, accepted.session);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { analyzeWorkflowDraftEdit } from '@openapi-flow/langchain';
import {
  createWorkflowDraftEditPlan,
  describeWorkflowDraftClarificationOwnership,
  stageWorkflowDraftEdit,
  assembleWorkflowDraftEdit,
  createWorkflowDraftEditCandidateContext,
} from '@openapi-flow/core';
import {
  pendingRequirementScopeFixture,
  pendingRequirementScopeEditInput,
} from './fixtures/workflow-draft-requirement-scope-fixture.mjs';

async function fixture() {
  const f = await pendingRequirementScopeFixture();
  return pendingRequirementScopeEditInput(f, [
    { kind: 'add-api-call', operation: f.context.operations[0].key },
    { kind: 'revise-requirement', requirementId: 'purpose' },
    {
      kind: 'needs-clarification',
      owner: {
        kind: 'planning-step',
        decisionIndex: 0,
        stage: 'api-arguments',
      },
    },
    {
      kind: 'needs-clarification',
      owner: { kind: 'planning-step', decisionIndex: 1, stage: 'requirements' },
    },
  ]);
}

test('declared API and requirement concerns retain exact provenance and actual owners without becoming global pending requirements', async () => {
  const input = await fixture();
  assert.equal(input.plan.status, 'ready-for-planning');
  assert.deepEqual(
    input.plan.steps.slice(2).map((step) => step.stages),
    [[], []],
  );
  const stage = stageWorkflowDraftEdit(input);
  assert.deepEqual(stage.content.requirements, input.draft.requirements);
  assert.deepEqual(
    stage.pendingResolutionStepIds,
    input.plan.steps.slice(0, 2).map((step) => step.id),
  );
  assert.deepEqual(stage.deferredRequirementIds, []);
  const ownership = describeWorkflowDraftClarificationOwnership(input);
  assert.equal(ownership.length, 2);
  assert.deepEqual(ownership, stage.clarificationOwnership);
  assert.deepEqual(
    ownership.map((entry) => entry.owner.stepId),
    input.plan.steps.slice(0, 2).map((step) => step.id),
  );
  assert.equal(ownership[0].owner.nodeId, input.plan.steps[0].newNodeId);
  assert.equal(ownership[1].owner.stage, 'requirements');
  for (const entry of ownership) {
    assert.deepEqual(entry.sources, [
      {
        kind: 'message',
        messageId: 'edit-scope',
        quote: input.context.messages.at(-1).text,
      },
    ]);
    assert.equal(Object.hasOwn(entry, 'answer'), false);
    assert.equal(Object.hasOwn(entry, 'ready'), false);
  }
  assert.deepEqual(
    describeWorkflowDraftClarificationOwnership({
      ...input,
      stepId: input.plan.steps[0].id,
    }),
    [ownership[0]],
  );
  assert.deepEqual(
    describeWorkflowDraftClarificationOwnership({
      ...input,
      stage: 'api-arguments',
    }),
    [ownership[0]],
  );
  assert.deepEqual(
    describeWorkflowDraftClarificationOwnership({
      ...input,
      stepId: input.plan.steps[0].id,
      stage: 'api-bindings',
    }),
    [],
  );
  assert.throws(
    () =>
      describeWorkflowDraftClarificationOwnership({
        ...input,
        stage: 'unknown',
      }),
    /ownership stage is invalid/,
  );
  assert.throws(
    () =>
      describeWorkflowDraftClarificationOwnership({
        ...input,
        stepId: 'unknown',
      }),
    /actual plan step/,
  );
  ownership[0].owner.stage = 'connections';
  ownership[0].sources[0].quote = 'changed';
  assert.notDeepEqual(
    describeWorkflowDraftClarificationOwnership(input),
    ownership,
  );
});

test('unknown, self, cyclic, deterministic and absent clarification owners fail without inferring a replacement', async () => {
  const input = await fixture();
  const base = input.plan.steps.slice(0, 2).map((step) => step.decision);
  for (const owner of [
    undefined,
    { kind: 'planning-step', decisionIndex: 2, stage: 'api-arguments' },
    { kind: 'planning-step', decisionIndex: 99, stage: 'api-arguments' },
    { kind: 'planning-step', decisionIndex: -1, stage: 'api-arguments' },
    { kind: 'planning-step', decisionIndex: 0.5, stage: 'api-arguments' },
    {
      kind: 'planning-step',
      decisionIndex: Number.MAX_SAFE_INTEGER + 1,
      stage: 'api-arguments',
    },
    { kind: 'unknown' },
  ]) {
    const proposal = {
      decisions: [
        ...base,
        {
          ...input.plan.steps[2].decision,
          ...(owner === undefined ? {} : { owner }),
        },
      ],
    };
    if (owner === undefined) delete proposal.decisions[2].owner;
    assert.throws(() =>
      createWorkflowDraftEditPlan({
        ...input,
        options: { includeExplanations: false },
        proposal,
      }),
    );
  }
  assert.throws(
    () =>
      createWorkflowDraftEditPlan({
        ...input,
        options: { includeExplanations: false },
        proposal: {
          decisions: [
            ...base,
            {
              ...input.plan.steps[2].decision,
              owner: {
                kind: 'planning-step',
                decisionIndex: 3,
                stage: 'api-arguments',
              },
            },
            {
              ...input.plan.steps[3].decision,
              owner: {
                kind: 'planning-step',
                decisionIndex: 2,
                stage: 'api-arguments',
              },
            },
          ],
        },
      }),
    /actual value, requirement or connection/,
  );
  for (const target of [
    { kind: 'no-change' },
    { kind: 'remove-requirement', requirementId: 'purpose' },
  ])
    assert.throws(
      () =>
        createWorkflowDraftEditPlan({
          ...input,
          options: { includeExplanations: false },
          proposal: {
            decisions: [
              {
                instruction: base[1].instruction,
                sources: base[1].sources,
                ...target,
              },
              {
                ...input.plan.steps[2].decision,
                owner: {
                  kind: 'planning-step',
                  decisionIndex: 0,
                  stage: 'api-arguments',
                },
              },
            ],
          },
        }),
      target.kind === 'no-change'
        ? /decisions/
        : /actual value, requirement or connection/,
    );
  const legacy = {
    ...input.plan.steps[2].decision,
    scope: { kind: 'workflow' },
  };
  delete legacy.owner;
  assert.throws(() =>
    createWorkflowDraftEditPlan({
      ...input,
      options: { includeExplanations: false },
      proposal: { decisions: [...base, legacy] },
    }),
  );
});

test('owned concerns cannot bypass actual missing results; explicit answers resolve only their real stages', async () => {
  const input = await fixture();
  const req = {
    kind: 'requirement',
    stepId: input.plan.steps[1].id,
    answerMessageId: 'typed-answer',
    text: 'Purpose of the new selected API',
    state: 'confirmed',
    scope: { kind: 'nodes', nodeIds: [input.plan.steps[0].newNodeId] },
  };
  const stage = stageWorkflowDraftEdit({ ...input, resolutions: [req] });
  assert.deepEqual(stage.pendingResolutionStepIds, [input.plan.steps[0].id]);
  assert.equal(stage.clarificationOwnership.length, 2);
  assert.throws(
    () => assembleWorkflowDraftEdit({ ...input, resolutions: [req] }),
    /Missing draft edit resolution/,
  );
  const resolutions = [
    req,
    {
      kind: 'api-call',
      stepId: input.plan.steps[0].id,
      values: { path: { id: 'actual-human-value' } },
      bindings: [],
    },
  ];
  const result = assembleWorkflowDraftEdit({ ...input, resolutions });
  assert.equal(result.draft.requirements.length, 1);
  assert.deepEqual(result.draft.apiCalls[0].values, {
    path: { id: 'actual-human-value' },
  });
  assert.deepEqual(result.draft.nativeNodes, input.draft.nativeNodes);
  assert.deepEqual(result.draft.edges, input.draft.edges);
  assert.ok(
    createWorkflowDraftEditCandidateContext({
      ...input,
      resolutions,
    }).messages.some((message) => message.id === 'typed-answer'),
  );
});

test('an owner must name an actual stage of the selected decision, not a different step family', async () => {
  const input = await fixture();
  const decisions = input.plan.steps.slice(0, 2).map((step) => step.decision);
  assert.throws(
    () =>
      createWorkflowDraftEditPlan({
        ...input,
        options: { includeExplanations: false },
        proposal: {
          decisions: [
            ...decisions,
            {
              ...input.plan.steps[2].decision,
              owner: {
                kind: 'planning-step',
                decisionIndex: 0,
                stage: 'native-parameters',
              },
            },
          ],
        },
      }),
    /has no native-parameters planning stage/,
  );
});

test('a real semantic question remains an explicit blocking requirement alongside unrelated owned concerns', async () => {
  const input = await fixture();
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        ...input.plan.steps.map((step) => step.decision),
        {
          ...input.plan.steps[2].decision,
          owner: {
            kind: 'semantic',
            scope: { kind: 'nodes', nodeIds: ['unchanged-pass'] },
          },
          instruction:
            'Confirm the distinct business meaning of the existing pass-through branch.',
        },
      ],
    },
  });
  const stage = stageWorkflowDraftEdit({ ...input, plan });
  assert.equal(plan.status, 'needs-clarification');
  assert.equal(stage.deferredRequirementIds.length, 1);
  assert.deepEqual(stage.content.requirements.at(-1).scope, {
    kind: 'nodes',
    nodeIds: ['unchanged-pass'],
  });
  assert.equal(
    stage.clarificationOwnership.filter(
      (entry) => entry.owner.kind === 'semantic',
    ).length,
    1,
  );
  assert.equal(
    stage.clarificationOwnership.filter(
      (entry) => entry.owner.kind === 'planning-step',
    ).length,
    2,
  );
  assert.ok(stage.blockedSourceNodeIds.includes('unchanged-pass'));
});

test('the same API may have two distinct roles and each concern resolves only its actual allocated identity', async () => {
  const input = await fixture();
  const first = {
    ...input.plan.steps[0].decision,
    instruction: 'First independent original API role',
  };
  const second = { ...first, instruction: 'Second distinct original API role' };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        first,
        second,
        ...input.plan.steps.slice(2).map((step, index) => ({
          ...step.decision,
          owner: {
            kind: 'planning-step',
            decisionIndex: index,
            stage: 'api-arguments',
          },
        })),
      ],
    },
  });
  const ownership = describeWorkflowDraftClarificationOwnership({
    ...input,
    plan,
  });
  assert.notEqual(plan.steps[0].newNodeId, plan.steps[1].newNodeId);
  assert.deepEqual(
    ownership.map((entry) => entry.owner.nodeId),
    plan.steps.slice(0, 2).map((step) => step.newNodeId),
  );
  const forged = globalThis.structuredClone(plan);
  [forged.steps[0], forged.steps[1]] = [forged.steps[1], forged.steps[0]];
  assert.throws(
    () =>
      describeWorkflowDraftClarificationOwnership({ ...input, plan: forged }),
    /modified identities/,
  );
});

test('connection concerns use the actual removal planning step rather than inventing an executable source for a removed node', async () => {
  const input = await fixture();
  const fields = {
    instruction: input.plan.steps[0].decision.instruction,
    sources: input.plan.steps[0].decision.sources,
  };
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        { ...fields, kind: 'remove-node', nodeId: 'unchanged-pass' },
        {
          ...input.plan.steps[2].decision,
          owner: {
            kind: 'planning-step',
            decisionIndex: 0,
            stage: 'connections',
          },
        },
      ],
    },
  });
  const [entry] = describeWorkflowDraftClarificationOwnership({
    ...input,
    plan,
  });
  assert.deepEqual(entry.owner, {
    kind: 'planning-step',
    stepId: plan.steps[0].id,
    nodeId: 'unchanged-pass',
    stage: 'connections',
  });
});

test('the actual model wire schema cannot mix no-change with edits and does not rely only on a prompt or post-parse refinement', async () => {
  const input = await fixture();
  const sources = [{ kind: 'message', messageId: 'edit-scope' }];
  const unchanged = {
    kind: 'no-change',
    instruction: 'No edit to the entire workflow',
    sources,
  };
  let wire;
  await analyzeWorkflowDraftEdit({
    ...input,
    options: { includeExplanations: false },
    model: {
      withStructuredOutput(schema) {
        wire = schema;
        return {
          async invoke() {
            return { decisions: [unchanged] };
          },
        };
      },
    },
  });
  const require = createRequire(import.meta.url);
  const requireN8n = createRequire(require.resolve('@openapi-flow/n8n'));
  const { Ajv } = requireN8n('ajv');
  const validate = new Ajv({ strict: false }).compile(wire);
  const edit = {
    kind: 'add-api-call',
    operation: 'candidate-1',
    instruction: 'Add a distinct role',
    sources,
  };
  assert.equal(validate({ decisions: [unchanged] }), true);
  assert.equal(validate({ decisions: [edit] }), true);
  assert.equal(validate({ decisions: [edit, unchanged] }), false);
  assert.equal(validate({ decisions: [unchanged, unchanged] }), false);
  assert.equal(validate({ decisions: [] }), false);
});

test('optional reasons and exact evidence are retained as independent owned metadata, not regenerated or silently dropped', async () => {
  const input = await fixture();
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: true },
    proposal: {
      decisions: input.plan.steps.map((step) => ({
        ...step.decision,
        explanation: {
          reason:
            'The explicit current request declares this exact role and its question owner.',
          evidence: step.decision.sources,
        },
      })),
    },
  });
  const described = describeWorkflowDraftClarificationOwnership({
    ...input,
    plan,
  });
  assert.deepEqual(
    described[0].explanation,
    plan.steps[2].decision.explanation,
  );
  described[0].explanation.reason = 'Mutated copy';
  assert.notEqual(
    describeWorkflowDraftClarificationOwnership({ ...input, plan })[0]
      .explanation.reason,
    'Mutated copy',
  );
});

test('staging projects only its own plan identity and never inherits incidental step or stage selectors from a caller', async () => {
  const input = await fixture();
  const whole = stageWorkflowDraftEdit(input);
  const nested = stageWorkflowDraftEdit({
    ...input,
    stepId: 'outer-domain-invalid-step',
    stage: 'outer-domain-not-a-filter',
  });
  assert.deepEqual(nested, whole);
  assert.equal(nested.clarificationOwnership.length, 2);
});

test('producer repair phases are not mistaken for direct question owners or allowed to absorb consumer input concerns', async () => {
  const input = await fixture();
  const fields = {
    instruction: input.plan.steps[0].decision.instruction,
    sources: input.plan.steps[0].decision.sources,
  };
  const native = {
    ...fields,
    kind: 'revise-native-node',
    nodeId: 'unchanged-pass',
  };
  assert.throws(
    () =>
      createWorkflowDraftEditPlan({
        ...input,
        options: { includeExplanations: false },
        proposal: {
          decisions: [
            native,
            {
              ...input.plan.steps[2].decision,
              owner: {
                kind: 'planning-step',
                decisionIndex: 0,
                stage: 'api-bindings',
              },
            },
          ],
        },
      }),
    /has no api-bindings planning stage/,
  );
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        native,
        {
          ...input.plan.steps[2].decision,
          owner: {
            kind: 'planning-step',
            decisionIndex: 0,
            stage: 'native-parameters',
          },
        },
      ],
    },
  });
  assert.equal(
    describeWorkflowDraftClarificationOwnership({ ...input, plan })[0].owner
      .stage,
    'native-parameters',
  );
});

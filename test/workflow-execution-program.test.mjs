import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWorkflowExecutionProgram,
  validateWorkflowExecutionProgram,
  reviseWorkflowExecutionProgram,
  describeWorkflowExecutionProgram,
} from '@openapi-flow/core';
import { createN8nWorkflowProgramControls } from '@openapi-flow/n8n';
import { incrementalConnectionFixture } from './fixtures/incremental-connection-fixture.mjs';

const node = (nodeId) => ({ kind: 'node', nodeId });
function fixture() {
  const original = incrementalConnectionFixture();
  return {
    ...original.source,
    edges: [],
    gaps: [],
    limits: { maxBlocks: 100, maxDepth: 20 },
    controls: createN8nWorkflowProgramControls(),
    program: {
      kind: 'execution-program',
      body: {
        kind: 'sequence',
        steps: [
          node('source'),
          {
            kind: 'parallel',
            branches: ['detail', 'price', 'stock'].map(node),
            join: node('join'),
          },
          node('summary'),
        ],
      },
    },
  };
}

test('compiles structured parallel completion without a model edge or goal ledger', () => {
  const input = fixture();
  const result = resolveWorkflowExecutionProgram(input);
  assert.equal(result.kind, 'resolved-execution-program');
  assert.equal(result.plan.edges.length, 7);
  assert.deepEqual(result.plan.starts, ['source']);
  assert.deepEqual(result.generatedNodeIds, []);
  assert.deepEqual(
    validateWorkflowExecutionProgram({ ...input, result }),
    result,
  );
});
test('code supplies a wait-only barrier without declaring it as business output', () => {
  const input = fixture();
  input.nativeNodes = [];
  input.program.body.steps[1].join = { kind: 'barrier' };
  const result = resolveWorkflowExecutionProgram(input);
  assert.equal(result.generatedNodeIds.length, 1);
  assert.equal(
    result.plan.nativeNodes[0].capability,
    'execution-parallel-barrier',
  );
  assert.deepEqual(result, resolveWorkflowExecutionProgram(input));
});
test('rejects direct sibling fan-in before a consumer can read an unavailable response', () => {
  const input = fixture();
  input.program.body.steps[1] = {
    kind: 'sequence',
    steps: ['detail', 'price', 'stock', 'join'].map(node),
  };
  assert.throws(
    () => resolveWorkflowExecutionProgram(input),
    /explicit parallel completion/,
  );
});
test('rejects omitted, repeated, unknown and unavailable reused nodes', () => {
  for (const mutation of [
    (input) => input.program.body.steps.pop(),
    (input) => input.program.body.steps.push(node('source')),
    (input) => (input.program.body.steps[0] = node('unknown')),
    (input) =>
      (input.program.body.steps[0] = { kind: 'reuse', nodeId: 'source' }),
  ]) {
    const input = fixture();
    mutation(input);
    assert.throws(() => resolveWorkflowExecutionProgram(input));
  }
});
test('requires explicit limits and enforces bounded recursion before recursive schema validation', () => {
  const input = fixture();
  delete input.limits;
  assert.throws(() => resolveWorkflowExecutionProgram(input));
  const deep = fixture();
  deep.limits.maxDepth = 2;
  assert.throws(() => resolveWorkflowExecutionProgram(deep), /maxDepth/);
});
test('revalidates current source, graph and generated controls instead of trusting a receipt', () => {
  const input = fixture();
  const result = resolveWorkflowExecutionProgram(input);
  const stale = globalThis.structuredClone(result);
  stale.plan.edges = [];
  assert.throws(
    () => validateWorkflowExecutionProgram({ ...input, result: stale }),
    /stale/,
  );
  assert.throws(
    () =>
      validateWorkflowExecutionProgram({
        ...input,
        scenario: input.scenario + ' Changed.',
        result,
      }),
    /stale/,
  );
});
test('rejects stale and no-progress revisions while preserving the existing checked record', () => {
  const input = fixture();
  const current = {
    revision: 0,
    result: resolveWorkflowExecutionProgram(input),
  };
  const copy = globalThis.structuredClone(current);
  assert.throws(
    () =>
      reviseWorkflowExecutionProgram({
        ...input,
        current,
        previousSource: input,
        expectedRevision: 1,
      }),
    /expectedRevision/,
  );
  assert.throws(
    () =>
      reviseWorkflowExecutionProgram({
        ...input,
        current,
        previousSource: input,
        expectedRevision: 0,
      }),
    /no progress/,
  );
  assert.deepEqual(current, copy);
});
test('source fingerprints do not depend on a new model goal reconstruction', () => {
  const input = fixture();
  const first = describeWorkflowExecutionProgram(input);
  assert.equal(first.requirements.length, 1);
  assert.equal(first.context.nodes.length, 6);
  assert.equal('goals' in first, false);
  assert.equal('materialValueChoices' in first, false);
});

test('material repair owns a clean source without capturing program factories or model runtime', async () => {
  const {
    createWorkflowProgramMaterialRepair,
    describeWorkflowExecutionProgram,
    inspectWorkflowConnectionMaterialRepairInputs,
  } = await import('@openapi-flow/core');
  const input = fixture();
  const repair = createWorkflowProgramMaterialRepair({
    ...input,
    model: { invoke: () => {} },
    expectedSourceFingerprint:
      describeWorkflowExecutionProgram(input).sourceFingerprint,
    decision: {
      kind: 'replan-materials',
      targets: [{ stage: 'native-parameters', nodeId: 'join' }],
      factIds: input.requirements.map((fact) => fact.id),
      reason: 'Recheck this declared material',
    },
  });
  assert.equal('controls' in repair.source, false);
  assert.equal('limits' in repair.source, false);
  assert.equal('model' in repair.source, false);
  const inspection = inspectWorkflowConnectionMaterialRepairInputs({
    source: repair.source,
    request: repair.request,
    replacement: { apiArguments: [], nativeNodes: input.nativeNodes },
  });
  assert.deepEqual(inspection.unapprovedSlots, []);
});

test('an explicitly prepared source owns immutable data and reuses its checked description across model/validation argument spreads', async () => {
  const {
    prepareWorkflowExecutionProgramSource,
    describeWorkflowExecutionProgram,
  } = await import('@openapi-flow/core');
  const original = fixture();
  const prepared = prepareWorkflowExecutionProgramSource(original);
  const first = describeWorkflowExecutionProgram(prepared);
  assert.equal(describeWorkflowExecutionProgram({ ...prepared }), first);
  assert.throws(() => {
    prepared.materials[0].arguments.values.changed = true;
  }, TypeError);
  assert.throws(
    () =>
      describeWorkflowExecutionProgram({
        ...prepared,
        scenario: 'Replaced source',
      }),
    /prepare the new material revision explicitly/,
  );
  original.scenario = 'New original revision';
  assert.notEqual(prepared.scenario, original.scenario);
  const next = prepareWorkflowExecutionProgramSource({
    ...prepared,
    scenario: original.scenario,
  });
  assert.notEqual(
    describeWorkflowExecutionProgram(next).sourceFingerprint,
    first.sourceFingerprint,
  );
});

test('prepared compilation still validates topology and changed material-source repair receipts', async () => {
  const {
    prepareWorkflowExecutionProgramSource,
    describeWorkflowExecutionProgram,
    createWorkflowProgramMaterialRepair,
    validateWorkflowConnectionSourceRepairRequest,
  } = await import('@openapi-flow/core');
  const original = fixture();
  const source = prepareWorkflowExecutionProgramSource(original);
  const result = resolveWorkflowExecutionProgram({
    ...source,
    program: original.program,
  });
  assert.equal(result.plan.edges.length, 7);
  const repair = createWorkflowProgramMaterialRepair({
    ...source,
    expectedSourceFingerprint:
      describeWorkflowExecutionProgram(source).sourceFingerprint,
    decision: {
      kind: 'replan-materials',
      targets: [{ stage: 'native-parameters', nodeId: 'join' }],
      factIds: source.requirements.map((fact) => fact.id),
      reason: 'Recheck the declared join',
    },
  });
  assert.doesNotThrow(() =>
    validateWorkflowConnectionSourceRepairRequest({
      source: repair.source,
      request: repair.request,
    }),
  );
  assert.throws(
    () =>
      validateWorkflowConnectionSourceRepairRequest({
        source: {
          ...repair.source,
          scenario: 'Changed supplied material revision',
        },
        request: repair.request,
      }),
    /different source snapshot/,
  );
  const invalid = globalThis.structuredClone(original.program);
  invalid.body.steps[1].branches.pop();
  assert.throws(
    () => resolveWorkflowExecutionProgram({ ...source, program: invalid }),
    /parallel completion/,
  );
});

test('prepared control callbacks retain their owning runtime instance without serializing it', async () => {
  const { prepareWorkflowExecutionProgramSource } =
    await import('@openapi-flow/core');
  const { createN8nWorkflowProgramControls } =
    await import('@openapi-flow/n8n');
  class Controls {
    #implementation = createN8nWorkflowProgramControls();
    get version() {
      return this.#implementation.version;
    }
    get capabilities() {
      return this.#implementation.capabilities;
    }
    create(request) {
      return this.#implementation.create(request);
    }
  }
  const input = fixture();
  input.nativeNodes = [];
  input.controls = new Controls();
  input.program.body.steps[1].join = { kind: 'barrier' };
  const source = prepareWorkflowExecutionProgramSource(input);
  assert.equal(
    resolveWorkflowExecutionProgram({ ...source, program: input.program })
      .generatedNodeIds.length,
    1,
  );
});

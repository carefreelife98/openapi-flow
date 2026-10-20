import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { z } from 'zod';
import { collectNativeRuntimeInputSlots } from '@openapi-flow/core';
import { createRuntimeInputNativeCapabilities } from '../packages/n8n/dist/workflow/inputs/create-runtime-input-native-capabilities.js';
import { createBatchIterationInput } from './fixtures/batch-iteration-fixture.mjs';
import {
  compilePlannedN8nWorkflow,
  compileBatchedN8nWorkflow,
  compileReviewableN8nWorkflow,
  compileN8nWorkflowTemplate,
  createJsonOutputCapability,
  createN8nNativeOutputSources,
} from '@openapi-flow/n8n';
import {
  nativeRuntimeCompilationFixture,
  nativeRuntimeInputFixture,
  runtimeNativeSchema,
  runtimeNativeValue,
} from './fixtures/native-runtime-input-fixture.mjs';

const json = (value) => JSON.parse(JSON.stringify(value));
function execute(result, name, items, outputs = {}) {
  const node = result.workflow.nodes.find((node) => node.name === name);
  assert.ok(node, name);
  return vm.runInNewContext(`(function(){${node.parameters.jsCode}\n})()`, {
    $input: { all: () => items },
    $: (source) => ({
      all() {
        assert.ok(Object.hasOwn(outputs, source), source);
        return outputs[source];
      },
    }),
  });
}

for (const [name, compile] of [
  ['planned', compilePlannedN8nWorkflow],
  ['reviewable', compileReviewableN8nWorkflow],
]) {
  test(`${name} compilation exposes original runtime slots and connects preflight to every original root`, async () => {
    const { input } = await nativeRuntimeCompilationFixture();
    const before = globalThis.structuredClone(input.plan);
    const result = compile(input);
    const template = result.nativeInputTemplate;
    assert.equal(result.status, 'complete');
    assert.equal(template.revision, 7);
    assert.equal(template.inputsReady, false);
    assert.equal(template.inputSlots.length, 1);
    assert.equal(template.inputSlots[0].targetPointer, '');
    assert.equal(
      template.inputSlots[0].materializerNodeName,
      'Parameters context',
    );
    assert.equal(template.inputSlots[0].editNodeId, 'openapi-flow-inputs');
    assert.deepEqual(json(execute(result, '입력 설정', [])), [
      { json: { revision: 7, values: {} } },
    ]);
    assert.deepEqual(result.workflow.connections.Start.main[0], [
      { node: '입력 설정', type: 'main', index: 0 },
    ]);
    assert.deepEqual(
      result.workflow.connections['입력 사전 검사'].main[0]
        .map((edge) => edge.node)
        .sort(),
      ['Parameters context', 'Receive health'].sort(),
    );
    assert.match(template.guide, /미입력 값 있음/);
    assert.match(template.guide, /보안 경계/);
    assert.deepEqual(input.plan, before);
    assert.equal(result.workflow.settings.executionOrder, 'v1');
    assert.equal(
      result.workflow.nodes.filter(
        (node) => node.type === 'n8n-nodes-base.manualTrigger',
      ).length,
      1,
    );
    assert.throws(
      () =>
        execute(result, '입력 사전 검사', [
          { json: { revision: 7, values: {} } },
        ]),
      /declared slots/,
    );
  });

  test(`${name} compilation preserves whole and partial input values and checks the actual native guard`, async () => {
    for (const partial of [false, true]) {
      const { input } = await nativeRuntimeCompilationFixture({ partial });
      const first = compile(input);
      const inputValues = Object.fromEntries(
        first.nativeInputTemplate.inputSlots.map((slot) => [
          slot.id,
          partial
            ? slot.targetPointer === '/count'
              ? 0
              : '42'
            : runtimeNativeValue,
        ]),
      );
      const result = compile({
        ...input,
        nativeInputs: { revision: 7, inputValues },
      });
      assert.equal(result.nativeInputTemplate.inputsReady, true);
      assert.equal(
        result.nativeInputTemplate.inputSlots.length,
        partial ? 2 : 1,
      );
      const configured = execute(result, '입력 설정', []);
      const checked = execute(result, '입력 사전 검사', configured);
      const guarded = execute(result, 'Parameters context', [{ json: {} }], {
        '입력 사전 검사': checked,
      });
      assert.deepEqual(json(guarded)[0].json, runtimeNativeValue);
      const altered = json(checked);
      const slot = result.nativeInputTemplate.inputSlots.find(
        (slot) => slot.targetPointer === (partial ? '/count' : ''),
      );
      if (partial) altered[0].json.values[slot.id] = '0';
      else altered[0].json.values[slot.id].count = '0';
      assert.throws(
        () =>
          execute(result, 'Parameters context', [{ json: {} }], {
            '입력 사전 검사': altered,
          }),
        /schema/,
      );
      const stale = json(checked);
      stale[0].json.revision = 8;
      assert.throws(
        () =>
          execute(result, 'Parameters context', [{ json: {} }], {
            '입력 사전 검사': stale,
          }),
        /revision/,
      );
      assert.deepEqual(json(input.nativeInputs), { revision: 7 });
    }
  });

  test(`${name} compilation rejects absent configuration, unknown slots, invalid revisions and wrong types`, async () => {
    const { input } = await nativeRuntimeCompilationFixture();
    assert.throws(
      () => compile({ ...input, nativeInputs: undefined }),
      /nativeInputs.revision is required/,
    );
    for (const nativeInputs of [
      {},
      { revision: -1 },
      { revision: 0.5 },
      { revision: '7' },
      { revision: Number.MAX_SAFE_INTEGER + 1 },
      { revision: 7, unknown: true },
    ]) {
      assert.throws(() => compile({ ...input, nativeInputs }));
    }
    const [slot] = compile(input).nativeInputTemplate.inputSlots;
    for (const inputValues of [
      { stale: {} },
      { [slot.id]: { ...runtimeNativeValue, count: '0' } },
    ]) {
      assert.throws(
        () => compile({ ...input, nativeInputs: { revision: 7, inputValues } }),
        /nativeInputs.inputValues/,
      );
    }
  });

  test(`${name} compilation without runtime ownership retains the existing output shape`, async () => {
    const fixture = await nativeRuntimeInputFixture();
    const result = compile({
      id: 'literal-native',
      name: 'Explicit literal native',
      materials: [],
      apiNodes: [],
      capabilities: fixture.context.capabilities,
      plan: {
        nativeNodes: [
          {
            id: 'context',
            capability: 'runtime-context',
            parameters: runtimeNativeValue,
          },
        ],
        edges: [],
        starts: ['context'],
        gaps: [],
        blockedCalls: [],
      },
    });
    assert.equal(Object.hasOwn(result, 'nativeInputTemplate'), false);
    assert.equal(
      result.workflow.nodes.some((node) => node.id === 'openapi-flow-inputs'),
      false,
    );
    assert.equal(result.workflow.connections.Start.main[0][0].node, 'context');
  });
}

test('reviewable runtime inputs retain both API branches, merge and gap edges while detaching only Start', async () => {
  const { input } = await nativeRuntimeCompilationFixture({
    partial: true,
    gap: true,
  });
  const before = globalThis.structuredClone(input.plan);
  const result = compileReviewableN8nWorkflow(input);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.workflow.connections.Start, undefined);
  assert.equal(result.workflow.active, false);
  assert.deepEqual(result.diagnostics, input.plan.gaps);
  assert.deepEqual(input.plan, before);
  assert.equal(
    result.workflow.connections['입력 설정'].main[0][0].node,
    '입력 사전 검사',
  );
  assert.equal(
    result.workflow.connections['입력 사전 검사'].main[0].length,
    input.plan.starts.length,
  );
  assert.equal(
    result.workflow.connections.context.main[0][0].node,
    'Materialize echo',
  );
  assert.equal(
    result.workflow.connections['Request health'].main[0][0].node,
    'join',
  );
  assert.equal(
    result.workflow.connections['Request echo'].main[0][0].node,
    'join',
  );
  assert.equal(
    result.workflow.connections.join.main[0][0].node,
    '확인 필요 · missing-action',
  );
  const note = result.workflow.nodes.find(
    (node) => node.id === 'openapi-flow-gap-note-missing-action',
  );
  assert.equal(note.parameters.color, 3);
  assert.match(result.nativeInputTemplate.guide, /Start 연결을 끊었습니다/);
});

test('native output source compilation receives the same explicit revision and preserves actual SDK producer names', async () => {
  const { input } = await nativeRuntimeCompilationFixture();
  const sources = createN8nNativeOutputSources({
    nativeNodes: input.plan.nativeNodes,
    capabilities: input.capabilities,
    apiNodeNames: {},
    nativeInputs: input.nativeInputs,
  });
  assert.equal(
    sources.find((source) => source.nodeId === 'context').nodeName,
    'context',
  );
  assert.throws(() =>
    createN8nNativeOutputSources({
      nativeNodes: input.plan.nativeNodes,
      capabilities: input.capabilities,
      apiNodeNames: {},
      nativeInputs: { revision: -1 },
    }),
  );
});

test('runtime compilation preserves private prototype methods', async () => {
  const compilations = [];
  class TypedRuntimeCapability {
    #implementation;
    constructor() {
      this.#implementation = createJsonOutputCapability({
        name: 'runtime-context',
        description: 'Private prototype implementation',
        parametersSchema: runtimeNativeSchema,
      });
      this.name = this.#implementation.name;
      this.description = this.#implementation.description;
      this.parametersSchema = this.#implementation.parametersSchema;
      this.supportsRuntimeParameters = true;
      this.waitsForAllInputs = false;
      this.exclusiveOutputPorts = false;
    }
    inputPorts(parameters) {
      return this.#implementation.inputPorts(parameters);
    }
    outputPorts(parameters) {
      return this.#implementation.outputPorts(parameters);
    }
    responseReferences(parameters) {
      return this.#implementation.responseReferences(parameters);
    }
    outputSchema(parameters) {
      return this.#implementation.outputSchema(parameters);
    }
    parameterReferenceBindings(parameters) {
      return this.#implementation.parameterReferenceBindings(parameters);
    }
    compile(input) {
      assert.equal(input.runtimeInput.revision, 7);
      compilations.push(input.planned.id);
      return this.#implementation.compile(input);
    }
  }
  const capability = new TypedRuntimeCapability();
  const fixture = await nativeRuntimeInputFixture();
  const context = {
    ...fixture.context,
    capabilities: fixture.context.capabilities.map((item) =>
      item.name === capability.name ? capability : item,
    ),
  };
  const result = compileN8nWorkflowTemplate({
    ...fixture,
    context,
    draft: { ...fixture.draft, revision: 7 },
  });
  assert.equal(result.inputSlots.length, 1);
  assert.ok(compilations.includes('context'));
  assert.equal(
    result.workflow.nodes.some((node) => node.name === 'Parameters context'),
    true,
  );
});

test('runtime compiler wrapper retains its explicit context after a material binder returns a fresh implementation', () => {
  function create(sources) {
    const original = createJsonOutputCapability({
      name: 'wrapped',
      description: 'Explicit wrapper protocol',
      parametersSchema: z.strictObject({ value: z.string() }),
    });
    return {
      ...original,
      ...(sources === undefined ? {} : { materialSources: sources }),
      bindMaterialContracts: create,
    };
  }
  const capability = create();
  const planned = {
    id: 'wrapped-node',
    capability: capability.name,
    parameters: {},
    runtimeParameters: true,
  };
  const slots = collectNativeRuntimeInputSlots({
    nativeNodes: [planned],
    capabilities: [capability],
  });
  const [wrapped] = createRuntimeInputNativeCapabilities({
    capabilities: [capability],
    slots,
    revision: 7,
    inputNodeName: 'Explicit input',
  });
  const sources = { apiMaterials: [], nativeOutputs: [] };
  const rebound = wrapped.bindMaterialContracts(sources);
  assert.notEqual(rebound, wrapped);
  assert.deepEqual(rebound.materialSources, sources);
  const fragment = rebound.compile({
    planned,
    apiNodeNames: {},
    position: [0, 0],
  });
  const code = fragment.entry.config.parameters.jsCode;
  assert.match(code, /Explicit input/);
  assert.match(code, /payload.revision!==7/);
});

test('system input identities cannot silently replace an actual native node', async () => {
  const fixture = await nativeRuntimeInputFixture();
  for (const id of ['openapi-flow-inputs', 'openapi-flow-preflight']) {
    assert.throws(
      () =>
        compilePlannedN8nWorkflow({
          id: 'collision',
          name: 'Identity collision',
          materials: [],
          apiNodes: [],
          capabilities: fixture.context.capabilities,
          nativeInputs: { revision: 7 },
          plan: {
            nativeNodes: [
              {
                id,
                capability: 'runtime-context',
                parameters: {},
                runtimeParameters: true,
              },
            ],
            edges: [],
            starts: [id],
            gaps: [],
          },
        }),
      /unique non-empty nodeId/,
    );
  }
});

test('explicit runtime inputs preserve a nonempty finite batch scope and its original API path', () => {
  const original = createBatchIterationInput(2);
  const capability = createJsonOutputCapability({
    name: 'batch-context',
    description: 'Explicit settings before finite batching',
    parametersSchema: z.strictObject({ label: z.string() }),
  });
  const input = {
    ...original,
    capabilities: [...original.capabilities, capability],
    nativeInputs: { revision: 4 },
    plan: {
      ...original.plan,
      starts: ['batch-context'],
      nativeNodes: [
        ...original.plan.nativeNodes,
        {
          id: 'batch-context',
          capability: capability.name,
          parameters: {},
          runtimeParameters: true,
        },
      ],
      edges: [
        { from: 'batch-context', output: 'main', to: 'records', input: 'main' },
        ...original.plan.edges,
      ],
    },
  };
  assert.throws(
    () => compileBatchedN8nWorkflow({ ...input, nativeInputs: undefined }),
    /nativeInputs.revision is required/,
  );
  const result = compileBatchedN8nWorkflow(input);
  assert.equal(result.nativeInputTemplate.revision, 4);
  assert.equal(result.nativeInputTemplate.inputsReady, false);
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.splitInBatches',
    ).length,
    1,
  );
  for (const scope of original.batchScopes) {
    const controller = result.workflow.nodes.find(
      (node) => node.id === scope.id,
    );
    assert.equal(controller.parameters.batchSize, scope.batchSize);
  }
  assert.equal(
    result.workflow.connections['입력 사전 검사'].main[0][0].node,
    'Parameters batch-context',
  );
  assert.equal(
    result.workflow.connections['batch-context'].main[0][0].node,
    original.apiNodes.find((node) => node.nodeId === 'records').entry.name,
  );
});

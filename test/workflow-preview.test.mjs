import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createN8nWorkflowPreview,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import {
  createPlannedWorkflowGenerationGraph,
  createReviewableWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  generationInput,
  previewInput,
  scriptedReviewModel,
} from './fixtures/workflow-preview-fixture.mjs';

function assertNoteOnly(result) {
  assert.equal(result.status, 'needs-review');
  assert.equal(result.executable, false);
  assert.equal(result.workflow, undefined);
  assert.equal(result.previewWorkflow.active, false);
  assert.deepEqual(result.previewWorkflow.connections, {});
  assert.ok(result.previewWorkflow.nodes.length > 0);
  assert.ok(
    result.previewWorkflow.nodes.every(
      (node) => node.type === 'n8n-nodes-base.stickyNote',
    ),
  );
  assert.ok(
    result.previewWorkflow.nodes.every(
      (node) => node.credentials === undefined,
    ),
  );
  assert.match(result.previewWorkflow.name, /^\[REVIEW ONLY\]/);
}

test('preview distinguishes confirmed multi-OAS contracts and reported gaps without executable nodes', async () => {
  const input = await previewInput();
  input.selection.gaps.push({
    kind: 'insufficient_contract',
    description: 'Price currency is unspecified',
    operation: input.selection.operations[1].key,
  });
  const result = await createN8nWorkflowPreview(input);
  assertNoteOnly(result);
  assert.equal(result.previewWorkflow.nodes.length, 5);
  const apiNotes = result.previewWorkflow.nodes.filter((node) =>
    node.id.startsWith('preview-api-'),
  );
  const gapNotes = result.previewWorkflow.nodes.filter((node) =>
    node.id.startsWith('preview-gap-'),
  );
  assert.deepEqual(
    apiNotes.map((note) => note.parameters.color),
    [5, 5],
  );
  assert.deepEqual(
    gapNotes.map((note) => note.parameters.color),
    [3, 3],
  );
  assert.match(apiNotes[0].parameters.content, /GET \/items/);
  assert.match(apiNotes[1].parameters.content, /Document: pricing/);
  assert.match(gapNotes[1].parameters.content, /Document: pricing/);
  assert.equal(result.diagnostics[0].stage, 'api-selection');
  assert.equal(
    JSON.stringify(result.previewWorkflow).includes(
      'not-for-preview.example.test',
    ),
    false,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.deepEqual(
    (await createN8nWorkflowPreview(input)).previewWorkflow,
    result.previewWorkflow,
  );
});

test('missing API preview does not invent an operation, method or request', async () => {
  const input = await previewInput();
  input.selection.operations = [];
  const result = await createN8nWorkflowPreview(input);
  assertNoteOnly(result);
  assert.equal(result.previewWorkflow.nodes.length, 2);
  const note = result.previewWorkflow.nodes[1].parameters.content;
  assert.equal(note.includes('Operation:'), false);
  assert.equal(note.includes('GET'), false);
});

test('zero selected APIs do not bypass catalog integrity or OAS validation', async () => {
  for (const mutate of [
    (input) => {
      input.catalog.documents[0].spec.info.version = 'changed';
    },
    (input) => {
      input.catalog.documents[0].spec.openapi = 'invalid';
    },
    (input) => {
      input.catalog.operations = [];
    },
    (input) => {
      input.catalog.documents = [];
    },
  ]) {
    const input = await previewInput();
    input.selection.operations = [];
    mutate(input);
    await assert.rejects(createN8nWorkflowPreview(input));
  }
});

test('an insufficient-contract gap is resolved even when its API was not selected', async () => {
  const input = await previewInput();
  const key = input.selection.operations[1].key;
  input.selection.operations = [];
  input.selection.gaps = [
    {
      kind: 'insufficient_contract',
      description: 'Review pricing contract',
      operation: key,
    },
  ];
  assertNoteOnly(await createN8nWorkflowPreview(input));
  input.selection.gaps[0].operation = { ...key, snapshotId: 'stale' };
  await assert.rejects(createN8nWorkflowPreview(input), /snapshot/);
});

test('preview rejects malformed metadata and unreported gaps rather than creating defaults', async () => {
  const mutations = [
    (input) => {
      input.id = '';
    },
    (input) => {
      input.selection.operations[0].purpose = ' ';
    },
    (input) => {
      input.selection.gaps[0].description = '';
    },
    (input) => {
      input.selection.gaps[0].operation = input.selection.operations[0].key;
    },
    (input) => {
      input.selection.gaps[0].kind = 'insufficient_contract';
    },
    (input) => {
      input.catalog = {};
    },
    (input) => {
      input.selection.gaps = [];
    },
    (input) => {
      input.credentialBindings = {};
    },
  ];
  for (const mutate of mutations) {
    const input = await previewInput();
    mutate(input);
    await assert.rejects(createN8nWorkflowPreview(input));
  }
});

test('preview rejects stale, unknown and mutated OAS contract references', async () => {
  for (const mutate of [
    (input) => {
      input.selection.operations[0].key.snapshotId = 'stale';
    },
    (input) => {
      input.selection.operations[0].key.documentId = 'missing';
    },
    (input) => {
      input.selection.operations[0].key.operationRef = '#/paths/~1missing/get';
    },
    (input) => {
      input.catalog.documents[0].spec.info.version = 'changed';
    },
  ]) {
    const input = await previewInput();
    mutate(input);
    await assert.rejects(createN8nWorkflowPreview(input));
  }
});

test('scenario and report formatting is escaped while raw diagnostics remain unchanged', async () => {
  const input = await previewInput();
  const text =
    '# heading <script>bad()</script> ![image](https://example.test) ={{ dangerous }}';
  input.scenario = text;
  input.selection.gaps[0].description = text;
  const result = await createN8nWorkflowPreview(input);
  assertNoteOnly(result);
  assert.equal(result.diagnostics[0].description, text);
  const content =
    result.previewWorkflow.nodes[1 + input.selection.operations.length]
      .parameters.content;
  assert.ok(content.includes('\\# heading'));
  assert.ok(content.includes('&lt;script&gt;'));
  assert.equal(content.includes('![image]'), false);
  assert.equal(content.includes('={{ dangerous }}'), false);
});

test('reported graph proposals are textual notes, never native nodes or connections', async () => {
  const input = await previewInput();
  input.selection.gaps = [];
  input.issues = [
    {
      stage: 'workflow-graph',
      description: 'Review missing refund capability',
    },
  ];
  input.proposedNativeNodes = [{ id: 'stop', capability: 'stop-and-error' }];
  input.proposedEdges = [
    { from: 'missing', output: 'main', to: 'stop', input: 'main' },
  ];
  const result = await createN8nWorkflowPreview(input);
  assertNoteOnly(result);
  assert.equal(result.diagnostics[0].kind, 'unmet_requirement');
  assert.equal(result.diagnostics[0].stage, 'workflow-graph');
  assert.match(
    result.previewWorkflow.nodes.at(-1).parameters.content,
    /not validated for execution/,
  );
  assert.match(
    result.previewWorkflow.nodes.at(-1).parameters.content,
    /missing/,
  );
});

const dependencies = (model) => ({
  model,
  capabilities: createN8nNativeCapabilities(),
});

for (const [mode, expectedCalls, expectedStage] of [
  ['selection-gap', ['select_api_operations'], 'api-selection'],
  [
    'binding-gap',
    ['select_api_operations', 'plan_api_bindings'],
    'api-bindings',
  ],
  [
    'graph-gap',
    ['select_api_operations', 'plan_api_bindings', 'plan_workflow_graph'],
    'workflow-graph',
  ],
]) {
  test(`reviewable graph stops at ${mode}, returning only a preview`, async () => {
    const model = scriptedReviewModel(mode);
    const result = await createReviewableWorkflowGenerationGraph(
      dependencies(model),
    ).invoke(generationInput);
    assert.equal(result.workflow, undefined);
    assertNoteOnly(result.preview);
    assert.equal(result.preview.diagnostics[0].stage, expectedStage);
    assert.equal(result.trace.at(-1), 'review-preview');
    assert.deepEqual(model.calls, expectedCalls);
    assert.equal(
      JSON.stringify(result.preview.previewWorkflow).includes(
        'not copied into preview',
      ),
      false,
    );
  });
}

test('existing strict graph still fails on reported gaps', async () => {
  for (const mode of ['selection-gap', 'binding-gap', 'graph-gap']) {
    const model = scriptedReviewModel(mode);
    await assert.rejects(
      createPlannedWorkflowGenerationGraph(dependencies(model)).invoke(
        generationInput,
      ),
      /needs? review/,
    );
  }
});

test('a complete reviewable graph returns the same executable workflow as the strict graph', async () => {
  const model = scriptedReviewModel('complete');
  const result = await createReviewableWorkflowGenerationGraph(
    dependencies(model),
  ).invoke(generationInput);
  const strict = await createPlannedWorkflowGenerationGraph(
    dependencies(scriptedReviewModel('complete')),
  ).invoke(generationInput);
  assert.equal(result.preview, undefined);
  assert.equal(
    result.workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ).length,
    2,
  );
  assert.deepEqual(result.workflow, strict.workflow);
  assert.deepEqual(result.trace, strict.trace);
});

test('invalid model output and invalid graphs remain errors, not previews or retry requests', async () => {
  for (const mode of ['invalid-selection', 'invalid-graph']) {
    const model = scriptedReviewModel(mode);
    await assert.rejects(
      createReviewableWorkflowGenerationGraph(dependencies(model)).invoke(
        generationInput,
      ),
    );
    assert.equal(
      model.calls.filter((name) => name === 'select_api_operations').length,
      1,
    );
    assert.ok(model.calls.length <= 3);
  }
});

test('invalid OAS and pre-supplied output state fail before any model invocation', async () => {
  const input = await previewInput();
  for (const fields of [
    { sources: [{ id: 'bad', spec: { openapi: 'invalid' } }] },
    { preview: await createN8nWorkflowPreview(input) },
    { workflow: { name: 'stale', nodes: [], connections: {} } },
  ]) {
    const model = scriptedReviewModel('complete');
    await assert.rejects(
      createReviewableWorkflowGenerationGraph(dependencies(model)).invoke({
        ...generationInput,
        ...fields,
      }),
    );
    assert.deepEqual(model.calls, []);
  }
});

test('standard-valid documents without REST candidates produce a review without calling the model', async () => {
  const model = scriptedReviewModel('complete');
  const result = await createReviewableWorkflowGenerationGraph(
    dependencies(model),
  ).invoke({
    ...generationInput,
    sources: [
      {
        id: 'empty',
        spec: {
          openapi: '3.1.0',
          info: { title: 'Empty REST catalog', version: '1' },
          paths: {},
        },
      },
    ],
  });
  assertNoteOnly(result.preview);
  assert.equal(result.preview.previewWorkflow.nodes.length, 2);
  assert.match(
    result.preview.diagnostics[0].description,
    /no REST operation candidates/,
  );
  assert.deepEqual(model.calls, []);
});

test('catalog operation identities do not depend on object property order', async () => {
  const input = await previewInput();
  input.catalog.operations = input.catalog.operations.map((item) => ({
    ...item,
    key: {
      operationRef: item.key.operationRef,
      snapshotId: item.key.snapshotId,
      documentId: item.key.documentId,
    },
  }));
  assertNoteOnly(await createN8nWorkflowPreview(input));
});

test('missing required request values remain clarification errors, not gap previews', async () => {
  const sources = JSON.parse(JSON.stringify(generationInput.sources));
  sources[0].spec.paths['/items'].get.parameters = [
    { in: 'query', name: 'id', required: true, schema: { type: 'string' } },
  ];
  const model = scriptedReviewModel('complete');
  await assert.rejects(
    createReviewableWorkflowGenerationGraph(dependencies(model)).invoke({
      ...generationInput,
      sources,
    }),
    /clarification/,
  );
  assert.deepEqual(model.calls, [
    'select_api_operations',
    'plan_api_bindings',
    'generate_api_arguments',
  ]);
});

test('unsupported authentication in a complete plan remains a compiler error', async () => {
  const sources = JSON.parse(JSON.stringify(generationInput.sources));
  sources[0].spec.components = {
    securitySchemes: {
      oauth: {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: 'https://auth.example.test/token',
            scopes: {},
          },
        },
      },
    },
  };
  sources[0].spec.security = [{ oauth: [] }];
  const model = scriptedReviewModel('complete');
  await assert.rejects(
    createReviewableWorkflowGenerationGraph(dependencies(model)).invoke({
      ...generationInput,
      sources,
    }),
    /security|auth/i,
  );
  assert.deepEqual(model.calls, [
    'select_api_operations',
    'plan_api_bindings',
    'plan_workflow_graph',
  ]);
});

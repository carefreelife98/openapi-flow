import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ChatOpenAI } from '@langchain/openai';
import {
  generateWorkflowDraftApiInputEdits,
  WorkflowDraftApiInputEditPlanningError,
} from '@openapi-flow/langchain';
import {
  createWorkflowDraftApiInputEditContract,
  resolveWorkflowDraftApiInputEdits,
} from '@openapi-flow/core';
import { schemaDraftInputEditFixture } from './fixtures/workflow-draft-api-input-edit-fixture.mjs';

async function input(text) {
  const f = await schemaDraftInputEditFixture({}, null, text);
  const contract = createWorkflowDraftApiInputEditContract({
    ...f,
    proposal: {
      targets: [{ kind: 'set', pointer: '/body', sources: f.sources }],
    },
  });
  const resolve = (value, sourceText, sourceFormat = 'json') =>
    resolveWorkflowDraftApiInputEdits({
      ...f,
      contract,
      output: {
        values: {
          [contract.targets[0].id]: {
            status: 'provided',
            value,
            source: { messageId: 'edit-1', sourceFormat, sourceText },
          },
        },
      },
    });
  return { ...f, contract, resolve };
}

for (const example of [
  { text: 'Set body to 12.', value: 2, sourceText: '2', format: 'json' },
  { text: 'Set body to 3.25.', value: 3, sourceText: '3', format: 'json' },
  { text: 'Set body to 012.', value: 0, sourceText: '0', format: 'json' },
  { text: 'Set body to .25.', value: 25, sourceText: '25', format: 'json' },
  { text: 'Set body to 1e+2.', value: 1, sourceText: '1', format: 'json' },
  { text: 'Set body to 1e+.', value: 1, sourceText: '1', format: 'json' },
  { text: 'Set body to +12.', value: 12, sourceText: '12', format: 'json' },
  { text: 'Use JSON "true".', value: true, sourceText: 'true', format: 'json' },
  { text: 'Use JSON "null".', value: null, sourceText: 'null', format: 'json' },
  {
    text: 'Use JSON "sku-012".',
    value: '012',
    sourceText: '012',
    format: 'text',
  },
]) {
  test(`API input edits reject a partial literal source: ${example.text}`, async () => {
    const f = await input(example.text);
    const before = globalThis.structuredClone(f.draft);
    assert.throws(
      () => f.resolve(example.value, example.sourceText, example.format),
      /sourceText.*complete literal/,
    );
    assert.deepEqual(f.draft, before);
  });
}

test('complete JSON and verbatim text input edits retain types without repairing partial source quotes', async () => {
  for (const value of [
    12,
    false,
    null,
    '012',
    {},
    [],
    { nested: [0, false, null, ''] },
  ]) {
    const sourceText = JSON.stringify(value);
    const f = await input(`Use complete JSON ${sourceText}.`);
    const result = f.resolve(value, sourceText);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.resolution.edits, [
      { kind: 'set', pointer: '/body', value },
    ]);
  }
  const f = await input('Use body sku-new.');
  assert.equal(f.resolve('sku-new', 'sku-new', 'text').status, 'ready');
  const quoted = await input('Use body "sku-new".');
  assert.throws(
    () => quoted.resolve('sku-new', 'sku-new', 'text'),
    /complete literal/,
  );
  assert.equal(quoted.resolve('sku-new', '"sku-new"').status, 'ready');
});

test('actual structured-output HTTP input edits reject a partial source once and preserve the rejected output', async () => {
  const f = await input('Set body to 12.');
  const output = {
    values: {
      [f.contract.targets[0].id]: {
        status: 'provided',
        value: 2,
        source: { messageId: 'edit-1', sourceFormat: 'json', sourceText: '2' },
      },
    },
  };
  const requests = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    requests.push(JSON.parse(raw));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        id: 'source-boundary-rejection',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(output) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    await assert.rejects(
      generateWorkflowDraftApiInputEdits({ ...f, model }),
      (error) =>
        error instanceof WorkflowDraftApiInputEditPlanningError &&
        error.failure.stage === 'values' &&
        JSON.stringify(error.failure.output) === JSON.stringify(output) &&
        /sourceText.*complete literal/.test(error.cause.message),
    );
    assert.equal(requests.length, 1);
    assert.equal(
      requests[0].response_format.json_schema.name,
      'generate_draft_api_input_edit_values',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

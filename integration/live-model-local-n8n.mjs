import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile, execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { promisify } from 'node:util';
import { ChatOpenAI } from '@langchain/openai';
import { generateWorkflow } from '../examples/legacy-generation/dist/generate-workflow.js';

const image = 'n8nio/n8n:2.37.10';
const suffix = `${process.pid}-${Date.now()}`;
const volume = `openapi-flow-live-${suffix}`;
const received = [];
const execFileAsync = promisify(execFile);

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${name} is required`);
  return value;
}

function docker(args, input) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
    timeout: 90_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function n8n(args, input) {
  return docker(
    [
      'run',
      '--rm',
      '-i',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
      ...args,
    ],
    input,
  );
}

async function n8nAsync(args) {
  const { stdout } = await execFileAsync(
    'docker',
    [
      'run',
      '--rm',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
      ...args,
    ],
    { timeout: 90_000 },
  );
  return stdout;
}

const spec = {
  openapi: '3.1.0',
  info: { title: 'Local live-model smoke', version: '1' },
  paths: {
    '/items/{id}': {
      get: {
        summary: 'Read an item by its id and optional tags',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          {
            name: 'tags',
            in: 'query',
            schema: { type: 'array', items: { type: 'string' } },
          },
        ],
        responses: { 200: { description: 'ok' } },
      },
    },
    '/items': {
      post: {
        summary: 'Create an item with a name and integer quantity',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'quantity'],
                properties: {
                  name: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'ok' } },
      },
    },
  },
};

const responder = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received.push({
    method: request.method,
    url: request.url,
    body: Buffer.concat(chunks).toString('utf8'),
  });
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ ok: true }));
});

let volumeCreated = false;
let phase = 'initialize';
try {
  const modelName = requiredEnv('MODEL_NAME');
  const modelBaseUrl = requiredEnv('LLM_BASE_URL');
  const modelApiKey = requiredEnv('LLM_API_KEY');
  if (new URL(modelBaseUrl).protocol !== 'https:')
    throw new Error('LLM_BASE_URL must use HTTPS');
  const modelHeaderName = process.env.LLM_MODEL_HEADER_NAME;
  if (modelHeaderName !== undefined && modelHeaderName.trim() === '')
    throw new Error('LLM_MODEL_HEADER_NAME must be non-empty when provided');
  const model = new ChatOpenAI({
    model: modelName,
    apiKey: modelApiKey,
    maxRetries: 0,
    configuration: {
      baseURL: modelBaseUrl,
      defaultHeaders: modelHeaderName ? { [modelHeaderName]: modelName } : {},
    },
  });
  await new Promise((resolve) => responder.listen(0, '0.0.0.0', resolve));
  const address = responder.address();
  assert.ok(address && typeof address !== 'string');
  const getRef = '#/paths/~1items~1{id}/get';
  const postRef = '#/paths/~1items/post';
  const baseUrl = `http://host.docker.internal:${address.port}`;
  const cases = [
    {
      spec,
      scenario: 'Read item 42 with tags blue and black',
      profile: 'read-only',
      effect: 'read',
      expectedRef: getRef,
      expectedInputs: { 'path.id': '42', 'query.tags': ['blue', 'black'] },
      expectedRequest: {
        method: 'GET',
        url: '/items/42?tags=blue&tags=black',
        body: '',
      },
    },
    {
      spec,
      scenario: 'Create an item named demo with quantity 3',
      profile: 'test',
      effect: 'write',
      expectedRef: postRef,
      expectedInputs: { body: { name: 'demo', quantity: 3 } },
      expectedRequest: {
        method: 'POST',
        url: '/items',
        body: JSON.stringify({ name: 'demo', quantity: 3 }),
      },
    },
  ];
  const realCaseJson = process.env.OPENAPI_FLOW_REAL_CASE_JSON;
  if (realCaseJson !== undefined) {
    const realCase = JSON.parse(realCaseJson);
    if (
      realCase === null ||
      typeof realCase !== 'object' ||
      Array.isArray(realCase) ||
      typeof realCase.specFile !== 'string' ||
      realCase.specFile.trim() === '' ||
      typeof realCase.scenario !== 'string' ||
      realCase.scenario.trim() === '' ||
      typeof realCase.expectedRef !== 'string' ||
      realCase.expectedRef.trim() === '' ||
      !['read', 'write'].includes(realCase.effect) ||
      !['read-only', 'test'].includes(realCase.profile) ||
      realCase.expectedInputs === null ||
      typeof realCase.expectedInputs !== 'object' ||
      Array.isArray(realCase.expectedInputs) ||
      realCase.expectedRequest === null ||
      typeof realCase.expectedRequest !== 'object' ||
      typeof realCase.expectedRequest.method !== 'string' ||
      typeof realCase.expectedRequest.url !== 'string' ||
      typeof realCase.expectedRequest.body !== 'string'
    )
      throw new Error('OPENAPI_FLOW_REAL_CASE_JSON is missing required fields');
    cases.push({
      ...realCase,
      spec: JSON.parse(await readFile(realCase.specFile, 'utf8')),
    });
  }
  const workflows = [];
  for (const testCase of cases) {
    phase = `generate ${testCase.expectedRef}`;
    const result = await generateWorkflow({
      spec: testCase.spec,
      scenario: testCase.scenario,
      model,
      baseUrl,
      profile: testCase.profile,
      effectPolicy: { [testCase.expectedRef]: testCase.effect },
      credentialBindings: {},
    });
    assert.equal(result.status, 'complete');
    assert.equal(result.plan.operationRef, testCase.expectedRef);
    assert.deepEqual(result.plan.inputs, testCase.expectedInputs);
    assert.deepEqual(
      result.workflow.nodes.map((node) => node.type),
      ['n8n-nodes-base.manualTrigger', 'n8n-nodes-base.httpRequest'],
    );
    workflows.push(result.workflow);
  }
  docker(['volume', 'create', volume]);
  volumeCreated = true;
  for (const workflow of workflows) {
    phase = `import ${workflow.id}`;
    n8n(['import:workflow', '--input=/dev/stdin'], JSON.stringify(workflow));
  }
  for (let index = 0; index < workflows.length; index += 1) {
    phase = `execute ${workflows[index].id}`;
    const execution = await n8nAsync([
      'execute',
      `--id=${workflows[index].id}`,
      '--rawOutput',
    ]);
    assert.match(execution, /"finished"\s*:\s*true/);
    assert.match(execution, /"status"\s*:\s*"success"/);
    assert.equal(received.length, index + 1);
    assert.deepEqual(received[index], cases[index].expectedRequest);
  }
  process.stdout.write(
    JSON.stringify({
      modelCalls: cases.length * 2,
      n8nExecutions: workflows.length,
      realOas: realCaseJson !== undefined,
      requests: received,
      success: true,
    }) + '\n',
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      phase,
      error: error instanceof Error ? error.message : String(error),
      stderr:
        typeof error?.stderr === 'string'
          ? error.stderr.slice(-2000)
          : undefined,
    }) + '\n',
  );
  throw error;
} finally {
  if (volumeCreated) {
    let cleanupError;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        docker(['volume', 'rm', volume]);
        cleanupError = undefined;
        break;
      } catch (error) {
        cleanupError = error;
        await delay(1000);
      }
    }
    if (cleanupError)
      process.stderr.write(
        JSON.stringify({
          phase: 'cleanup',
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        }) + '\n',
      );
  }
  responder.close();
}

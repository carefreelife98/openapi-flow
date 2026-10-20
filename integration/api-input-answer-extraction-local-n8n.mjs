import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import process from 'node:process';
import { URL } from 'node:url';
import {
  createApiCatalog,
  resolveApiOperations,
  inspectApiArgumentRequirements,
  validateApiInputAnswerExtractionRecord,
  validateApiInputAnswers,
  applyConfirmedApiInputs,
  createApiArgumentsSchema,
  createApiResponseSchema,
} from '@openapi-flow/core';
import { analyzeApiInputAnswers } from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Real ICL source contracts; only local fixture credentials and API requests. */
export async function verifyApiInputAnswerExtraction({ model, spec, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/api-input-answer-extraction/${runId}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const catalog = await createApiCatalog([{ id: 'icl', spec }]);
  const candidate = catalog.operations.find(
    (item) => item.method === 'GET' && item.path === '/item/core/getItemInfo',
  );
  assert.ok(
    candidate,
    'Original ICL OAS must declare the tested item-info operation',
  );
  const [operation] = await resolveApiOperations(catalog, [candidate.key]);
  const callId = 'read-item';
  const { requirements } = inspectApiArgumentRequirements({
    operation,
    callId,
    values: {},
    bindings: [],
  });
  assert.equal(requirements.length, 1);
  assert.equal(requirements[0].targetPointer, '/query/gdNo');
  const argsSchema = createApiArgumentsSchema({ operation, bindings: [] });
  const require = createRequire(
    new URL('../packages/n8n/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const responseBody = {};
  const validateResponse = ajv.compile(createApiResponseSchema({ operation }));
  assert.equal(
    validateResponse({
      statusCode: 200,
      mediaType: 'application/json',
      body: responseBody,
    }),
    true,
    JSON.stringify(validateResponse.errors),
  );
  const requests = [],
    failures = [];
  let expected;
  const localToken = 'local-contract-only-not-a-service-token';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://local.fixture');
    requests.push({
      method: request.method,
      path: url.pathname,
      query: [...url.searchParams],
    });
    try {
      assert.equal(request.method, 'GET');
      assert.equal(url.pathname, candidate.path);
      assert.equal(request.headers.authorization, `Bearer ${localToken}`);
      const values = { query: Object.fromEntries(url.searchParams) };
      argsSchema.parse({ values });
      assert.deepEqual(values, expected);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(responseBody));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  const volume = `openapi-flow-answer-extraction-${runId}`,
    image = 'n8nio/n8n:2.37.10';
  let created = false,
    phase = 'initialize';
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const made = await runDocker(['volume', 'create', volume]);
    assert.equal(made.code, 0, made.stderr);
    created = true;
    const runtime = [
      'run',
      '--rm',
      '-i',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
    ];
    const importedCredential = await runDocker(
      [...runtime, 'import:credentials', '--input=/dev/stdin'],
      JSON.stringify([
        {
          id: 'local-answer-bearer',
          name: 'Local contract bearer',
          type: 'httpBearerAuth',
          data: { token: localToken },
        },
      ]),
    );
    assert.equal(importedCredential.code, 0, importedCredential.stderr);
    const cases = [
      {
        name: 'explicit-id',
        reply: '상품번호는 "fixture-answer-01"이야.',
        value: 'fixture-answer-01',
      },
      { name: 'no-value', reply: '아직 상품번호를 몰라.' },
      {
        name: 'numeric-string',
        reply: '상품번호는 문자열 "2"로 지정해줘.',
        value: '2',
      },
    ];
    for (const item of cases) {
      phase = `${item.name}-model`;
      const result = await analyzeApiInputAnswers({
        reply: item.reply,
        requirements,
        model,
        includeExplanations: true,
      });
      await writeFile(
        new URL(`${item.name}-analysis.json`, directory),
        JSON.stringify(result, null, 2),
      );
      validateApiInputAnswerExtractionRecord({
        reply: item.reply,
        requirements,
        record: result.extraction,
      });
      if (item.name === 'no-value') {
        assert.deepEqual(result.answers, []);
        assert.deepEqual(
          result.unansweredRequirementIds,
          requirements.map((item) => item.id),
        );
        continue;
      }
      assert.deepEqual(result.answers, [
        { requirementId: requirements[0].id, value: item.value },
      ]);
      const checked = validateApiInputAnswers({
        requirements,
        answers: result.answers,
        operations: [operation.key],
      });
      assert.equal(checked.status, 'accepted');
      const values = applyConfirmedApiInputs({
        operation,
        callId,
        values: {},
        bindings: [],
        confirmedInputs: checked.confirmedInputs,
      });
      expected = { query: { gdNo: item.value } };
      assert.deepEqual(values, expected);
      const fragment = createHttpRequestNode({
        operation,
        arguments: { callId, values, bindings: [], unresolvedInputs: [] },
        baseUrl: `http://host.docker.internal:${server.address().port}`,
        credentialBindings: {
          'JWT Access Token': {
            id: 'local-answer-bearer',
            name: 'Local contract bearer',
          },
        },
        position: [300, 0],
      });
      const compiled = assembleN8nWorkflow({
        id: `answer-${item.name}-${runId}`,
        name: 'ICL 입력 답변 검증',
        nodes: [fragment],
        starts: [callId],
        edges: [],
      });
      assert.equal(compiled.status, 'complete');
      await writeFile(
        new URL(`${item.name}-workflow.json`, directory),
        JSON.stringify(compiled.workflow, null, 2),
      );
      phase = `${item.name}-n8n`;
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([compiled.workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${compiled.workflow.id}`,
        '--rawOutput',
      ]);
      assert.equal(raw.code, 0, raw.stderr);
      const execution = readN8nExecution(raw.stdout);
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      await writeFile(
        new URL(`${item.name}-execution-summary.json`, directory),
        JSON.stringify(
          { status: execution.status, request: requests.at(-1) },
          null,
          2,
        ),
      );
    }
    assert.equal(requests.length, 2);
    assert.deepEqual(failures, []);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          modelCalls: 3,
          executions: 2,
          requests,
          businessApiCalls: 0,
          scope:
            'Actual answer-source extraction only. Operation selection is a fixed real ICL fixture; optional request fields are omitted, no value coercion or model retry. Local fixture bearer, not a real ICL credential. Empty object response satisfies the original OAS response schema; no production behavior is claimed.',
        },
        null,
        2,
      ),
    );
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          phase,
          errorType: error.name,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          requests,
          failures,
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    try {
      await new Promise((resolve) => server.close(resolve));
    } finally {
      if (created) {
        const removed = await runDocker(['volume', 'rm', volume]);
        assert.equal(removed.code, 0, removed.stderr);
      }
    }
  }
}

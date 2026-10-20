import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, URLSearchParams } from 'node:url';
import process from 'node:process';
import { validateApiRequestMediaTypeDecision } from '@openapi-flow/core';
import { requestMediaConversationFixture } from '../test/fixtures/request-media-decisions-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Actual public conversation -> unchanged SDK output -> isolated runtime; no business calls. */
export async function verifyRequestMediaDecisions({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/request-media-decisions/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-request-media-decisions-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    cases = [];
  let created = false,
    phase = 'initialize';
  let expectedMediaType;
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const mediaType = request.headers['content-type']?.split(';')[0];
    requests.push({
      method: request.method,
      path: request.url,
      mediaType,
      body: raw,
    });
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/validate');
      assert.equal(mediaType, expectedMediaType);
      if (mediaType === 'application/json')
        assert.deepEqual(JSON.parse(raw), { label: 'fixture-label', count: 3 });
      else
        assert.deepEqual([...new URLSearchParams(raw).entries()].sort(), [
          ['count', '3'],
          ['label', 'fixture-label'],
        ]);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ valid: true }));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
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
    for (const item of [
      {
        id: 'explicit-form',
        kind: 'model-selection',
        mediaType: 'application/x-www-form-urlencoded',
        instruction:
          '요청 형식은 application/x-www-form-urlencoded로 명시한다.',
      },
      {
        id: 'unspecified-format',
        kind: 'documented-default',
        mediaType: 'application/json',
        instruction: '',
      },
    ]) {
      phase = `${item.id}:planning`;
      const fixture = await requestMediaConversationFixture({
        model,
        includeExplanations: true,
        deployments: [
          {
            documentId: 'media-decision',
            baseUrl: `http://host.docker.internal:${server.address().port}`,
          },
        ],
      });
      const scenario = `${fixture.scenario}${item.instruction ? ` ${item.instruction}` : ''}`;
      const state = await fixture.graph.invoke(
        {
          input: {
            initialDraft: fixture.draft,
            request: { id: item.id, text: scenario, expectedRevision: 0 },
          },
        },
        fixture.config,
      );
      await writeFile(
        new URL(`${item.id}-state.json`, directory),
        JSON.stringify(state, null, 2),
      );
      assert.equal(
        state.phase,
        'complete',
        'Unresolved questions must remain visible, not be repaired by the driver',
      );
      assert.equal(state.artifact.triggerConnected, true);
      const stage = Object.values(state.stageResults).find(
        (result) => result.kind === 'request-media',
      );
      assert.ok(stage);
      const decision = stage.decision;
      assert.equal(decision.kind, item.kind);
      assert.equal(decision.requestMediaType, item.mediaType);
      assert.equal(
        decision.assessment.requestMediaType,
        item.kind === 'documented-default' ? null : item.mediaType,
      );
      assert.ok(decision.assessment.explanation.reason.trim());
      const suppliedScenario = decision.assessment.explanation.evidence[0].text;
      assert.equal(
        JSON.parse(suppliedScenario).messages.find(
          (message) => message.id === item.id,
        ).text,
        scenario,
      );
      validateApiRequestMediaTypeDecision({
        operation: fixture.operation,
        scenario: suppliedScenario,
        decision,
      });
      assert.equal(state.draft.apiCalls.length, 1);
      assert.deepEqual(state.draft.apiCalls[0].values, {
        body: { label: 'fixture-label', count: 3 },
      });
      const workflow = {
        ...state.artifact.workflow,
        id: `${item.id}-${runId}`,
      };
      await writeFile(
        new URL(`${item.id}-workflow.json`, directory),
        JSON.stringify(workflow, null, 2),
      );
      phase = `${item.id}:n8n`;
      expectedMediaType = item.mediaType;
      const before = requests.length;
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${workflow.id}`,
        '--rawOutput',
      ]);
      assert.equal(raw.code, 0, raw.stderr);
      const execution = readN8nExecution(raw.stdout);
      await writeFile(
        new URL(`${item.id}-execution.json`, directory),
        JSON.stringify(execution, null, 2),
      );
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      assert.equal(requests.length - before, 1);
      assert.deepEqual(serverErrors, []);
      cases.push({
        id: item.id,
        scenario,
        kind: decision.kind,
        requestMediaType: decision.requestMediaType,
        assessment: decision.assessment,
        localHttpRequests: requests.slice(before),
      });
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          cases,
          businessApiCalls: 0,
          scope:
            'Two independent one-API canonical conversations: explicit form selection versus unspecified-format assessment with the existing JSON default, retained reasons/sources at actual stages, official SDK import and actual local POSTs. No output repair, model retry, invented human answers or business API calls.',
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
          label,
          errorType: error.name,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          completedCases: cases,
          requests,
          serverErrors,
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

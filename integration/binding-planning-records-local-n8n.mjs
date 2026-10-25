import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { validateApiBindingPlanningRecord } from '@openapi-flow/core';
import { planApiBindings, generateApiArguments } from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
  createN8nNativeCapabilities,
} from '@openapi-flow/n8n';
import { bindingPlanningFixture } from '../test/fixtures/binding-planning-record-fixture.mjs';
import {
  bindingPlan,
  graphPlan,
  names,
} from '../test/fixtures/request-binding-fixture.mjs';
import {
  material,
  nativeOutputs,
  bindings,
  capabilities,
  nativeNodes,
  plan as nativePlan,
  sources as nativeSources,
} from '../test/fixtures/native-output-binding-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Actual binding proposals; topology/native settings are explicit fixture inputs, not model output. */
export async function verifyBindingPlanningRecords({
  model,
  label,
  bindingPlanner = planApiBindings,
}) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/binding-planning-records/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-binding-records-${runId}`,
    image = 'n8nio/n8n:2.37.10';
  const requests = [],
    failures = [];
  let source,
    created = false,
    phase = 'api-bindings';
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture.local');
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const received = {
        path: url.pathname,
        query: [...url.searchParams],
        ...(raw ? { body: JSON.parse(raw) } : {}),
      };
      requests.push(received);
      let body;
      if (url.pathname === '/source') body = source;
      else if (url.pathname.startsWith('/detail/')) {
        assert.equal(decodeURIComponent(url.pathname.slice(8)), source.id);
        body = { id: source.id };
      } else if (url.pathname === '/price') {
        assert.equal(url.searchParams.get('id'), source.id);
        assert.equal(url.searchParams.get('labels'), source.labels.join('|'));
        assert.equal(
          url.searchParams.get('filter[R]'),
          String(source.filter.R),
        );
        body = { price: 12.5 };
      } else if (url.pathname === '/stock') {
        assert.equal(url.searchParams.get('id'), source.id);
        body = { stock: 0 };
      } else if (url.pathname === '/summary') {
        assert.deepEqual(received.body, {
          id: source.id,
          price: 12.5,
          stock: 0,
          labels: source.labels,
          filter: source.filter,
        });
        body = received.body;
      } else throw new Error('Unexpected fixture route ' + url.pathname);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  await mkdir(directory, { recursive: true });
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const baseUrl = `http://host.docker.internal:${server.address().port}`;
    const input = bindingPlanningFixture();
    input.scenario =
      '선택된 source 호출의 응답 id로 detail의 path.id와 price·stock의 query.id를 연결해줘. price의 query.labels와 query.filter는 source 응답의 labels 배열과 filter 객체를 그대로 사용해줘. summary 본문의 id는 detail 응답 id, price는 price 응답 price, stock은 stock 응답 stock, labels와 filter는 source 응답의 해당 필드를 그대로 사용해줘. source에는 선행 입력이 없어. 이 단계에서는 요청 입력 연결만 계획하며 상태 검사·제어 흐름·값 변환은 추가하지 마.';
    const proposed = await bindingPlanner({
      ...input,
      model,
      includeExplanations: true,
    });
    assert.deepEqual(
      proposed.gaps,
      [],
      'A model gap remains a visible failure; do not repair it',
    );
    validateApiBindingPlanningRecord({
      ...input,
      plan: proposed,
      record: proposed.bindingPlanning,
    });
    const canonical = (calls) =>
      calls
        .map((call) => ({
          callId: call.callId,
          bindings: [...call.bindings].sort((a, b) =>
            a.targetPointer.localeCompare(b.targetPointer),
          ),
        }))
        .sort((a, b) => a.callId.localeCompare(b.callId));
    assert.deepEqual(canonical(proposed.calls), canonical(bindingPlan.calls));
    await writeFile(
      new URL('api-binding-plan.json', directory),
      JSON.stringify(proposed, null, 2),
    );
    const materials = [];
    for (const selected of input.materials) {
      const call = proposed.calls.find((x) => x.callId === selected.callId);
      assert.ok(call);
      const args = await generateApiArguments({
        ...selected,
        bindings: call.bindings,
        scenario: input.scenario,
      });
      assert.deepEqual(args.values, {});
      assert.deepEqual(args.unresolvedInputs, []);
      materials.push({ operation: selected.operation, arguments: args });
    }
    const compiled = compilePlannedN8nWorkflow({
      id: `binding-provenance-${runId}`,
      name: 'Model binding proposal with explicit fixture topology',
      plan: graphPlan,
      materials,
      capabilities: createN8nNativeCapabilities(),
      apiNodes: materials.map((m, i) =>
        createHttpRequestNode({
          ...m,
          baseUrl,
          credentialBindings: {},
          apiNodeNames: names,
          position: [300, i * 200],
        }),
      ),
    });
    assert.equal(
      JSON.stringify(compiled.workflow).includes('bindingPlanning'),
      false,
    );
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(compiled.workflow, null, 2),
    );
    phase = 'api-n8n';
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
    const execute = async (workflow, file) => {
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
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      await writeFile(
        new URL(file, directory),
        JSON.stringify(execution, null, 2),
      );
    };
    const runtimeResults = [];
    for (const mode of ['first-runtime-source', 'changed-runtime-source']) {
      source = {
        id: randomUUID(),
        labels: ['runtime a', 'b'],
        filter: { R: 2 },
      };
      const offset = requests.length;
      await execute(compiled.workflow, `${mode}.execution.json`);
      const received = requests.slice(offset);
      assert.equal(received.length, 5);
      assert.equal(received[0].path, '/source');
      assert.equal(received.at(-1).path, '/summary');
      runtimeResults.push({
        mode,
        source: globalThis.structuredClone(source),
        requests: received,
      });
    }
    assert.notEqual(runtimeResults[0].source.id, runtimeResults[1].source.id);
    phase = 'native-bindings';
    const nativeInput = {
      scenario:
        '명시적으로 제공된 context native 출력의 id를 detail의 path.id에 변환 없이 연결해줘.',
      materials: [material],
      nativeOutputs,
    };
    const nativeProposed = await bindingPlanner({
      ...nativeInput,
      model,
      includeExplanations: true,
    });
    assert.deepEqual(nativeProposed.gaps, []);
    assert.deepEqual(nativeProposed.calls, [
      { callId: material.callId, bindings },
    ]);
    validateApiBindingPlanningRecord({
      ...nativeInput,
      plan: nativeProposed,
      record: nativeProposed.bindingPlanning,
    });
    const nativeArgs = await generateApiArguments({
      ...material,
      scenario: nativeInput.scenario,
      bindings: nativeProposed.calls[0].bindings,
    });
    assert.deepEqual(nativeArgs.values, {});
    assert.deepEqual(nativeArgs.unresolvedInputs, []);
    const nativeCompiled = compilePlannedN8nWorkflow({
      id: `native-binding-provenance-${runId}`,
      name: 'Declared native output binding',
      plan: nativePlan,
      capabilities,
      materials: [{ operation: material.operation, arguments: nativeArgs }],
      apiNodes: [
        createHttpRequestNode({
          operation: material.operation,
          arguments: nativeArgs,
          baseUrl,
          credentialBindings: {},
          nativeOutputSources: nativeSources,
          position: [300, 0],
        }),
      ],
    });
    assert.equal(
      JSON.stringify(nativeCompiled.workflow).includes('bindingPlanning'),
      false,
    );
    await writeFile(
      new URL('native-binding-plan.json', directory),
      JSON.stringify(nativeProposed, null, 2),
    );
    await writeFile(
      new URL('native-workflow.json', directory),
      JSON.stringify(nativeCompiled.workflow, null, 2),
    );
    source = { id: nativeNodes[0].parameters.id };
    const offset = requests.length;
    phase = 'native-n8n';
    await execute(nativeCompiled.workflow, 'native.execution.json');
    assert.equal(requests.length - offset, 1);
    assert.deepEqual(failures, []);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          runtimeResults,
          nativeRequests: requests.slice(offset),
          businessApiCalls: 0,
          scope:
            'Two actual binding model calls with optional per-call reasons and code-owned source context. Five-API graph topology and native node parameters are explicit fixtures, not generated by these calls. Fully bound argument generation uses no model. The same compiled DAG executes twice against newly generated runtime source IDs; native JSON output executes once. Eleven local requests; no automatic model retry or output repair.',
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
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

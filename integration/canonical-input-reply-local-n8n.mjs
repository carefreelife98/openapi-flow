import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import process from 'node:process';
import {
  createApiArgumentsSchema,
  createApiResponseSchema,
} from '@openapi-flow/core';
import {
  N8nNativeFeature,
  resolveN8nNativeFeatures,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';
import {
  canonicalInputReplyFixture,
  pauseCanonicalInputReply,
} from '../test/fixtures/canonical-input-reply-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import { verifyCanonicalPriceFollowUps } from './scenarios/verify-canonical-price-followups.mjs';
import { verifyCanonicalItemInputEdits } from './scenarios/verify-canonical-item-input-edits.mjs';

/** Real OAS and real planning calls; UI approvals/reply and local credential are explicit fixture actions. */
export async function verifyCanonicalInputReply({
  model,
  spec,
  label,
  priceFollowUps = false,
  explicitInitialItem = false,
  itemInputEdits = false,
  responseGuard = false,
  runtimeStopMessage = false,
}) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  assert.ok(
    !(priceFollowUps && itemInputEdits),
    'Select one follow-up fixture per isolated conversation',
  );
  assert.ok(!responseGuard || priceFollowUps);
  assert.ok(!runtimeStopMessage || responseGuard);
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/canonical-input-reply/${runId}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const requests = [],
    failures = [],
    executions = [];
  const token = 'local-contract-only-not-a-service-token';
  const contracts = new Map();
  // Explicit runtime test-user input; never sent as model-selected parameters.
  const runtimeFailureMessage = '={{ 실행 전 입력한 오류 메시지 }}';
  let activeQueries;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://local.fixture');
    requests.push({
      method: request.method,
      path: url.pathname,
      query: [...url.searchParams],
    });
    try {
      assert.equal(request.method, 'GET');
      const contract = contracts.get(url.pathname);
      assert.ok(contract, `No fixture contract for ${url.pathname}`);
      assert.equal(request.headers.authorization, `Bearer ${token}`);
      const values = { query: Object.fromEntries(url.searchParams) };
      assert.ok(activeQueries?.has(url.pathname));
      // This fixture only accepts the explicitly supplied string input and
      // selected string binding. Reject extra wire inputs before OAS parsing;
      // it is not a general Boolean/array HTTP query deserializer.
      assert.deepEqual(values, { query: activeQueries.get(url.pathname) });
      contract.request.parse({ values });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(contract.body));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  const volume = `openapi-flow-canonical-input-${runId}`,
    image = 'n8nio/n8n:2.37.10';
  let created = false,
    phase = 'initialize';
  try {
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const fixture = await canonicalInputReplyFixture({
      model,
      spec,
      includeExplanations: true,
      allowRuntimeParameters: runtimeStopMessage,
      capabilities: responseGuard
        ? resolveN8nNativeFeatures({
            features: [N8nNativeFeature.If, N8nNativeFeature.StopAndError],
          }).capabilities
        : [],
      deployments: [
        {
          documentId: 'source',
          baseUrl: `http://host.docker.internal:${server.address().port}`,
          credentialBindings: {
            'JWT Access Token': {
              id: 'canonical-local-bearer',
              name: 'Canonical local bearer',
            },
          },
        },
      ],
    });
    phase = 'short-request-planning';
    const { selected, pending } = await pauseCanonicalInputReply(
      fixture,
      explicitInitialItem
        ? '상품번호 문자열 "fixture-canonical-01"로 상품 단건 기본 정보를 조회하는 워크플로우를 만들어줘.'
        : '상품 한 건의 기본 정보를 확인하는 흐름을 만들어줘.',
    );
    await writeFile(
      new URL('selected.json', directory),
      JSON.stringify(selected, null, 2),
    );
    await writeFile(
      new URL('pending.json', directory),
      JSON.stringify(pending, null, 2),
    );
    const inputs = pending.questions.filter(
      (question) => question.kind === 'api-input',
    );
    assert.equal(
      inputs.length,
      explicitInitialItem ? 0 : 1,
      'Unknown values must appear as real questions, never test-driver-invented questions',
    );
    if (!explicitInitialItem)
      assert.equal(inputs[0].requirement.targetPointer, '/query/gdNo');
    const planId = pending.plan.id;
    phase = 'natural-input-reply';
    const candidate = explicitInitialItem
      ? pending
      : await fixture.resume(pending, {
          action: 'reply-inputs',
          messageId: 'explicit-item-number',
          text: '상품번호는 "fixture-canonical-01"로 해줘.',
        });
    await writeFile(
      new URL('candidate.json', directory),
      JSON.stringify(candidate, null, 2),
    );
    assert.equal(candidate.__interrupt__[0].value.phase, 'candidate');
    assert.equal(candidate.plan.id, planId);
    const result = await fixture.resume(candidate, { action: 'approve' });
    await writeFile(
      new URL('complete.json', directory),
      JSON.stringify(result, null, 2),
    );
    assert.equal(result.phase, 'complete');
    assert.equal(result.draft.apiCalls.length, 1);
    const call = result.draft.apiCalls[0];
    const operation = fixture.context.operations.find(
      (item) => item.key.operationRef === call.operation.operationRef,
    );
    assert.equal(operation.path, '/item/core/getItemInfo');
    assert.equal(operation.method, 'GET');
    assert.deepEqual(call.values, { query: { gdNo: 'fixture-canonical-01' } });
    const require = createRequire(
      new URL('../packages/n8n/package.json', import.meta.url),
    );
    const { Ajv2020 } = require('ajv/dist/2020.js');
    const addFormats = require('ajv-formats');
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    for (const path of [
      '/item/core/getItemInfo',
      ...(priceFollowUps ? ['/item/partial/getItemPriceInfo'] : []),
    ]) {
      const selectedOperation = fixture.context.operations.find(
        (entry) => entry.method === 'GET' && entry.path === path,
      );
      assert.ok(selectedOperation);
      // Declared synthetic response data, checked against the unchanged OAS.
      const body = !priceFollowUps
        ? {}
        : path === '/item/core/getItemInfo'
          ? { code: 0, result: { gdNo: 'fixture-response-02' } }
          : { code: 0, result: { sellPrice: 200 } };
      const responseValidator = ajv.compile(
        createApiResponseSchema({ operation: selectedOperation }),
      );
      assert.equal(
        responseValidator({
          statusCode: 200,
          mediaType: 'application/json',
          body,
        }),
        true,
        JSON.stringify(responseValidator.errors),
      );
      contracts.set(path, {
        request: createApiArgumentsSchema({
          operation: selectedOperation,
          bindings: [],
        }),
        body,
        response: responseValidator,
      });
    }
    assert.equal(result.artifact.triggerConnected, true);
    assert.equal(result.inputAnswerHistory.length, explicitInitialItem ? 0 : 1);
    if (!explicitInitialItem)
      assert.equal(
        result.messages.find((message) => message.id === 'explicit-item-number')
          .text,
        '상품번호는 "fixture-canonical-01"로 해줘.',
      );
    if (explicitInitialItem) {
      const generated = Object.values(result.stageResults).filter(
        (entry) => entry.proposal?.values !== undefined,
      );
      assert.equal(generated.length, 1);
      assert.ok(
        generated[0].literalSources.some(
          (source) =>
            source.targetPointer === '/query/gdNo' &&
            source.messageId === 'short-request' &&
            source.occurrences.length,
        ),
      );
    }
    const completed = [{ id: 'initial', result }];
    if (priceFollowUps) {
      phase = 'price-follow-ups';
      completed.push(
        ...(await verifyCanonicalPriceFollowUps({
          fixture,
          initial: result,
          directory,
          responseGuard,
          runtimeStopMessage,
        })),
      );
    }
    if (itemInputEdits) {
      phase = 'item-input-edits';
      completed.push(
        ...(await verifyCanonicalItemInputEdits({
          fixture,
          initial: result,
          directory,
        })),
      );
    }
    await writeFile(
      new URL('input-answer-history.json', directory),
      JSON.stringify(result.inputAnswerHistory, null, 2),
    );
    phase = 'n8n';
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
    const credentials = await runDocker(
      [...runtime, 'import:credentials', '--input=/dev/stdin'],
      JSON.stringify([
        {
          id: 'canonical-local-bearer',
          name: 'Canonical local bearer',
          type: 'httpBearerAuth',
          data: { token },
        },
      ]),
    );
    assert.equal(credentials.code, 0, credentials.stderr);
    for (const completedTurn of completed) {
      phase = `n8n:${completedTurn.id}`;
      activeQueries = new Map();
      for (const call of completedTurn.result.draft.apiCalls) {
        const callOperation = fixture.context.operations.find(
          (entry) => entry.key.operationRef === call.operation.operationRef,
        );
        assert.ok(callOperation);
        if (call.bindings.length === 0) {
          assert.equal(typeof call.values.query?.gdNo, 'string');
          activeQueries.set(callOperation.path, {
            gdNo: call.values.query.gdNo,
          });
        } else {
          // Verify a selected reference with a different runtime source marker;
          // copying the original request literal cannot satisfy this check.
          assert.equal(call.bindings.length, 1);
          const binding = call.bindings[0];
          assert.equal(binding.kind, 'node-output');
          assert.equal(binding.targetPointer, '/query/gdNo');
          assert.equal(binding.sourcePointer, '/result/gdNo');
          const source = completedTurn.result.draft.apiCalls.find(
            (entry) => entry.id === binding.sourceNodeId,
          );
          assert.ok(source);
          const sourceOperation = fixture.context.operations.find(
            (entry) => entry.key.operationRef === source.operation.operationRef,
          );
          assert.ok(sourceOperation);
          const sourceBody = contracts.get(sourceOperation.path).body;
          assert.equal(typeof sourceBody.result.gdNo, 'string');
          activeQueries.set(callOperation.path, {
            gdNo: sourceBody.result.gdNo,
          });
        }
      }
      let artifact = completedTurn.result.artifact;
      if (runtimeStopMessage && completedTurn.id === 'add-price') {
        const missing = {
          ...artifact.workflow,
          id: `canonical-input-${runId}-missing-native-input`,
        };
        await writeFile(
          new URL('workflow-add-price-missing-input.json', directory),
          JSON.stringify(missing, null, 2),
        );
        const missingImport = await runDocker(
          [...runtime, 'import:workflow', '--input=/dev/stdin'],
          JSON.stringify([missing]),
        );
        assert.equal(missingImport.code, 0, missingImport.stderr);
        const start = requests.length;
        const missingRaw = await runDocker([
          ...runtime,
          'execute',
          `--id=${missing.id}`,
          '--rawOutput',
        ]);
        const missingExecution = readN8nExecution(missingRaw.stdout);
        assert.equal(missingExecution.status, 'error');
        assert.equal(
          missingExecution.data.resultData.lastNodeExecuted,
          '입력 사전 검사',
        );
        assert.equal(requests.length, start);
        executions.push({
          turn: 'add-price-missing-native-input',
          status: 'error',
          expected: 'rejected-by-input-preflight',
          requests: [],
        });
        const [slot] = artifact.inputSlots;
        artifact = compileN8nWorkflowTemplate({
          draft: completedTurn.result.draft,
          context: {
            ...fixture.context,
            messages: completedTurn.result.messages,
          },
          name: fixture.dependencies.name,
          deployments: fixture.dependencies.deployments,
          inputValues: {
            [slot.id]:
              slot.targetPointer === ''
                ? { message: runtimeFailureMessage }
                : (() => {
                    assert.equal(
                      slot.targetPointer,
                      '/message',
                      'Fixture only supplies the declared StopAndError message',
                    );
                    return runtimeFailureMessage;
                  })(),
          },
        });
        assert.equal(artifact.runtimeInputsReady, true);
      }
      const workflow = {
        ...artifact.workflow,
        id: `canonical-input-${runId}-${completedTurn.id}`,
      };
      await writeFile(
        new URL(
          completedTurn.id === 'initial'
            ? 'workflow.json'
            : `workflow-${completedTurn.id}.json`,
          directory,
        ),
        JSON.stringify(workflow, null, 2),
      );
      const imported = await runDocker(
        [...runtime, 'import:workflow', '--input=/dev/stdin'],
        JSON.stringify([workflow]),
      );
      assert.equal(imported.code, 0, imported.stderr);
      const requestStart = requests.length;
      const raw = await runDocker([
        ...runtime,
        'execute',
        `--id=${workflow.id}`,
        '--rawOutput',
      ]);
      assert.equal(
        raw.code,
        0,
        `Isolated n8n ${completedTurn.id} failed; see requests and failures. ${raw.stderr}`,
      );
      const execution = readN8nExecution(raw.stdout);
      assert.equal(
        execution.status,
        'success',
        JSON.stringify(execution.data.resultData.error),
      );
      const turnRequests = requests.slice(requestStart);
      assert.equal(
        turnRequests.length,
        completedTurn.result.draft.apiCalls.length,
      );
      assert.deepEqual(
        turnRequests.map((entry) => entry.path).sort(),
        completedTurn.result.draft.apiCalls
          .map(
            (call) =>
              fixture.context.operations.find(
                (entry) =>
                  entry.key.operationRef === call.operation.operationRef,
              ).path,
          )
          .sort(),
      );
      assert.deepEqual(failures, []);
      executions.push({
        turn: completedTurn.id,
        status: execution.status,
        apiCalls: completedTurn.result.draft.apiCalls.map((call) => ({
          id: call.id,
          operation: call.operation,
          values: call.values,
          bindings: call.bindings,
        })),
        requests: turnRequests,
      });
      if (responseGuard && completedTurn.id === 'add-price') {
        phase = 'n8n:add-price:code-mismatch';
        const source = contracts.get('/item/core/getItemInfo');
        const originalBody = source.body;
        try {
          // Re-execute the same imported workflow; change only the local
          // responder's OAS-valid stimulus, never its nodes or parameters.
          source.body = { ...originalBody, code: 1 };
          assert.equal(
            source.response({
              statusCode: 200,
              mediaType: 'application/json',
              body: source.body,
            }),
            true,
            JSON.stringify(source.response.errors),
          );
          const rejectedStart = requests.length;
          const rejectedRaw = await runDocker([
            ...runtime,
            'execute',
            `--id=${workflow.id}`,
            '--rawOutput',
          ]);
          const rejected = readN8nExecution(rejectedRaw.stdout);
          const data = rejected.data.resultData;
          const stoppedRequests = requests.slice(rejectedStart);
          assert.equal(rejected.status, 'error');
          if (runtimeStopMessage)
            assert.equal(data.error.message, runtimeFailureMessage);
          assert.ok(
            workflow.nodes.some(
              (node) =>
                node.type === 'n8n-nodes-base.stopAndError' &&
                node.name === data.lastNodeExecuted,
            ),
          );
          assert.deepEqual(
            stoppedRequests.map((entry) => entry.path),
            ['/item/core/getItemInfo'],
          );
          assert.deepEqual(failures, []);
          executions.push({
            turn: 'add-price-code-mismatch',
            status: rejected.status,
            expected: 'rejected-by-native-guard',
            lastNodeExecuted: data.lastNodeExecuted,
            apiCalls: completedTurn.result.draft.apiCalls,
            requests: stoppedRequests,
          });
        } finally {
          source.body = originalBody;
        }
      }
      await writeFile(
        new URL('execution-summary.json', directory),
        JSON.stringify(
          { status: 'in-progress', executions, requests },
          null,
          2,
        ),
      );
    }
    await writeFile(
      new URL('execution-summary.json', directory),
      JSON.stringify({ status: 'success', executions, requests }, null, 2),
    );
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          originalOperations: fixture.context.operations.length,
          priceFollowUps,
          explicitInitialItem,
          itemInputEdits,
          responseGuard,
          runtimeStopMessage,
          executions,
          requests,
          businessApiCalls: 0,
          scope:
            'Short natural request over the entire supplied ICL catalog, actual semantic selection/bindings/arguments, explicit UI approval, initial literal or natural missing-value reply as declared by explicitInitialItem, same initial input plan, optional short add/remove price follow-ups, SDK template and isolated n8n execution. No model retry, repaired output, expected operation injection or business API calls. These are known-service cases, not a general quality score; responses are explicit OAS-valid synthetic data, not real business behavior.',
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
          ...(error.failure === undefined ? {} : { failure: error.failure }),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          requests,
          failures,
          executions,
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

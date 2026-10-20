import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { N8nNativeFeature } from '@openapi-flow/n8n';
import {
  nativeFeaturePlanningFixture,
  nativeFeaturePlanningModel,
} from '../test/fixtures/native-feature-planning-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Native-only host composition, no business endpoint or model-output repair. */
export async function verifyNativeFeaturePlanning({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/native-feature-planning/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-feature-planning-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  let created = false;
  await mkdir(directory, { recursive: true });
  try {
    const fixture = await nativeFeaturePlanningFixture({
      features: [
        N8nNativeFeature.SplitNativeOutputArray,
        N8nNativeFeature.PassThrough,
        N8nNativeFeature.JsonOutput,
      ],
      producer: true,
    });
    const graph = createWorkflowDraftConversationGraph({
      ...fixture.dependencies,
      model,
    });
    const scenario =
      'Only native nodes; no APIs. Create one original-context producer with the exact rows [3,1] and marker "={{ literal text }}". Split its /rows array into unchanged items with split-native-output-array. Add one separate independent pass-through root. Connect only producer main to split main; the pass-through stays independent. Use all three requested node roles.';
    const result = await graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: { id: 'edit-1', text: scenario, expectedRevision: 0 },
        },
      },
      fixture.config,
    );
    await writeFile(
      new URL('host-result.json', directory),
      JSON.stringify(result, null, 2),
    );
    assert.equal(
      result.phase,
      'complete',
      'An unresolved actual plan is preserved, never filled by this driver',
    );
    assert.equal(result.draft.apiCalls.length, 0);
    assert.equal(result.draft.nativeNodes.length, 3);
    const producer = result.draft.nativeNodes.find(
      (node) => node.capability === 'original-context',
    );
    const split = result.draft.nativeNodes.find(
      (node) => node.capability === N8nNativeFeature.SplitNativeOutputArray,
    );
    const independent = result.draft.nativeNodes.find(
      (node) => node.capability === N8nNativeFeature.PassThrough,
    );
    assert.deepEqual(producer.parameters, {
      rows: [3, 1],
      marker: '={{ literal text }}',
    });
    assert.deepEqual(split.parameters, {
      sourceNodeId: producer.id,
      pointer: '/rows',
    });
    assert.deepEqual(result.draft.edges, [
      { from: producer.id, output: 'main', to: split.id, input: 'main' },
    ]);
    assert.equal(result.artifact.triggerConnected, true);
    const workflow = {
      ...result.artifact.workflow,
      id: `native-features-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
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
    const execution = readN8nExecution(raw.stdout);
    await writeFile(
      new URL('execution.json', directory),
      JSON.stringify(execution, null, 2),
    );
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    const data = execution.data.resultData.runData;
    const output = (nodeId) =>
      data[
        result.artifact.nodeMappings.find((entry) => entry.nodeId === nodeId)
          .exitNodeName
      ][0].data.main[0].map((item) => item.json);
    assert.deepEqual(output(producer.id), [
      { rows: [3, 1], marker: '={{ literal text }}' },
    ]);
    assert.deepEqual(output(split.id), [{ item: 3 }, { item: 1 }]);
    assert.equal(output(independent.id).length, 1);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          scenario,
          apiCalls: 0,
          businessApiCalls: 0,
          nativeInstances: 3,
          unchangedItems: output(split.id),
          planningSelection: result.plan.steps.map((step) =>
            step.decision.kind === 'add-native-node'
              ? step.decision.capability
              : step.decision.kind,
          ),
          scope:
            'Registered stable definitions -> host model stages -> actual producer binding -> SDK -> isolated Manual Trigger n8n. No output repair or fabricated source contracts.',
        },
        null,
        2,
      ),
    );
    console.log(`native-feature-planning: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          status: 'failed',
          label,
          errorType: error.name,
          ...(error.failure === undefined ? {} : { failure: error.failure }),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await nativeFeaturePlanningFixture({
    respond: nativeFeaturePlanningModel(),
  });
  await verifyNativeFeaturePlanning({
    model: fixture.model,
    label:
      'Deterministic structured decisions, consumer first; zero external model/business calls',
  });
}

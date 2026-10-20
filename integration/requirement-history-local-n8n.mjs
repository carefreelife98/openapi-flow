import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  runRequirementHistoryConversation,
  requirementHistoryModel,
} from '../test/fixtures/workflow-draft-requirement-history-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** Approvals and typed replacement are explicit synthetic UI actions, not model outputs. */
export async function verifyRequirementHistory({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/requirement-history/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-requirement-history-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const checkpoints = [];
  let created = false;
  await mkdir(directory, { recursive: true });
  try {
    const result = await runRequirementHistoryConversation(model, (entry) =>
      checkpoints.push(entry),
    );
    await writeFile(
      new URL('checkpoints.json', directory),
      JSON.stringify(checkpoints, null, 2),
    );
    await writeFile(
      new URL('history.json', directory),
      JSON.stringify(result.final.draft.requirementHistory, null, 2),
    );
    await writeFile(
      new URL('deferred-workflow.json', directory),
      JSON.stringify(result.deferred.artifact.workflow, null, 2),
    );
    const workflow = {
      ...result.final.artifact.workflow,
      id: `requirement-history-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
    assert.equal(result.deferred.artifact.triggerConnected, false);
    assert.equal(result.final.artifact.triggerConnected, true);
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
    const mapping = result.final.artifact.nodeMappings.find(
      (entry) => entry.nodeId === 'unchanged-pass',
    );
    assert.ok(mapping);
    assert.equal(
      execution.data.resultData.runData[mapping.exitNodeName][0].data.main[0]
        .length,
      1,
    );
    const report = {
      status: 'passed',
      label,
      image,
      history: result.final.draft.requirementHistory.map((entry) => ({
        kind: entry.kind,
        revision: entry.revision,
        evidenceIds: entry.evidence.map((source) => source.messageId),
      })),
      deferredTriggerConnected: false,
      finalTriggerConnected: true,
      checkpoints: checkpoints.map((entry) => entry.label),
      businessApiCalls: 0,
      scope:
        'Two semantic edit selections, explicit review and typed requirement answer, code-owned provenance/history, unchanged native workflow -> SDK -> isolated n8n. No model retry, history repair or invented user choice.',
    };
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(report, null, 2),
    );
    console.log(`requirement-history: PASSED (${directory.pathname})`);
    return directory;
  } catch (error) {
    await writeFile(
      new URL('checkpoints.json', directory),
      JSON.stringify(checkpoints, null, 2),
    );
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

if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyRequirementHistory({
    model: requirementHistoryModel(),
    label:
      'Deterministic semantic responses and explicit synthetic UI; zero external model/business calls',
  });

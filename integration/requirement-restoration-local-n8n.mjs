import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import { runRequirementRestorationConversation } from '../test/fixtures/workflow-draft-requirement-restoration-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

/** One semantic restoration choice; review and replacement fields are explicit test UI actions. */
export async function verifyRequirementRestoration({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/requirement-restoration/${runId}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const checkpoints = [];
  const volume = `openapi-flow-restoration-${runId}`,
    image = 'n8nio/n8n:2.37.10';
  let created = false;
  let phase = 'conversation';
  try {
    const result = await runRequirementRestorationConversation(model, (entry) =>
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
    const workflow = {
      ...result.final.artifact.workflow,
      id: `restoration-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
    assert.equal(result.final.artifact.triggerConnected, true);
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
    const mapping = result.final.artifact.nodeMappings.find(
      (entry) => entry.nodeId === 'unchanged-pass',
    );
    assert.ok(mapping);
    assert.equal(
      execution.data.resultData.runData[mapping.exitNodeName][0].data.main[0]
        .length,
      1,
    );
    await writeFile(
      new URL('execution.json', directory),
      JSON.stringify(execution, null, 2),
    );
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          history: result.final.draft.requirementHistory.map(
            (entry) => entry.kind,
          ),
          checkpoints: checkpoints.map((entry) => entry.label),
          businessApiCalls: 0,
          scope:
            'One actual semantic restoration decision, explicit review and typed replacement fields, invalid-scope rejection without replay, code-owned history and unchanged native SDK workflow execution. No copied historical state, node regeneration, model retry or real API requests. This is not broad semantic lifecycle quality coverage.',
        },
        null,
        2,
      ),
    );
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
          phase,
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

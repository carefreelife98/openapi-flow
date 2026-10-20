import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';
import {
  planWorkflowGraph,
  planReviewableWorkflowGraph,
  WorkflowGraphPlanningError,
  ReviewableWorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import { validateWorkflowGraphPlanningRecord } from '@openapi-flow/core';
import {
  compilePlannedN8nWorkflow,
  compileReviewableN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import {
  graphPlanningFixture,
  graphPlannerInput,
} from '../test/fixtures/graph-planning-record-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';

/** Native instances/settings and topology are actual model output; API selection/bindings are explicit fixtures. */
export async function verifyGraphPlanningRecords({ model, label }) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`,
    directory = new URL(
      `../.local-artifacts/graph-planning-records/${runId}/`,
      import.meta.url,
    );
  await mkdir(directory, { recursive: true });
  const runtime = await createFiveApiDagRuntime(runId);
  let phase = 'initialization';
  try {
    for (const mode of ['executable', 'reviewable']) {
      phase = `${mode}-planning`;
      const { input } = graphPlanningFixture(mode);
      const plan = await (
        mode === 'reviewable' ? planReviewableWorkflowGraph : planWorkflowGraph
      )({ ...graphPlannerInput(input), model, includeExplanations: true });
      await writeFile(
        new URL(`${mode}-plan.json`, directory),
        JSON.stringify(plan, null, 2),
      );
      assert.deepEqual(
        plan.gaps,
        [],
        'Actual model gaps are visible failures, never repaired results',
      );
      if (mode === 'reviewable') assert.deepEqual(plan.blockedCalls, []);
      assert.equal(plan.nativeNodes.length, 1);
      const [join] = plan.nativeNodes;
      assert.equal(join.capability, 'merge-append');
      assert.deepEqual(join.parameters, { numberInputs: 3 });
      assert.equal(plan.edges.length, 7);
      assert.deepEqual(plan.starts, ['source']);
      const branches = ['detail', 'price', 'stock'];
      for (const id of branches) {
        assert.equal(
          plan.edges.filter(
            (e) =>
              e.from === 'source' &&
              e.output === 'main' &&
              e.to === id &&
              e.input === 'main',
          ).length,
          1,
        );
        assert.equal(
          plan.edges.filter(
            (e) => e.from === id && e.output === 'main' && e.to === join.id,
          ).length,
          1,
        );
      }
      assert.equal(
        new Set(plan.edges.filter((e) => e.to === join.id).map((e) => e.input))
          .size,
        3,
      );
      assert.equal(
        plan.edges.filter(
          (e) =>
            e.from === join.id &&
            e.output === 'main' &&
            e.to === 'summary' &&
            e.input === 'main',
        ).length,
        1,
      );
      validateWorkflowGraphPlanningRecord({
        ...input,
        plan,
        record: JSON.parse(JSON.stringify(plan.graphPlanning)),
      });
      phase = `${mode}-compilation`;
      const materials = input.materials.map(({ status, ...material }) => {
        assert.equal(status, 'ready');
        return material;
      });
      const names = Object.fromEntries(
        materials.map((m) => [
          m.arguments.callId,
          'Request ' + m.arguments.callId,
        ]),
      );
      const compiled = (
        mode === 'reviewable'
          ? compileReviewableN8nWorkflow
          : compilePlannedN8nWorkflow
      )({
        id: `graph-${mode}-${runId}`,
        name: `Actual combined ${mode} graph`,
        plan,
        capabilities: input.capabilities,
        materials: mode === 'reviewable' ? input.materials : materials,
        apiNodes: materials.map((m, index) =>
          createHttpRequestNode({
            ...m,
            baseUrl: runtime.baseUrl,
            credentialBindings: {},
            apiNodeNames: names,
            position: [300, index * 250],
          }),
        ),
      });
      assert.equal(
        JSON.stringify(compiled.workflow).includes('graphPlanning'),
        false,
      );
      await writeFile(
        new URL(`${mode}-workflow.json`, directory),
        JSON.stringify(compiled.workflow, null, 2),
      );
      for (let index = 0; index < 2; index++) {
        phase = `${mode}-execution-${index + 1}`;
        const result = await runtime.execute(compiled.workflow, {
          id: randomUUID(),
          labels: ['=literal-data', '雪', 'plain'],
          filter: { R: 0 },
        });
        await writeFile(
          new URL(`${mode}-execution-${index + 1}.json`, directory),
          JSON.stringify(result, null, 2),
        );
      }
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image: runtime.image,
          requests: runtime.requests,
          businessApiCalls: 0,
          scope:
            'Two actual combined graph calls select/configure the native Merge and all DAG edges. Each unmodified SDK workflow executes twice with distinct source IDs: four executions, twenty local requests. API selection and request bindings are explicit fixtures. Merge IDs/input order are validated semantically, not fixed or repaired. No automatic model retry, output repair or business API calls.',
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
          ...(error instanceof WorkflowGraphPlanningError ||
          error instanceof ReviewableWorkflowGraphPlanningError
            ? { failure: error.failure, cause: error.cause?.message }
            : {}),
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          requests: runtime.requests,
          serverFailures: runtime.failures,
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await runtime.close();
  }
}

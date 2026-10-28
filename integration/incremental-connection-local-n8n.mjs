import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { MemorySaver } from '@langchain/langgraph';
import { createIncrementalWorkflowConnectionGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  compilePlannedN8nWorkflow,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { workflowConnectionEdgeId } from '@openapi-flow/core';
import {
  incrementalConnectionFixture,
  incrementalConnectionPatch,
  incrementalConnectionModelPatch,
} from '../test/fixtures/incremental-connection-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';

/** Engine-equivalence evaluation, not a natural-language selection or real-service test. */
export async function verifyIncrementalConnectionRuntime({
  model,
  policy,
  label,
  nativeAugmentation,
  incrementalOnly = false,
}) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.ok(typeof label === 'string' && label.trim());
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/incremental-connections/${runId}/`,
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const { source, plan: baseline } = incrementalConnectionFixture();
  if (nativeAugmentation !== undefined) source.nativeNodes = [];
  const originalMaterials = globalThis.structuredClone(source.materials);
  const progress = [];
  const graph = createIncrementalWorkflowConnectionGraph({
    model,
    source: () => source,
    policy,
    ...(nativeAugmentation === undefined ? {} : { nativeAugmentation }),
    checkpointer: new MemorySaver(),
    observe: async (event) => {
      progress.push(event);
      await writeFile(
        new URL('planning-progress.json', directory),
        JSON.stringify(progress, null, 2),
      );
    },
  });
  const config = { configurable: { thread_id: runId } };
  let result;
  try {
    result = await graph.invoke({}, config);
  } catch (error) {
    const failed = await graph.getState(config);
    await writeFile(
      new URL('planning-failure-state.json', directory),
      JSON.stringify({ state: failed.values, next: failed.next }, null, 2),
    );
    throw error;
  }
  assert.equal(result.status, 'complete');
  let generatedMerge;
  if (nativeAugmentation !== undefined) {
    assert.equal(result.additionalNativeNodes.length, 1);
    assert.equal(result.materialExtensions.length, 1);
    [generatedMerge] = result.additionalNativeNodes;
    assert.equal(generatedMerge.capability, baseline.nativeNodes[0].capability);
    assert.deepEqual(
      generatedMerge.parameters,
      baseline.nativeNodes[0].parameters,
    );
    assert.match(generatedMerge.id, /^native-instance:[a-f0-9]{64}$/);
    assert.deepEqual(source.nativeNodes, []);
  }
  // Assertion-only role alignment. Never rewrite the generated plan or workflow JSON.
  const comparisonId = (id) =>
    generatedMerge !== undefined && id === generatedMerge.id
      ? baseline.nativeNodes[0].id
      : id;
  assert.deepEqual(
    result.plan.edges
      .map((edge) =>
        workflowConnectionEdgeId({
          ...edge,
          from: comparisonId(edge.from),
          to: comparisonId(edge.to),
        }),
      )
      .sort(),
    baseline.edges.map(workflowConnectionEdgeId).sort(),
  );
  assert.deepEqual(result.plan.starts, baseline.starts);
  if (nativeAugmentation === undefined)
    assert.deepEqual(result.plan.nativeNodes, baseline.nativeNodes);
  assert.deepEqual(source.materials, originalMaterials);
  assert.equal(progress.at(-1).phase, 'complete');
  await writeFile(
    new URL('planning.json', directory),
    JSON.stringify(
      {
        label,
        session: result.session,
        modelInvocations: result.modelInvocations,
        rejectedProposals: result.rejectedProposals,
        rejectedGoalProposals: result.rejectedGoalProposals,
        progress,
        materialExtensions: result.materialExtensions,
      },
      null,
      2,
    ),
  );

  const runtime = await createFiveApiDagRuntime(runId);
  try {
    const materials = source.materials.map(({ status, ...material }) => {
      assert.equal(status, 'ready');
      return material;
    });
    const names = Object.fromEntries(
      materials.map((material) => [
        material.arguments.callId,
        `Request ${material.arguments.callId}`,
      ]),
    );
    const executions = [];
    const seeds = [randomUUID(), randomUUID()];
    const executionPlans = incrementalOnly
      ? [['incremental-planned', result.plan]]
      : [
          ['baseline-fixed-plan', baseline],
          ['incremental-planned', result.plan],
        ];
    for (const [mode, plan] of executionPlans) {
      const compiled = compilePlannedN8nWorkflow({
        id: `${mode}-${runId}`,
        name: mode,
        plan,
        materials,
        capabilities: source.capabilities,
        apiNodes: materials.map((material, index) =>
          createHttpRequestNode({
            ...material,
            baseUrl: runtime.baseUrl,
            credentialBindings: {},
            apiNodeNames: names,
            position: [300, index * 200],
          }),
        ),
      });
      await writeFile(
        new URL(`${mode}.workflow.json`, directory),
        JSON.stringify(compiled.workflow, null, 2),
      );
      for (const [index, id] of seeds.entries()) {
        const offset = runtime.requests.length;
        const execution = await runtime.execute(compiled.workflow, {
          id,
          labels: ['=literal-data', '雪', 'plain'],
          filter: { R: 0 },
        });
        const requests = runtime.requests.slice(offset);
        assert.equal(requests[0].path, '/source');
        assert.equal(requests.at(-1).path, '/summary');
        const summary = {
          mode,
          index,
          status: execution.execution.status,
          sourceId: id,
          requests,
          executedNodes: Object.keys(
            execution.execution.data.resultData.runData,
          ),
        };
        executions.push(summary);
        await writeFile(
          new URL(`${mode}-${index + 1}.execution.json`, directory),
          JSON.stringify(summary, null, 2),
        );
        console.log(
          `${mode} run ${index + 1}: passed (${requests.length} isolated requests)`,
        );
      }
    }
    for (let index = 0; !incrementalOnly && index < seeds.length; index++) {
      const before = executions.find(
        (item) => item.mode === 'baseline-fixed-plan' && item.index === index,
      );
      const after = executions.find(
        (item) => item.mode === 'incremental-planned' && item.index === index,
      );
      assert.deepEqual(
        after.requests.map((item) => JSON.stringify(item)).sort(),
        before.requests.map((item) => JSON.stringify(item)).sort(),
      );
      assert.deepEqual(
        after.executedNodes.map(comparisonId).sort(),
        before.executedNodes.slice().sort(),
      );
    }
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image: runtime.image,
          modelInvocations: result.modelInvocations,
          rejectedProposals: result.rejectedProposals.length,
          rejectedGoalProposals: result.rejectedGoalProposals.length,
          acceptedBundles: result.session.revision,
          automaticNativeAdditions: result.materialExtensions.length,
          executions: executions.length,
          localRequests: runtime.requests.length,
          businessApiCalls: 0,
          actualConcurrencyGuaranteed: false,
          scope: incrementalOnly
            ? 'Incremental planning only, with fixed API contracts and response bindings. Two isolated n8n executions. No baseline execution, full natural-language quality evaluation, Qoopilot UI or business service calls.'
            : nativeAugmentation === undefined
              ? 'Same fixed API contracts, bindings and native settings. Baseline is a deterministic fixed plan, not a legacy LLM quality result. The new host child graph proposes and validates connections. Both SDK workflows execute twice with identical paired source values in isolated n8n. This does not test full natural-language planning, native augmentation, Qoopilot streaming UI or real services.'
              : 'Same fixed API contracts and response bindings. The new graph begins without Merge, requests the registered implementation, allocates its ID in code, plans its settings and resumes the same connection session without HITL. The generated plan and JSON are unmodified; comparison aligns the one actual Merge role only in assertions. Baseline is a fixed answer, not a legacy LLM response. Four isolated n8n executions preserve paired inputs. Full natural-language API selection, Qoopilot UI and business services are not tested.',
        },
        null,
        2,
      ),
    );
    return directory;
  } finally {
    await runtime.close();
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const { source, goals, plan } = incrementalConnectionFixture();
  const augmentNative = process.argv.includes('--augment-native');
  if (augmentNative) source.nativeNodes = [];
  const outputs = augmentNative
    ? [
        {
          goals: [
            ...goals.filter((goal) => goal.kind !== 'join'),
            ...['detail', 'price', 'stock'].map((before) => ({
              kind: 'precedence',
              before,
              after: 'summary',
              factIds: ['intent'],
              reason:
                'Every required independent response completes before summary.',
            })),
          ],
        },
        {
          decision: incrementalConnectionModelPatch(
            source,
            incrementalConnectionPatch({
              addRootNodeIds: ['source'],
              addEdges: plan.edges.filter((edge) => edge.from === 'source'),
            }),
          ),
        },
        {
          decision: {
            kind: 'request-native-material',
            capability: 'merge-append',
            purpose: 'Wait for every independent response before summary',
            factIds: ['intent'],
            reason: 'The confirmed scenario requires a three-input join.',
          },
        },
        {
          decision: {
            status: 'provided',
            parameters: { numberInputs: 3 },
            reason: 'The three independent producers require three inputs.',
          },
        },
        (context) => {
          const node = context.context.nativeNodes.find(
            (node) => node.capability === 'merge-append',
          );
          assert.ok(node);
          const expanded = {
            ...source,
            nativeNodes: [
              {
                id: node.id,
                capability: node.capability,
                parameters: node.parameters,
              },
            ],
          };
          return {
            decision: incrementalConnectionModelPatch(
              expanded,
              incrementalConnectionPatch({
                addEdges: plan.edges
                  .filter((edge) => edge.from !== 'source')
                  .map((edge) => ({
                    ...edge,
                    from: edge.from === 'join' ? node.id : edge.from,
                    to: edge.to === 'join' ? node.id : edge.to,
                  })),
                addTerminals: [{ nodeId: 'summary', output: 'main' }],
              }),
            ),
          };
        },
      ]
    : [
        { goals },
        {
          decision: incrementalConnectionModelPatch(
            source,
            incrementalConnectionPatch({
              addRootNodeIds: ['source'],
              addEdges: plan.edges.filter((edge) => edge.from === 'source'),
            }),
          ),
        },
        {
          decision: incrementalConnectionModelPatch(
            source,
            incrementalConnectionPatch({
              addEdges: plan.edges.filter((edge) => edge.from !== 'source'),
              addTerminals: [{ nodeId: 'summary', output: 'main' }],
            }),
          ),
        },
      ];
  const rejectReverseGoal = process.argv.includes('--reject-reverse-goal');
  if (rejectReverseGoal)
    outputs.unshift({
      goals: [
        {
          kind: 'precedence',
          before: 'summary',
          after: 'source',
          factIds: ['intent'],
          reason: 'Deliberately contradict the selected response dependencies.',
        },
      ],
    });
  let calls = 0;
  const directory = await verifyIncrementalConnectionRuntime({
    incrementalOnly: process.argv.includes('--incremental-only'),
    label: rejectReverseGoal
      ? 'scripted-reverse-goal-replanning-not-Chomsky'
      : 'scripted-model-not-Chomsky',
    ...(augmentNative
      ? {
          nativeAugmentation: {
            parameterOwnership: { parameterSource: 'literal' },
            includeExplanations: true,
          },
        }
      : {}),
    policy: {
      maxModelInvocations: 8,
      maxRejectedProposals: 3,
      deadlineMs: 120_000,
    },
    model: {
      withStructuredOutput() {
        return {
          async invoke(messages) {
            assert.ok(calls < outputs.length);
            if (rejectReverseGoal && calls === 1) {
              const feedback = JSON.parse(
                messages[1].content,
              ).rejectedProposals;
              assert.equal(feedback.length, 1);
              assert(
                feedback[0].constraints.conflicts.some(
                  (conflict) =>
                    conflict.code === 'DEPENDENCY_CYCLE' &&
                    conflict.dependencies.some(
                      (edge) => edge.origin.kind === 'value-reference',
                    ) &&
                    conflict.dependencies.some(
                      (edge) => edge.origin.kind === 'goal',
                    ),
                ),
              );
            }
            const output = outputs[calls++];
            return globalThis.structuredClone(
              typeof output === 'function'
                ? output(JSON.parse(messages[1].content))
                : output,
            );
          },
        };
      },
    },
  });
  assert.equal(calls, outputs.length);
  console.log(directory.pathname);
}

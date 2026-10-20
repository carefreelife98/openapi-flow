import assert from 'node:assert/strict';
import test from 'node:test';
import { MemorySaver, Command } from '@langchain/langgraph';
import {
  createOrchestratedWorkflowGenerationGraph,
  createConversationalWorkflowGenerationGraph,
} from '@openapi-flow/example-langgraph-workflow';
import {
  stagedHostCapabilities,
  stagedHostInput,
  scriptedStagedHostModel,
} from './fixtures/staged-native-host-fixture.mjs';

const count = (model, name) =>
  model.calls.filter((call) => call.name === name).length;
function fixture(create, id, options = {}) {
  const model = scriptedStagedHostModel(options);
  const dependencies = {
    model,
    capabilities: stagedHostCapabilities(),
    checkpointer: new MemorySaver(),
    nativePlanning: { mode: 'staged', allowRuntimeParameters: true },
    nativeInputs: { revision: 7 },
    ...(options.explanations
      ? { nativeOptions: { includeExplanations: true } }
      : {}),
    ...(options.api
      ? {
          deployments: [
            {
              documentId: 'staged-api',
              baseUrl: 'https://contract.example.test',
            },
          ],
        }
      : {}),
  };
  return {
    graph: create(dependencies),
    dependencies,
    model,
    input: stagedHostInput(id, options.api),
    config: { configurable: { thread_id: id }, recursionLimit: 100 },
  };
}
function pendingQuestion(result) {
  assert.equal(result.__interrupt__.length, 1);
  const payload = result.__interrupt__[0].value;
  assert.equal(payload.kind, 'native-configuration');
  assert.equal(payload.questions.length, 1);
  return payload.questions[0];
}

for (const [name, create] of [
  ['orchestrated', createOrchestratedWorkflowGenerationGraph],
  ['conversational', createConversationalWorkflowGenerationGraph],
]) {
  for (const api of [false, true]) {
    test(`${name} staged ${api ? 'OAS-bound' : 'native-only'} planning checkpoints independent work and resumes values without selecting again`, async () => {
      const f = fixture(create, `staged-${name}-${api}`, {
        api,
        explanations: true,
      });
      const paused = await f.graph.invoke(f.input, f.config);
      const question = pendingQuestion(paused);
      const originalSelection = globalThis.structuredClone(
        paused.nativeSelection,
      );
      assert.equal(paused.nativePlanningStatus, 'awaiting-input');
      if (name === 'conversational')
        assert.equal(paused.conversationStatus, 'awaiting-input');
      assert.equal(paused.nativeConfigurations.length, 2);
      assert.equal(
        paused.nativeConfigurations.filter(
          (task) => task.result.status === 'ready',
        ).length,
        1,
      );
      const pending = paused.nativeConfigurations.find(
        (task) => task.result.status === 'needs-clarification',
      );
      assert.deepEqual(pending.configuredNodes, []);
      assert.equal(count(f.model, 'select_native_node_instances'), 1);
      assert.equal(count(f.model, 'generate_native_node_parameters'), 1);
      assert.equal(count(f.model, 'plan_api_bindings'), 0);
      assert.equal(paused.workflow, undefined);
      const text = '  ={{ literal user reply }}  ';
      const complete = await f.graph.invoke(
        new Command({
          resume: { action: 'reply', questionId: question.id, text },
        }),
        f.config,
      );
      assert.equal(complete.status, 'complete');
      assert.equal(complete.nativePlanningStatus, 'ready');
      assert.deepEqual(complete.nativeSelection, originalSelection);
      assert.equal(complete.scenario, f.input.scenario);
      assert.equal(count(f.model, 'select_native_node_instances'), 1);
      assert.equal(count(f.model, 'generate_native_node_parameters'), 2);
      assert.equal(count(f.model, 'generate_api_arguments'), 0);
      assert.equal(count(f.model, 'plan_workflow_connections'), 1);
      const readiness = f.model.calls.find(
        (call) => call.name === 'plan_workflow_connections',
      ).input.nativeParameterReadiness;
      assert.deepEqual(
        readiness.find((item) => item.nodeId === question.nodeId),
        {
          nodeId: question.nodeId,
          planTimeStatus: 'validated',
          executionInputPointers: ['/count'],
        },
      );
      const configured = complete.nativeConfigurations.find(
        (task) => task.nodeId === question.nodeId,
      );
      assert.deepEqual(configured.configuredNodes, []);
      assert.deepEqual(configured.replies, [{ question, text }]);
      assert.deepEqual(configured.result.node.parameters, { message: text });
      assert.deepEqual(configured.result.node.runtimeParameters, {
        pointers: ['/count'],
      });
      assert.ok(configured.result.proposal.decision.reason);
      assert.equal(complete.nativeInputTemplate.revision, 7);
      assert.equal(complete.nativeInputTemplate.inputsReady, false);
      assert.equal(complete.nativeInputTemplate.inputSlots.length, 1);
      assert.equal(
        complete.nativeInputTemplate.inputSlots[0].targetPointer,
        '/count',
      );
      assert.equal(
        complete.workflow.connections.Start.main[0][0].node,
        '입력 설정',
      );
      assert.equal(
        complete.workflow.nodes.filter(
          (node) => node.type === 'n8n-nodes-base.httpRequest',
        ).length,
        api ? 1 : 0,
      );
      if (name === 'conversational')
        assert.equal(complete.conversationStatus, 'complete');
      if (api) {
        assert.equal(count(f.model, 'plan_api_bindings'), 1);
        assert.equal(
          complete.reviewMaterials[0].arguments.bindings[0].sourceNodeId,
          question.nodeId,
        );
        assert.deepEqual(complete.reviewMaterials[0].arguments.values, {});
      }
    });
  }

  test(`${name} rejects invalid answers without replay and cancellation does not compile`, async () => {
    const f = fixture(create, `cancel-${name}`);
    let paused = await f.graph.invoke(f.input, f.config);
    const question = pendingQuestion(paused);
    for (const response of [
      { action: 'reply', questionId: 'not-offered', text: 'value' },
      { action: 'reply', questionId: question.id, text: '   ' },
    ]) {
      paused = await f.graph.invoke(
        new Command({ resume: response }),
        f.config,
      );
      assert.equal(pendingQuestion(paused).id, question.id);
      assert.ok(paused.nativeReplyIssues.length);
      assert.equal(count(f.model, 'generate_native_node_parameters'), 1);
    }
    const cancelled = await f.graph.invoke(
      new Command({ resume: { action: 'cancel' } }),
      f.config,
    );
    assert.equal(cancelled.nativePlanningStatus, 'cancelled');
    assert.equal(cancelled.workflow, undefined);
    assert.equal(count(f.model, 'plan_workflow_connections'), 0);
    if (name === 'conversational')
      assert.equal(cancelled.conversationStatus, 'cancelled');
  });
}

test('a failed value call is preserved and an explicit retry resumes only that value task', async () => {
  const original = new Error('Original value-stage transport failure');
  const f = fixture(
    createOrchestratedWorkflowGenerationGraph,
    'retry-native-value',
    { answerFailure: original },
  );
  const paused = await f.graph.invoke(f.input, f.config);
  const question = pendingQuestion(paused);
  await assert.rejects(
    f.graph.invoke(
      new Command({
        resume: {
          action: 'reply',
          questionId: question.id,
          text: 'explicit value',
        },
      }),
      f.config,
    ),
    (error) => error === original,
  );
  assert.equal(count(f.model, 'select_native_node_instances'), 1);
  assert.equal(count(f.model, 'generate_native_node_parameters'), 2);
  const complete = await f.graph.invoke(null, f.config);
  assert.equal(complete.status, 'complete');
  assert.equal(count(f.model, 'select_native_node_instances'), 1);
  assert.equal(count(f.model, 'generate_native_node_parameters'), 3);
});

test('source changes while awaiting a native answer fail before a new model invocation', async () => {
  const f = fixture(
    createOrchestratedWorkflowGenerationGraph,
    'stale-native-answer',
  );
  const paused = await f.graph.invoke(f.input, f.config);
  const question = pendingQuestion(paused);
  await f.graph.updateState(f.config, {
    scenario: 'A different scenario is not an answer to the archived question.',
  });
  await assert.rejects(
    f.graph.invoke(
      new Command({
        resume: { action: 'reply', questionId: question.id, text: 'value' },
      }),
      f.config,
    ),
    /stale|modified|changed/,
  );
  assert.equal(count(f.model, 'select_native_node_instances'), 1);
  assert.equal(count(f.model, 'generate_native_node_parameters'), 1);
});

test('the staged host requires explicit persistence and runtime revision configuration', () => {
  const model = scriptedStagedHostModel();
  const input = {
    model,
    capabilities: stagedHostCapabilities(),
    nativePlanning: { mode: 'staged', allowRuntimeParameters: true },
  };
  assert.throws(
    () => createOrchestratedWorkflowGenerationGraph(input),
    /checkpointer/,
  );
  assert.throws(
    () =>
      createOrchestratedWorkflowGenerationGraph({
        ...input,
        checkpointer: new MemorySaver(),
      }),
    /nativeInputs.revision/,
  );
  assert.throws(() =>
    createOrchestratedWorkflowGenerationGraph({
      ...input,
      checkpointer: new MemorySaver(),
      nativeInputs: { revision: -1 },
    }),
  );
  assert.equal(model.calls.length, 0);
});

test('two instances of the same native capability keep separate questions and allow answers in either order', async () => {
  const f = fixture(
    createOrchestratedWorkflowGenerationGraph,
    'two-native-roles',
    { repeatRole: true },
  );
  const paused = await f.graph.invoke(f.input, f.config);
  const questions = paused.__interrupt__[0].value.questions;
  assert.equal(questions.length, 2);
  assert.equal(
    paused.nativeConfigurations.filter((task) => task.result.status === 'ready')
      .length,
    1,
  );
  assert.notEqual(questions[0].id, questions[1].id);
  assert.notEqual(questions[0].nodeId, questions[1].nodeId);
  const partial = await f.graph.invoke(
    new Command({
      resume: {
        action: 'reply',
        questionId: questions[1].id,
        text: 'second role value',
      },
    }),
    f.config,
  );
  assert.equal(pendingQuestion(partial).id, questions[0].id);
  assert.deepEqual(
    partial.nativeConfigurations.find(
      (task) => task.nodeId === questions[0].nodeId,
    ).configuredNodes,
    [],
  );
  const complete = await f.graph.invoke(
    new Command({
      resume: {
        action: 'reply',
        questionId: questions[0].id,
        text: 'first role value',
      },
    }),
    f.config,
  );
  assert.equal(complete.status, 'complete');
  assert.equal(complete.nativeInputTemplate.inputSlots.length, 2);
  assert.equal(
    new Set(complete.nativeInputTemplate.inputSlots.map((slot) => slot.id))
      .size,
    2,
  );
  for (const [question, message] of [
    [questions[0], 'first role value'],
    [questions[1], 'second role value'],
  ]) {
    assert.deepEqual(
      complete.nativePlan.nativeNodes.find(
        (node) => node.id === question.nodeId,
      ).parameters,
      { message },
    );
  }
  assert.equal(count(f.model, 'select_native_node_instances'), 1);
  assert.equal(count(f.model, 'generate_native_node_parameters'), 4);
});

test('shared in-memory persistence isolates two request threads and their reply receipts', async () => {
  const f = fixture(
    createConversationalWorkflowGenerationGraph,
    'native-thread-a',
  );
  const otherConfig = {
    configurable: { thread_id: 'native-thread-b' },
    recursionLimit: 100,
  };
  const first = await f.graph.invoke(f.input, f.config);
  const second = await f.graph.invoke(
    stagedHostInput('native-thread-b'),
    otherConfig,
  );
  const firstQuestion = pendingQuestion(first),
    secondQuestion = pendingQuestion(second);
  assert.notEqual(firstQuestion.id, secondQuestion.id);
  const invalid = await f.graph.invoke(
    new Command({
      resume: {
        action: 'reply',
        questionId: firstQuestion.id,
        text: 'belongs elsewhere',
      },
    }),
    otherConfig,
  );
  assert.equal(pendingQuestion(invalid).id, secondQuestion.id);
  const complete = await f.graph.invoke(
    new Command({
      resume: {
        action: 'reply',
        questionId: firstQuestion.id,
        text: 'thread A',
      },
    }),
    f.config,
  );
  assert.equal(complete.status, 'complete');
  const other = await f.graph.getState(otherConfig);
  assert.equal(
    other.values.nativeConfigurations.some((task) => task.replies.length),
    false,
  );
  assert.equal(other.values.workflow, undefined);
});

test('changed archived configuration results cannot reach connection planning or export', async () => {
  const f = fixture(
    createOrchestratedWorkflowGenerationGraph,
    'tampered-native-result',
  );
  const paused = await f.graph.invoke(f.input, f.config);
  const question = pendingQuestion(paused);
  const tasks = globalThis.structuredClone(paused.nativeConfigurations);
  tasks.find((task) => task.result.status === 'ready').result.node.parameters =
    { invented: true };
  await f.graph.updateState(f.config, { nativeConfigurations: tasks });
  await assert.rejects(
    f.graph.invoke(
      new Command({
        resume: {
          action: 'reply',
          questionId: question.id,
          text: 'explicit answer',
        },
      }),
      f.config,
    ),
    /configuration result was changed/,
  );
  assert.equal(count(f.model, 'plan_workflow_connections'), 0);
});

test('already explicit native settings complete without a clarification interrupt', async () => {
  const f = fixture(
    createConversationalWorkflowGenerationGraph,
    'known-native-value',
    { knownMessage: 'explicit known text' },
  );
  f.input.scenario =
    'Use message "explicit known text" now and leave count for execution. Also make the independent empty JSON.';
  const complete = await f.graph.invoke(f.input, f.config);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.__interrupt__, undefined);
  assert.equal(
    complete.nativeConfigurations.some((task) => task.replies.length),
    false,
  );
  assert.equal(count(f.model, 'select_native_node_instances'), 1);
  assert.equal(count(f.model, 'generate_native_node_parameters'), 1);
  assert.equal(count(f.model, 'plan_workflow_connections'), 1);
});

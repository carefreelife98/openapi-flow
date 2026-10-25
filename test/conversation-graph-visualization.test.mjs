import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildConversationGraphDocument,
  describeConversationGraph,
  conversationGraphDocument,
  describeIncrementalConnectionGraph,
} from '../scripts/update-workflow-conversation-graph.mjs';
import { draftConversationWorkKindSchema } from '../examples/langgraph-workflow/dist/schemas/workflow-draft-conversation-work-kind-schema.js';

test('actual registered conditional destinations exclude impossible all-to-all drawing edges', async () => {
  const graph = await describeConversationGraph();
  const destinations = (nodeId) =>
    graph.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target)
      .sort();
  assert.deepEqual(destinations('acceptTurn'), ['analyze', 'clarifyRequest']);
  assert.deepEqual(destinations('extractInputAnswers'), [
    'applyResponse',
    'awaitQuestions',
  ]);
  assert.deepEqual(
    destinations('schedule'),
    [
      ...draftConversationWorkKindSchema.options,
      'connections',
      'prepareReviewSuggestions',
    ].sort(),
  );
  assert.ok(!destinations('acceptTurn').includes('export'));
  for (const node of graph.nodes) assert.ok(node.label.includes(' / '));
  assert.ok(graph.nodes.some((node) => node.id === 'native-dependencies'));
});

test('the new automatic child graph has explicit loop and failure destinations without pretending to be connected to the conversation graph', async () => {
  const graph = await describeIncrementalConnectionGraph();
  const targets = (id) =>
    graph.edges
      .filter((edge) => edge.source === id)
      .map((edge) => edge.target)
      .sort();
  assert.deepEqual(targets('publishProgress'), [
    '__end__',
    'finalize',
    'prepareNative',
    'reserveModelCall',
  ]);
  assert.deepEqual(targets('proposeBundle'), ['applyBundle', 'fail']);
  assert.deepEqual(targets('fail'), ['__end__']);
  assert.deepEqual(targets('generateNativeParameters'), [
    'applyNativeMaterial',
    'fail',
  ]);
  assert.ok(graph.nodes.every((node) => node.label.includes(' / ')));
});

test('the Korean current-graph document is reproducible from actual graph registration, without model or business calls', async () => {
  assert.equal(
    await readFile(conversationGraphDocument, 'utf8'),
    await buildConversationGraphDocument(),
  );
});

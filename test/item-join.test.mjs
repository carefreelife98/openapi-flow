import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { validateWorkflowGraphPlan } from '@openapi-flow/core';
import {
  assembleN8nWorkflow,
  compilePlannedN8nWorkflow,
  createItemJoinCapability,
} from '@openapi-flow/n8n';
import { createItemJoinFixture } from './fixtures/item-join-fixture.mjs';
import { joinApiItems } from '../packages/n8n/dist/nodes/native/item-join/runtime/join-api-items.js';
import { validateNodeFragments } from '../packages/n8n/dist/workflow/validate-node-fragments.js';

const fixture = await createItemJoinFixture();
const row = (scopeIndex, sourceCallId, response) => ({
  json: { scopeIndex, sourceCallId, response },
});
test('an API output cannot impersonate the declared native item scope', () => {
  const registry = createItemJoinCapability({
    materials: fixture.materials
      .filter((material) =>
        ['alpha', 'beta'].includes(material.arguments.callId),
      )
      .map((material) => ({
        callId: material.arguments.callId,
        operation: material.operation,
      })),
    scopes: [
      {
        ...fixture.scopeSources[0],
        nodeId: 'alpha',
        nodeName: 'Request alpha',
      },
    ],
  });
  const plan = {
    ...fixture.plan,
    nativeNodes: fixture.plan.nativeNodes.map((planned) =>
      planned.id === 'joined'
        ? {
            ...planned,
            parameters: { ...planned.parameters, scopeNodeId: 'alpha' },
          }
        : planned,
    ),
  };
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        plan,
        materials: fixture.materials,
        capabilities: fixture.capabilities.map((capability) =>
          capability.name === registry.name ? registry : capability,
        ),
      }),
    /declared native node alpha/,
  );
});
test('ancestry grouping preserves identical values, types and both branch pairings without index zip', () => {
  const value = { id: 'same', nested: [null, false, '42'] };
  const result = joinApiItems({
    sourceCallIds: ['a', 'b'],
    items: [
      row(2, 'a', value),
      row(0, 'a', value),
      row(1, 'a', 42),
      row(1, 'b', '42'),
      row(2, 'b', null),
      row(0, 'b', null),
    ],
  });
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((item) => item.json.responses),
    [
      { a: value, b: null },
      { a: 42, b: '42' },
      { a: value, b: null },
    ],
  );
  assert.deepEqual(
    result.map((item) => item.pairedItem),
    [
      [{ item: 1 }, { item: 5 }],
      [{ item: 2 }, { item: 3 }],
      [{ item: 0 }, { item: 4 }],
    ],
  );
  assert.deepEqual(joinApiItems({ items: [], sourceCallIds: ['a', 'b'] }), []);
});
test('join rejects absent, duplicate or forged reader rows rather than dropping or filling responses', () => {
  assert.throws(
    () =>
      joinApiItems({ sourceCallIds: ['a', 'b'], items: [row(0, 'a', null)] }),
    /missing response b/,
  );
  assert.throws(
    () =>
      joinApiItems({
        sourceCallIds: ['a', 'b'],
        items: [row(0, 'a', null), row(0, 'a', null)],
      }),
    /duplicate response a/,
  );
  assert.throws(
    () =>
      joinApiItems({
        sourceCallIds: ['a', 'b'],
        items: [row(0, 'wrong', null)],
      }),
    /unknown sourceCallId/,
  );
  assert.throws(
    () =>
      joinApiItems({ sourceCallIds: ['a', 'b'], items: [row(-1, 'a', null)] }),
    /scopeIndex/,
  );
  assert.throws(
    () =>
      joinApiItems({
        sourceCallIds: ['a', 'b'],
        items: [row(0, 'a', undefined)],
      }),
    /response is missing/,
  );
});
test('SDK fragments route every named join input through its own validated reader', () => {
  const fragment = fixture.join.compile({
    planned: fixture.plan.nativeNodes.at(-1),
    apiNodeNames: { alpha: 'Request alpha', beta: 'Request beta' },
    position: [0, 0],
  });
  validateNodeFragments([fragment]);
  assert.equal(
    fragment.nodes.find((node) => node.type === 'n8n-nodes-base.merge').config
      .parameters.mode,
    'append',
  );
  assert.equal(fragment.inputEndpoints.input1.nodeId, 'joined-read-0');
  assert.equal(fragment.inputEndpoints.input2.nodeId, 'joined-read-1');
  assert.equal(
    fixture.workflow.connections['order-alpha'].main[0][0].node,
    'Read branch 1 joined',
  );
  assert.equal(
    fixture.workflow.connections['order-beta'].main[0][0].node,
    'Read branch 2 joined',
  );
  assert.throws(
    () =>
      validateNodeFragments([
        {
          ...fragment,
          inputEndpoints: { input1: fragment.inputEndpoints.input1 },
        },
      ]),
    /invalid input endpoints/,
  );
  assert.throws(
    () =>
      assembleN8nWorkflow({
        id: 'bad-root',
        name: 'Bad root',
        nodes: [fragment],
        edges: [],
        starts: ['joined'],
      }),
    /starts cannot bypass/,
  );
});
test('port-specific dependencies reject swapped branches before SDK compilation', () => {
  const plan = {
    ...fixture.plan,
    edges: fixture.plan.edges.map((edge) =>
      edge.to === 'joined'
        ? { ...edge, input: edge.input === 'input1' ? 'input2' : 'input1' }
        : edge,
    ),
  };
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        plan,
        materials: fixture.materials,
        capabilities: fixture.capabilities,
      }),
    /not available on every incoming route/,
  );
});
test('native scope dependency cannot refer to an unprovided or non-ancestor output', () => {
  assert.throws(() =>
    fixture.join.outputSchema({
      scopeNodeId: 'unknown',
      sourceCallIds: ['alpha', 'beta'],
    }),
  );
  assert.throws(() =>
    fixture.join.outputSchema({
      scopeNodeId: 'each-record',
      sourceCallIds: ['alpha', 'alpha'],
    }),
  );
  const materials = fixture.materials.map((material) =>
    material.arguments.callId === 'beta'
      ? {
          ...material,
          arguments: {
            ...material.arguments,
            values: { body: { id: 'same', amount: 8 } },
            bindings: [],
          },
        }
      : material,
  );
  const plan = {
    ...fixture.plan,
    edges: fixture.plan.edges.map((edge) =>
      edge.to === 'beta' ? { ...edge, from: 'records' } : edge,
    ),
  };
  assert.throws(
    () =>
      validateWorkflowGraphPlan({
        plan,
        materials,
        capabilities: fixture.capabilities,
      }),
    /each-record is not available on every incoming route/,
  );
});
test('readers resolve reference identity, reject ambiguous ancestry and keep the source OAS intact', () => {
  const fragment = fixture.join.compile({
    planned: fixture.plan.nativeNodes.at(-1),
    apiNodeNames: { alpha: 'Request alpha', beta: 'Request beta' },
    position: [0, 0],
  });
  const scopes = [
    { json: { item: { id: 'same', amount: 8 } } },
    { json: { item: { id: 'same', amount: 8 } } },
  ];
  const invoke = (match, branch = 'alpha') =>
    vm.runInNewContext(
      `(function(){${fragment.entry.config.parameters.jsCode}})()`,
      {
        $input: { all: () => [{ json: {} }] },
        $: (name) =>
          name === 'each-record'
            ? { all: () => scopes, itemMatching: () => match }
            : {
                itemMatching: () => ({
                  json: {
                    statusCode: 200,
                    headers: { 'content-type': 'application/json' },
                    body: { branch, item: scopes[1].json.item },
                  },
                }),
              },
      },
    );
  assert.equal(invoke(scopes[1])[0].json.scopeIndex, 1);
  assert.throws(() => invoke({ json: scopes[1].json }), /scope ancestry/);
  assert.throws(() => invoke(scopes[1], 'beta'), /OAS contract/);
});
test('compiled scope names and schemas must be the actual native producer contract', () => {
  const registry = fixture.capabilities.map((capability) =>
    capability !== fixture.join
      ? capability
      : {
          ...capability,
          compile: (input) => {
            const fragment = capability.compile(input);
            return {
              ...fragment,
              bindingSources: fragment.bindingSources.map((source) =>
                source.kind === 'native-json'
                  ? { ...source, schema: { type: 'string' } }
                  : source,
              ),
            };
          },
        },
  );
  assert.throws(
    () =>
      compilePlannedN8nWorkflow({
        id: 'bad-scope',
        name: 'Bad scope',
        plan: fixture.plan,
        materials: fixture.materials,
        apiNodes: fixture.apiNodes,
        capabilities: registry,
      }),
    /declared native output schema/,
  );
});

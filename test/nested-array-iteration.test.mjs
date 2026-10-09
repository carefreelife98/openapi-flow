import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createResponseArrayCapability } from '@openapi-flow/n8n';
import {
  capabilities,
  nativeNodes,
  names,
  parents,
  childrenFor,
  compileNestedIteration,
  materials,
} from './fixtures/nested-array-iteration-fixture.mjs';

const code = capabilities[0].compile({
  planned: nativeNodes[1],
  position: [0, 0],
  apiNodeNames: names,
}).entry.config.parameters.jsCode;
const envelope = (body) => ({
  json: {
    body,
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
  },
});
function extract(bodies) {
  const indices = [];
  const result = vm.runInNewContext(`(function(){${code}})()`, {
    $input: { all: () => bodies.map(() => ({ json: {} })) },
    $: (name) => {
      assert.equal(name, names.children);
      return {
        all: () => {
          throw Error('Global response selection is forbidden');
        },
        itemMatching: (index) => {
          indices.push(index);
          return envelope(bodies[index]);
        },
      };
    },
  });
  return { result, indices };
}
test('invalid array execution mode fails at the public boundary instead of silently selecting singleton mode', () => {
  for (const itemMode of ['single', 'automatic', null, false])
    assert.throws(
      () => createResponseArrayCapability({ materials, itemMode }),
      /response array capability: itemMode must be linked or omitted/,
    );
});
test('linked array reader preserves each parent array and pairing, including an empty middle array', () => {
  const bodies = parents.map((parent) => ({
    receipt: parent.id,
    parent,
    children: childrenFor(parent),
  }));
  const { result, indices } = extract(bodies);
  assert.deepEqual(indices, [0, 1, 2]);
  assert.deepEqual(
    Array.from(result, (item) => item.pairedItem.item),
    [0, 1, 2],
  );
  result.forEach((item, index) =>
    assert.equal(item.json.items, bodies[index].children),
  );
});
test('linked array reader accepts no inputs without selecting any source or inventing an item', () => {
  const { result, indices } = extract([]);
  assert.equal(result.length, 0);
  assert.deepEqual(indices, []);
});
test('linked array reader follows reordered and filtered ancestry rather than source stream positions', () => {
  const bodies = parents.map((parent) => ({
    parent,
    receipt: parent.id,
    children: childrenFor(parent),
  }));
  const sourceIndices = [2, 0];
  const result = vm.runInNewContext(`(function(){${code}})()`, {
    $input: { all: () => sourceIndices.map(() => ({ json: {} })) },
    $: () => ({
      all: () => {
        throw Error('Global selection is forbidden');
      },
      itemMatching: (inputIndex) => envelope(bodies[sourceIndices[inputIndex]]),
    }),
  });
  result.forEach((item, inputIndex) => {
    assert.equal(item.json.items, bodies[sourceIndices[inputIndex]].children);
    assert.equal(item.pairedItem.item, inputIndex);
  });
});
test('linked array reader validates every full response and never repairs invalid arrays or element types', () => {
  for (const children of [null, {}, [{ id: 'x', amount: '4' }]])
    assert.throws(
      () =>
        extract([
          { receipt: 'valid', parent: parents[0], children: [] },
          { receipt: 'invalid', parent: parents[1], children },
        ]),
      /OAS contract/,
    );
  assert.throws(() => extract([{ children: [] }]), /OAS contract/);
});
test('linked array reader surfaces ambiguous ancestry instead of choosing a response', () => {
  assert.throws(
    () =>
      vm.runInNewContext(`(function(){${code}})()`, {
        $input: { all: () => [{ json: {} }] },
        $: () => ({
          itemMatching: () => {
            throw Error('ambiguous ancestry');
          },
        }),
      }),
    /ambiguous ancestry/,
  );
});
test('nested five-API workflow derives both array contracts and retains parent, child and intermediate bindings', () => {
  const { workflow } = compileNestedIteration();
  assert.equal(
    workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.splitOut')
      .length,
    2,
  );
  assert.equal(
    workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.httpRequest')
      .length,
    5,
  );
  const materialize = workflow.nodes.find(
    (node) => node.name === 'Materialize inspect',
  );
  assert.ok(materialize.parameters.jsCode.includes('itemMatching(inputIndex)'));
  assert.ok(materialize.parameters.jsCode.includes('each-parent'));
  assert.ok(materialize.parameters.jsCode.includes('each-child'));
});

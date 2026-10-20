import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  collectDeferredApiInputSlots,
  createDeferredApiInputsSchema,
  inspectDeferredApiInputs,
  materializeDeferredApiInputs,
  DeferredApiInputError,
} from '@openapi-flow/core';
import { deferredInputMaterial } from './fixtures/deferred-api-input-fixture.mjs';

test('slots contain OAS contracts and stable call-scoped identities, not dummy values', async () => {
  const material = await deferredInputMaterial({
    type: 'integer',
    minimum: 1,
    default: 7,
    examples: [8],
  });
  const before = globalThis.structuredClone(material);
  const slots = collectDeferredApiInputSlots({ materials: [material] });
  assert.equal(slots.length, 1);
  assert.equal(slots[0].state, 'deferred');
  assert.equal(slots[0].targetPointer, '/body');
  assert.deepEqual(
    slots[0].schema,
    material.operation.operation.requestBody.content['application/json'].schema,
  );
  assert.equal(Object.hasOwn(slots[0], 'value'), false);
  assert.deepEqual(
    slots,
    collectDeferredApiInputSlots({ materials: [material] }),
  );
  const repeated = collectDeferredApiInputSlots({
    materials: [material, { ...material, callId: 'another-role' }],
  });
  assert.notEqual(repeated[0].id, repeated[1].id);
  assert.deepEqual(material, before);
  slots[0].schema.minimum = -100;
  assert.deepEqual(material, before);
});

test('missing runtime values stay pending and fail at the execution boundary with their exact target', async () => {
  const material = await deferredInputMaterial({ type: 'integer', minimum: 1 });
  const input = { materials: [material], inputValues: {} };
  const checked = inspectDeferredApiInputs(input);
  assert.equal(checked.status, 'needs-input');
  assert.equal(Object.hasOwn(checked, 'arguments'), false);
  assert.equal(checked.issues[0].targetPointer, '/body');
  assert.throws(
    () => materializeDeferredApiInputs(input),
    (error) =>
      error instanceof DeferredApiInputError &&
      error.message.includes('submit/body') &&
      error.issues[0].inputId === checked.slots[0].id,
  );
});

test('false, zero, empty containers, empty strings and allowed null are actual values, not missing sentinels', async () => {
  for (const [schema, value] of [
    [{ type: 'boolean' }, false],
    [{ type: 'integer', minimum: 0 }, 0],
    [{ type: 'number' }, 1.25],
    [{ type: 'string' }, ''],
    [{ type: 'array', items: { type: 'string' } }, []],
    [{ type: 'object', additionalProperties: true }, {}],
    [{ type: ['string', 'null'] }, null],
  ]) {
    const material = await deferredInputMaterial(schema);
    const materials = [material];
    const [slot] = collectDeferredApiInputSlots({ materials });
    const input = { materials, inputValues: { [slot.id]: value } };
    assert.equal(
      createDeferredApiInputsSchema([slot]).safeParse(input.inputValues)
        .success,
      true,
    );
    const [args] = materializeDeferredApiInputs(input);
    assert.deepEqual(args.values.body, value);
    assert.deepEqual(args.unresolvedInputs, []);
    assert.deepEqual(material.values, {});
  }
});

test('numeric ranges, enums, patterns, array cardinality, required properties and JSON types remain authoritative', async () => {
  for (const [schema, value] of [
    [{ type: 'integer', minimum: 1 }, 0],
    [{ type: 'integer' }, '2'],
    [{ type: 'boolean' }, 'false'],
    [{ type: 'string', enum: ['JP', 'KR'] }, 'REPLACE_ME'],
    [{ type: 'string', pattern: '^[0-9]+$' }, 'REPLACE_ME'],
    [{ type: 'array', minItems: 1, items: { type: 'string' } }, []],
    [
      {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
      },
      {},
    ],
    [{ type: 'string' }, null],
  ]) {
    const materials = [await deferredInputMaterial(schema)];
    const [slot] = collectDeferredApiInputSlots({ materials });
    const input = { materials, inputValues: { [slot.id]: value } };
    assert.equal(inspectDeferredApiInputs(input).status, 'invalid-input');
    assert.equal(
      createDeferredApiInputsSchema([slot]).safeParse(input.inputValues)
        .success,
      false,
    );
    assert.throws(
      () => materializeDeferredApiInputs(input),
      DeferredApiInputError,
    );
    assert.deepEqual(input.inputValues[slot.id], value);
  }
});

test('partial supplied values do not become executable arguments and can be completed without mutation', async () => {
  const material = await deferredInputMaterial(
    {
      type: 'object',
      properties: { count: { type: 'integer' }, enabled: { type: 'boolean' } },
      required: ['count', 'enabled'],
      additionalProperties: false,
    },
    { values: { body: {} } },
  );
  const materials = [material];
  const slots = collectDeferredApiInputSlots({ materials });
  const count = slots.find((slot) => slot.targetPointer === '/body/count');
  const enabled = slots.find((slot) => slot.targetPointer === '/body/enabled');
  assert.ok(count && enabled);
  const inputValues = { [count.id]: 0 };
  const pending = inspectDeferredApiInputs({ materials, inputValues });
  assert.equal(pending.status, 'needs-input');
  assert.equal(pending.issues.length, 1);
  assert.equal(pending.issues[0].inputId, enabled.id);
  assert.equal(Object.hasOwn(pending, 'arguments'), false);
  const [args] = materializeDeferredApiInputs({
    materials,
    inputValues: { ...inputValues, [enabled.id]: false },
  });
  assert.deepEqual(args.values.body, { count: 0, enabled: false });
  assert.deepEqual(material.values.body, {});
  assert.deepEqual(inputValues, { [count.id]: 0 });
});

test('slots exclude bound fields and preserve typed response bindings without fabricating source data', async () => {
  const binding = {
    kind: 'node-output',
    sourceNodeId: 'read-member',
    sourcePointer: '/id',
    targetPointer: '/body/id',
  };
  const material = await deferredInputMaterial(
    {
      type: 'object',
      properties: { id: { type: 'string' }, quantity: { type: 'integer' } },
      required: ['id', 'quantity'],
      additionalProperties: false,
    },
    { bindings: [binding] },
  );
  const materials = [material];
  const [slot] = collectDeferredApiInputSlots({ materials });
  assert.equal(slot.targetPointer, '/body/quantity');
  const [args] = materializeDeferredApiInputs({
    materials,
    inputValues: { [slot.id]: 2 },
  });
  assert.deepEqual(args.values, { body: { quantity: 2 } });
  assert.deepEqual(args.bindings, [binding]);
  assert.equal(Object.hasOwn(args.values.body, 'id'), false);
  const boundBody = {
    ...material,
    bindings: [{ ...binding, targetPointer: '/body' }],
  };
  assert.deepEqual(
    collectDeferredApiInputSlots({ materials: [boundBody] }),
    [],
  );
});

test('optional inputs remain omitted and complete inputs never acquire slots', async () => {
  const optional = await deferredInputMaterial(
    { type: 'string', default: 'not-confirmed' },
    { required: false },
  );
  assert.deepEqual(collectDeferredApiInputSlots({ materials: [optional] }), []);
  assert.deepEqual(
    materializeDeferredApiInputs({ materials: [optional], inputValues: {} })[0]
      .values,
    {},
  );
  const complete = { ...optional, values: { body: 'supplied' } };
  assert.deepEqual(collectDeferredApiInputSlots({ materials: [complete] }), []);
  assert.equal(
    materializeDeferredApiInputs({ materials: [complete], inputValues: {} })[0]
      .values.body,
    'supplied',
  );
  assert.deepEqual(
    materializeDeferredApiInputs({ materials: [], inputValues: {} }),
    [],
  );
});

test('unknown and stale slots cannot enter requests, including after changing call identity or OAS snapshot', async () => {
  const material = await deferredInputMaterial({ type: 'string' });
  const [slot] = collectDeferredApiInputSlots({ materials: [material] });
  for (const changed of [
    { ...material, callId: 'new-instance' },
    {
      ...material,
      operation: {
        ...material.operation,
        key: { ...material.operation.key, snapshotId: 'new-snapshot' },
      },
    },
    { ...material, values: { body: 'already-filled' } },
  ]) {
    const checked = inspectDeferredApiInputs({
      materials: [changed],
      inputValues: { [slot.id]: 'stale' },
    });
    assert.equal(checked.status, 'invalid-input');
    assert.ok(checked.issues.some((issue) => issue.code === 'unknown-input'));
  }
  assert.equal(
    createDeferredApiInputsSchema([slot]).safeParse({
      [slot.id]: 'ok',
      unknown: 'bad',
    }).success,
    false,
  );
});

test('malformed runtime values, duplicate materials and altered literal ownership are rejected', async () => {
  const material = await deferredInputMaterial({ type: 'integer' });
  for (const inputValues of [
    null,
    [],
    false,
    undefined,
    { arbitrary: undefined },
    { arbitrary: NaN },
  ]) {
    assert.equal(
      inspectDeferredApiInputs({ materials: [material], inputValues }).status,
      'invalid-input',
    );
  }
  assert.throws(
    () => collectDeferredApiInputSlots({ materials: [material, material] }),
    /distinct/,
  );
  assert.throws(
    () => collectDeferredApiInputSlots({ materials: null }),
    /materials/,
  );
  assert.throws(
    () =>
      collectDeferredApiInputSlots({
        materials: [{ ...material, values: { body: 'wrong' } }],
      }),
    /OAS|schema/,
  );
});

test('input form schema preserves OAS constraints and descriptions without defaults, coercion or overlapping slots', async () => {
  const material = await deferredInputMaterial({
    type: 'integer',
    minimum: 1,
    default: 7,
  });
  const [slot] = collectDeferredApiInputSlots({ materials: [material] });
  const schema = createDeferredApiInputsSchema([slot]);
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ [slot.id]: '1' }).success, false);
  const json = z.toJSONSchema(schema);
  assert.equal(json.properties[slot.id].minimum, 1);
  assert.match(json.properties[slot.id].description, /Actual runtime value/);
  assert.throws(
    () =>
      createDeferredApiInputsSchema([
        slot,
        { ...slot, id: 'other', targetPointer: '/body/child' },
      ]),
    /non-overlapping/,
  );
  assert.throws(
    () =>
      createDeferredApiInputsSchema([
        { ...slot, targetPointer: '/body/~invalid' },
      ]),
    /pattern|Invalid/,
  );
  assert.deepEqual(createDeferredApiInputsSchema([]).parse({}), {});
});

test('OAS 3.0 nullable values and nested numeric object keys are preserved', async () => {
  const nullable = await deferredInputMaterial(
    { type: 'string', nullable: true },
    { openapi: '3.0.3' },
  );
  const [slot] = collectDeferredApiInputSlots({ materials: [nullable] });
  assert.equal(
    materializeDeferredApiInputs({
      materials: [nullable],
      inputValues: { [slot.id]: null },
    })[0].values.body,
    null,
  );
  const object = await deferredInputMaterial(
    { type: 'object', properties: { 0: { type: 'string' } }, required: ['0'] },
    { values: { body: {} } },
  );
  const [property] = collectDeferredApiInputSlots({ materials: [object] });
  assert.equal(property.targetPointer, '/body/0');
  const [args] = materializeDeferredApiInputs({
    materials: [object],
    inputValues: { [property.id]: 'unchanged' },
  });
  assert.equal(Array.isArray(args.values.body), false);
  assert.deepEqual(args.values.body, { 0: 'unchanged' });
});

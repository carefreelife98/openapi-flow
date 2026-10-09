import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { compileStandaloneValidator } from '../packages/n8n/dist/nodes/common/validation/compile-standalone-validator.js';

for (const keyword of ['const', 'enum'])
  test(`standalone ${keyword} compares JSON data, not constructors or execution realms`, () => {
    const value = {
      constructor: 'ordinary field',
      nested: [null, false, { id: '42' }],
    };
    const code = compileStandaloneValidator({
      schema: { [keyword]: keyword === 'const' ? value : [value, 'other'] },
      globalName: 'Validator',
    });
    const validate = vm.runInNewContext(`${code}\nValidator`);
    const equivalent = Object.assign(Object.create(null), {
      nested: [null, false, Object.assign(Object.create(null), { id: '42' })],
      constructor: 'ordinary field',
    });
    assert.equal(validate(equivalent), true);
    assert.equal(
      validate({ ...equivalent, nested: [null, false, { id: 42 }] }),
      false,
    );
    assert.equal(validate({ ...equivalent, extra: true }), false);
    assert.equal(
      validate({ ...equivalent, nested: [null, false, { id: '42' }, null] }),
      false,
    );
  });

test('standalone equality preserves object key-order independence and array order/types', () => {
  const code = compileStandaloneValidator({
    schema: { enum: [[0, false, null, '42'], { a: 1, b: 2 }] },
    globalName: 'Validator',
  });
  const validate = vm.runInNewContext(`${code}\nValidator`);
  assert.equal(validate([0, false, null, '42']), true);
  assert.equal(validate([0, false, null, 42]), false);
  assert.equal(validate([false, 0, null, '42']), false);
  assert.equal(validate({ b: 2, a: 1 }), true);
});
test('uniqueItems uses the same JSON equality for isolated object items', () => {
  const code = compileStandaloneValidator({
    schema: { type: 'array', uniqueItems: true },
    globalName: 'Validator',
  });
  const validate = vm.runInNewContext(`${code}\nValidator`);
  const first = Object.assign(Object.create(null), { id: '42' });
  const second = Object.assign(Object.create(null), { id: '42' });
  assert.equal(validate([first, second]), false);
  assert.equal(validate([first, { id: 42 }]), true);
});

test('standalone equality stays callable when the runtime excludes getter exports', () => {
  const isolatedObject = new Proxy(Object, {
    get(target, key, receiver) {
      if (key === 'defineProperty')
        return (object, property, descriptor) => {
          if ('get' in descriptor || 'set' in descriptor) return object;
          return Object.defineProperty(object, property, descriptor);
        };
      return Reflect.get(target, key, receiver);
    },
  });
  const code = compileStandaloneValidator({
    schema: { const: { nested: [null, { id: '42' }] } },
    globalName: 'Validator',
  });
  const validate = vm.runInNewContext(`${code}\nValidator`, {
    Object: isolatedObject,
  });
  assert.equal(validate({ nested: [null, { id: '42' }] }), true);
  assert.equal(validate({ nested: [null, { id: 42 }] }), false);
});

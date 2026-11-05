import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { nativeBindingSchemas } from '../packages/core/dist/bindings/native-binding-schema.js';
import { projectSchemaPointer } from '../packages/core/dist/bindings/project-schema-pointer.js';
import { createSchemaResourceContext } from '../packages/core/dist/bindings/resources/create-schema-resource-context.js';

const { Ajv2020 } = createRequire(
  new URL('../packages/core/package.json', import.meta.url),
)('ajv/dist/2020.js');
const source = () => ({
  $id: 'https://preparation.test/root',
  type: 'object',
  properties: { rows: { type: 'array', items: { $ref: '#/$defs/row' } } },
  $defs: {
    row: {
      type: 'object',
      properties: { id: { type: 'string' }, next: { $ref: '#/$defs/row' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
});

test('repeated native and response projections prepare one resource across cloned declarations', () => {
  const compile = Ajv2020.prototype._compileSchemaEnv;
  const instances = new Set();
  Ajv2020.prototype._compileSchemaEnv = function (...args) {
    instances.add(this);
    return compile.apply(this, args);
  };
  try {
    for (let i = 0; i < 12; i++) {
      nativeBindingSchemas(
        { nodeId: 'producer', schema: source() },
        '/rows/0/id',
      );
      projectSchemaPointer(source(), '/rows/0/next/id');
    }
  } finally {
    Ajv2020.prototype._compileSchemaEnv = compile;
  }
  assert.equal(
    instances.size,
    1,
    'identical cloned resources must share validated preparation',
  );
});

test('changed source contents under the same ID are revalidated, including invalid mutations', () => {
  const schema = source();
  const first = createSchemaResourceContext(schema);
  schema.$defs.row.properties.id.type = 'integer';
  const second = createSchemaResourceContext(schema);
  assert.notEqual(first, second);
  assert.equal(first.root.$defs.row.properties.id.type, 'string');
  assert.equal(second.root.$defs.row.properties.id.type, 'integer');
  schema.$defs.row.properties.id.$ref = '#/$defs/absent';
  assert.throws(() => createSchemaResourceContext(schema), /resolve reference/);
  delete schema.$defs.row.properties.id.$ref;
  schema.extra = undefined;
  assert.throws(
    () => createSchemaResourceContext(schema),
    /must contain JSON values/,
  );
});

test('prepared resources are immutable and public projections remain independent mutable JSON', () => {
  const schema = source();
  const context = createSchemaResourceContext(schema);
  assert.throws(() => {
    context.root.$defs.row.properties.id.type = 'boolean';
  }, TypeError);
  const first = nativeBindingSchemas(
    { nodeId: 'producer', schema },
    '/rows',
  )[0];
  first.$defs.resource.$defs.row.properties.id.type = 'boolean';
  const second = nativeBindingSchemas(
    { nodeId: 'producer', schema },
    '/rows',
  )[0];
  assert.equal(second.$defs.resource.$defs.row.properties.id.type, 'string');
  assert.equal(schema.$defs.row.properties.id.type, 'string');
});

test('resources evicted by later declarations are prepared again without losing scoped recursive refs', () => {
  const first = createSchemaResourceContext(source());
  for (let i = 0; i < 40; i++)
    createSchemaResourceContext({
      ...source(),
      $id: `https://preparation.test/eviction/${i}`,
    });
  const context = createSchemaResourceContext(source());
  assert.notEqual(first, context);
  const schema = projectSchemaPointer(source(), '/rows/0')[0];
  const validate = new Ajv2020({ strict: false }).compile(schema);
  assert.equal(validate({ id: 'one', next: { id: 'two' } }), true);
  assert.equal(validate({ id: 'one', next: { id: 2 } }), false);
});

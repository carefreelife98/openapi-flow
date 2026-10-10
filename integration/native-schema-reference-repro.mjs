import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { createNativeArrayCapability } from '@openapi-flow/n8n';

// This intentionally exits nonzero until native schema resource scope is preserved.
const require = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const schema = {
  type: 'object',
  $defs: {
    row: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  properties: { rows: { type: 'array', items: { $ref: '#/$defs/row' } } },
  required: ['rows'],
  additionalProperties: false,
};
const validate = new Ajv2020({ strict: false }).compile(schema);
assert.equal(validate({ rows: [{ id: 'original' }] }), true);
assert.equal(validate({ rows: [{ id: 42 }] }), false);

const capability = createNativeArrayCapability({
  sources: [{ nodeId: 'source', nodeName: 'source', schema }],
});
capability.compile({
  planned: {
    id: 'split',
    capability: capability.name,
    parameters: { sourceNodeId: 'source', pointer: '/rows' },
  },
  apiNodeNames: {},
  position: [0, 0],
});

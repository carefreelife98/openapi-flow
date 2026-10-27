import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createNativeOutputContracts } from '@openapi-flow/core';
import { createNativeOutputProjectionCapability } from '@openapi-flow/n8n';

const source = {
  nodeId: 'original',
  nodeName: 'Original JSON',
  schema: {
    type: 'object',
    properties: {
      text: { type: ['string', 'null'] },
      candidates: { type: 'array', items: { type: 'string' } },
      count: { type: 'integer' },
      optional: { type: 'string' },
    },
    required: ['text', 'candidates', 'count'],
    additionalProperties: false,
  },
};
const fields = [
  { name: 'originalText', pointer: '/text' },
  { name: 'originalCandidates', pointer: '/candidates' },
  { name: 'textUtf16Units', pointer: '/text', measurement: 'utf16-code-units' },
  {
    name: 'candidateCount',
    pointer: '/candidates',
    measurement: 'array-items',
  },
];
const capability = createNativeOutputProjectionCapability({
  sources: [source],
});
function compile(selectedFields = fields) {
  return capability.compile({
    planned: {
      id: 'summary',
      capability: capability.name,
      parameters: { sourceNodeId: source.nodeId, fields: selectedFields },
    },
    apiNodeNames: {},
    nativeOutputSources: [source],
    position: [0, 0],
  });
}
function execute(rows, fragment = compile()) {
  const guarded = vm.runInNewContext(
    `(function(){${fragment.entry.config.parameters.jsCode}})()`,
    {
      $input: { all: () => rows.map((json) => ({ json })) },
      $: (name) => {
        assert.equal(name, source.nodeName);
        return { itemMatching: (index) => ({ json: rows[index] }) };
      },
    },
  );
  return Array.from(guarded, (row) => ({
    json: JSON.parse(
      vm.runInNewContext(
        fragment.exit.config.parameters.jsonOutput.slice(3, -2),
        { $json: row.json },
      ),
    ),
    pairedItem: JSON.parse(JSON.stringify(row.pairedItem)),
  }));
}

test('explicit measurements use official Edit Fields expressions and preserve original Unicode, candidate order and ancestry', () => {
  const rows = [
    {
      text: '한😀e\u0301',
      candidates: ['={{ literal }}', '', 'duplicate', 'duplicate'],
      count: 0,
    },
    { text: '', candidates: [], count: 0 },
  ];
  const before = globalThis.structuredClone(rows);
  const fragment = compile();
  assert.equal(fragment.exit.type, 'n8n-nodes-base.set');
  assert.match(fragment.exit.config.parameters.jsonOutput, /\.length/);
  const result = execute(rows, fragment);
  assert.deepEqual(
    result.map((item) => item.json),
    rows.map((row) => ({
      originalText: row.text,
      originalCandidates: row.candidates,
      textUtf16Units: row.text.length,
      candidateCount: row.candidates.length,
    })),
  );
  assert.equal(result[0].json.textUtf16Units, 5);
  assert.deepEqual(
    result.map((item) => item.pairedItem),
    [{ item: 0 }, { item: 1 }],
  );
  assert.deepEqual(rows, before);
  assert.deepEqual(execute([], fragment), []);
});

test('code derives count schemas while copied fields retain their actual original contract', () => {
  const [output] = createNativeOutputContracts({
    nativeNodes: [
      {
        id: 'summary',
        capability: capability.name,
        parameters: { sourceNodeId: source.nodeId, fields },
      },
    ],
    capabilities: [capability],
  });
  assert.deepEqual(output.schema.properties.textUtf16Units, {
    type: 'integer',
    minimum: 0,
  });
  assert.deepEqual(output.schema.properties.candidateCount, {
    type: 'integer',
    minimum: 0,
  });
  assert.notDeepEqual(output.schema.properties.originalText, {
    type: 'integer',
    minimum: 0,
  });
});

test('incompatible declared measurement types fail at compilation and never become a silent zero', () => {
  for (const field of [
    { name: 'invalid', pointer: '/count', measurement: 'utf16-code-units' },
    { name: 'invalid', pointer: '/text', measurement: 'array-items' },
    {
      name: 'invalid',
      pointer: '/candidates',
      measurement: 'utf16-code-units',
    },
  ])
    assert.throws(() => compile([field]), /declared type cannot be/);
  assert.equal(
    capability.parametersSchema.safeParse({
      sourceNodeId: source.nodeId,
      fields: [
        { name: 'invalid', pointer: '/text', measurement: 'characters' },
      ],
    }).success,
    false,
  );
});

test('missing values, nullable actual values and complete source violations fail in Code before Edit Fields', () => {
  assert.throws(
    () => execute([{ text: null, candidates: [], count: 0 }]),
    /requires string/,
  );
  assert.throws(
    () => execute([{ text: 'a', candidates: [], count: '0' }]),
    /does not match declared schema/,
  );
  assert.throws(
    () =>
      execute(
        [{ text: 'a', candidates: [], count: 0 }],
        compile([
          {
            name: 'absent',
            pointer: '/optional',
            measurement: 'utf16-code-units',
          },
        ]),
      ),
    /Missing native pointer/,
  );
});

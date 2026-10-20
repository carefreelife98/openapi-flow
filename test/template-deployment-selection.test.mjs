import assert from 'node:assert/strict';
import test from 'node:test';
import { selectN8nTemplateDeployments } from '@openapi-flow/n8n';

test('deployment selection validates the available registry and projects only explicitly selected document settings without mutation or defaults', () => {
  const deployments = [
    { documentId: 'a', baseUrl: 'https://a.example.test' },
    { documentId: 'b', baseUrl: 'https://b.example.test' },
  ];
  const original = globalThis.structuredClone(deployments);
  const result = selectN8nTemplateDeployments({
    deployments,
    availableDocumentIds: ['a', 'b', 'c'],
    selectedDocumentIds: ['a', 'c'],
  });
  assert.deepEqual(result, [deployments[0]]);
  assert.notEqual(result[0], deployments[0]);
  assert.deepEqual(deployments, original);
  assert.deepEqual(
    selectN8nTemplateDeployments({
      deployments,
      availableDocumentIds: ['a', 'b'],
      selectedDocumentIds: [],
    }),
    [],
  );
});

test('unused unknown or malformed deployment data is rejected rather than silently filtered', () => {
  const base = {
    deployments: [{ documentId: 'a', baseUrl: 'https://a.example.test' }],
    availableDocumentIds: ['a', 'b'],
    selectedDocumentIds: ['a'],
  };
  for (const changed of [
    {
      deployments: [
        ...base.deployments,
        { documentId: 'unknown', baseUrl: 'https://unknown.example.test' },
      ],
    },
    { deployments: [...base.deployments, { documentId: 'b', baseUrl: 4 }] },
    { deployments: [...base.deployments, base.deployments[0]] },
    { selectedDocumentIds: ['unknown'] },
    { availableDocumentIds: ['a', 'a'] },
    { selectedDocumentIds: ['a', 'a'] },
  ])
    assert.throws(() => selectN8nTemplateDeployments({ ...base, ...changed }));
});

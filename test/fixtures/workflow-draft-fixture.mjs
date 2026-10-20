import { createWorkflowDraft } from '@openapi-flow/core';
import { compilationInput } from './workflow-review-fixture.mjs';

export async function workflowDraftFixture(requirements = []) {
  const compiled = await compilationInput();
  const operation = compiled.materials[0].operation;
  const context = {
    operations: compiled.materials.map((item) => item.operation),
    capabilities: compiled.capabilities,
    messages: [{ id: 'request-1', text: 'Read a, then b; c is independent.' }],
  };
  const call = (id, values, bindings = []) => ({
    id,
    operation: operation.key,
    values,
    bindings,
  });
  const content = {
    id: 'editable-workflow',
    requirements,
    apiCalls: [
      call('a', { query: { mode: 'first' } }),
      call('b', {}, [
        {
          kind: 'node-output',
          sourceNodeId: 'a',
          sourcePointer: '/value',
          targetPointer: '/query/mode',
        },
      ]),
      call('c', { query: { mode: 'independent' } }),
    ],
    nativeNodes: [],
    edges: [{ from: 'a', output: 'main', to: 'b', input: 'main' }],
  };
  const draft = createWorkflowDraft({ content, context });
  return { draft, context, content };
}

export function scopedRequirement(state, nodeIds = ['a']) {
  return {
    id: 'purpose',
    text: 'Confirm the purpose of this branch',
    state,
    scope: { kind: 'nodes', nodeIds },
    sourceMessageIds: ['request-1'],
  };
}

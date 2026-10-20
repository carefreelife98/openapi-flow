import {
  createN8nNativeCapabilities,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import { materials } from './array-iteration-fixture.mjs';

export const singletonResponseOperation = materials.find(
  (item) => item.callId === 'details',
).operation;
export const singletonResponseBody = {
  receipt: 'r',
  input: { id: 'same', amount: 2 },
};
export const singletonResponseCheck = (nodeId) => ({
  left: { source: 'response', nodeId, pointer: '/input/amount' },
  operator: 'equals',
  right: { source: 'literal', value: 2 },
  message: 'Amount must match',
});

export function compileSingletonResponseWorkflow(
  capability = 'assert-responses',
  baseUrl = 'http://fixture.invalid',
) {
  const apiMaterials = ['left', 'right'].map((callId) => ({
    operation: singletonResponseOperation,
    arguments: {
      callId,
      values: { body: { id: 'same', amount: 2 } },
      bindings: [],
      unresolvedInputs: [],
    },
  }));
  return compilePlannedN8nWorkflow({
    id: 'singleton-check',
    name: 'Independent responses after append',
    materials: apiMaterials,
    capabilities: createN8nNativeCapabilities({ itemMode: 'linked' }),
    apiNodes: apiMaterials.map((material, index) =>
      createHttpRequestNode({
        ...material,
        baseUrl,
        itemMode: 'linked',
        position: [0, index * 200],
      }),
    ),
    plan: {
      starts: ['left', 'right'],
      gaps: [],
      nativeNodes: [
        {
          id: 'join',
          capability: 'merge-append',
          parameters: { numberInputs: 2 },
        },
        {
          id: 'check',
          capability,
          parameters:
            capability === 'if'
              ? {
                  combinator: 'and',
                  conditions: ['left', 'right'].map((id) => {
                    const value = singletonResponseCheck(id);
                    return {
                      left: value.left,
                      operator: value.operator,
                      right: value.right,
                    };
                  }),
                }
              : {
                  checks: [
                    singletonResponseCheck('left'),
                    singletonResponseCheck('right'),
                  ],
                },
        },
      ],
      edges: [
        { from: 'left', output: 'main', to: 'join', input: 'input1' },
        { from: 'right', output: 'main', to: 'join', input: 'input2' },
        { from: 'join', output: 'main', to: 'check', input: 'main' },
      ],
    },
  }).workflow;
}

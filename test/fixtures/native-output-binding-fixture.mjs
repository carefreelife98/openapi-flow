import { z } from 'zod';
import { createNativeOutputContracts } from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  createN8nNativeOutputSources,
  createN8nNativeCapabilities,
  createHttpRequestNode,
} from '@openapi-flow/n8n';
import { materials, bind, spec } from './request-binding-fixture.mjs';

export const contextCapability = createJsonOutputCapability({
  name: 'request-context',
  description:
    'Explicit scenario product ID as a typed native JSON item; no API response or conversion.',
  parametersSchema: z.strictObject({ id: z.string() }),
});
export const capabilities = [
  ...createN8nNativeCapabilities(),
  contextCapability,
];
export const nativeNodes = [
  {
    id: 'context',
    capability: 'request-context',
    parameters: { id: 'native/42' },
  },
];
export const nativeOutputs = createNativeOutputContracts({
  nativeNodes,
  capabilities,
});
export const material = materials.find((item) => item.callId === 'detail');
export const bindings = [bind('/path/id', 'context', '/id')];
export const args = {
  callId: 'detail',
  values: {},
  bindings,
  unresolvedInputs: [],
};
export const graphMaterial = { operation: material.operation, arguments: args };
export const plan = {
  nativeNodes,
  edges: [{ from: 'context', output: 'main', to: 'detail', input: 'main' }],
  starts: ['context'],
  gaps: [],
};
export const sources = createN8nNativeOutputSources({
  nativeNodes,
  capabilities,
  apiNodeNames: { detail: 'Request detail' },
});
export function requestFragment(options = {}) {
  return createHttpRequestNode({
    ...graphMaterial,
    nativeOutputSources: sources,
    baseUrl: 'https://fixture.test',
    position: [300, 0],
    ...options,
  });
}
export { spec };

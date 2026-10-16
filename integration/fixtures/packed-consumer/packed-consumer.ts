import assert from 'node:assert/strict';
import { readFile, writeFile, lstat, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import {
  createApiCatalog,
  createApiArgumentsSchema,
  resolveApiOperations,
  validateOpenApi,
} from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import { generateApiArguments } from '@openapi-flow/langchain';
import type { GenerateApiArgumentsInput } from '@openapi-flow/langchain';
import {
  createHttpRequestNode,
  createN8nNativeCapabilities,
  compileReviewableN8nWorkflow,
} from '@openapi-flow/n8n';
import { packedConsumerFixtureSchema } from './packed-consumer-schema.js';

// Compile the consumer's real public adapter signature without contacting a model.
export function planWithConsumerModel(input: GenerateApiArgumentsInput) {
  return generateApiArguments(input);
}

const specPath = process.env.OPENAPI_FLOW_PACKED_CONSUMER_OAS;
const fixturePath = process.env.OPENAPI_FLOW_PACKED_CONSUMER_INPUT;
assert.ok(specPath, 'OPENAPI_FLOW_PACKED_CONSUMER_OAS is required');
assert.ok(fixturePath, 'OPENAPI_FLOW_PACKED_CONSUMER_INPUT is required');
const require = createRequire(import.meta.url);
const consumerRoot = resolve(dirname(import.meta.dirname));
for (const name of ['core', 'langchain', 'n8n']) {
  const packagePath = resolve(
    consumerRoot,
    `node_modules/@openapi-flow/${name}`,
  );
  assert.equal((await lstat(packagePath)).isSymbolicLink(), false);
  assert.ok(
    (await realpath(require.resolve(`@openapi-flow/${name}`))).startsWith(
      consumerRoot + sep,
    ),
    `${name} must resolve inside the independently installed consumer`,
  );
}
await import('@openapi-flow/core/runtime');
await import('@openapi-flow/core/internal');
await import('@openapi-flow/langchain/legacy');
await import('@openapi-flow/n8n/legacy');

const fixture = packedConsumerFixtureSchema.parse(
  JSON.parse(await readFile(fixturePath, 'utf8')),
);
const spec = validateOpenApi(JSON.parse(await readFile(specPath, 'utf8')));
const catalog = await createApiCatalog([{ id: 'consumer-source', spec }]);
const candidate = catalog.operations.find(
  (entry) => entry.operationRef === fixture.operationRef,
);
assert.ok(candidate, 'Consumer OAS has no requested operationRef');
const [operation] = await resolveApiOperations(catalog, [candidate.key]);
const proposal = createApiArgumentsSchema({ operation, bindings: [] }).parse(
  fixture.argumentProposal,
);
const args: ApiCallArguments = {
  ...proposal,
  callId: 'packed-consumer-request',
  bindings: [],
  unresolvedInputs: [],
};
const names = { [args.callId]: `Request ${args.callId}` };
const request = createHttpRequestNode({
  operation,
  arguments: args,
  apiNodeNames: names,
  apiResponseContracts: { [args.callId]: operation },
  position: [300, 0],
});
const response = { source: 'response', nodeId: args.callId, pointer: '' };
const result = compileReviewableN8nWorkflow({
  id: 'packed-consumer-workflow',
  name: 'Independent tarball consumer compilation check',
  materials: [{ status: 'ready', operation, arguments: args }],
  apiNodes: [request],
  capabilities: createN8nNativeCapabilities(),
  plan: {
    nativeNodes: [
      {
        id: 'validate-packed-response',
        capability: 'assert-responses',
        parameters: {
          checks: [
            {
              left: response,
              operator: 'equals',
              right: response,
              message: 'Packed response contract check',
            },
          ],
        },
      },
    ],
    starts: [args.callId],
    edges: [
      {
        from: args.callId,
        output: 'main',
        to: 'validate-packed-response',
        input: 'main',
      },
    ],
    gaps: [],
    blockedCalls: [],
  },
});
assert.equal(result.status, 'complete');
assert.ok(
  result.workflow.nodes.some(
    (node) => node.type === 'n8n-nodes-base.httpRequest',
  ),
);
assert.ok(
  result.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.code'),
);
await writeFile(
  new URL('../workflow.json', import.meta.url),
  JSON.stringify(result.workflow, null, 2),
);
console.log(
  JSON.stringify({
    installedTarballs: 3,
    workspaceSymlinks: false,
    operationCount: catalog.operations.length,
    workflowNodes: result.workflow.nodes.length,
    runtimeCompilation: 'passed',
    modelCalls: 0,
    businessApiCalls: 0,
  }),
);

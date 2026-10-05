# openapi-flow

Composable Node.js libraries for selecting APIs from OpenAPI documents, generating OAS-typed request values with a host-supplied LangChain model, and building importable n8n workflow JSON with the official SDK. No HTTP server, embedded agent loop, API execution, n8n deployment, or mandatory MCP connection.

This branch contains **unreleased 0.2.0 work**. The published `@openapi-flow/core@0.1.0` has a different API. The new `langchain` and `n8n` packages have not been published. To use this source, run `npm ci && npm run build` in the workspace with Node.js 24 or later.

## Package boundaries

| Package                   | Responsibility                                                                | Main functions                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@openapi-flow/core`      | OAS intake, operation provenance, full selected contracts and request schemas | `createApiCatalog`, `listApiOperations`, `resolveApiOperations`, `createApiArgumentsSchema`, `validateApiArguments` |
| `@openapi-flow/langchain` | Independent model calls, typed proposals and missing-input reporting          | `selectApiOperations`, `generateApiArguments`                                                                       |
| `@openapi-flow/n8n`       | Deterministic request-node construction and explicit DAG assembly             | `createHttpRequestNode`, `assembleN8nWorkflow`                                                                      |

Core has no LangChain or n8n dependency. The adapters each depend on core, not on each other. A host can put each function in a LangGraph node, replace a model call, provide values manually, retry one call, or require human approval before compilation/import/execution. Workflow topology is not stored in the OAS and operation selection order does not define execution order.

## Independent stages

The host supplies parsed OAS documents, a LangChain chat model, trusted deployment URLs and existing credential references. It must approve sharing the supplied OAS metadata and scenarios with its model provider.

```ts
import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '@openapi-flow/core';
import {
  selectApiOperations,
  generateApiArguments,
} from '@openapi-flow/langchain';
import { createHttpRequestNode, assembleN8nWorkflow } from '@openapi-flow/n8n';

// serviceA/serviceB are parsed OAS JSON; model is supplied by the host.
const catalog = await createApiCatalog([
  { id: 'service-a', spec: serviceA },
  { id: 'service-b', spec: serviceB },
]);
const selection = await selectApiOperations({
  operations: listApiOperations(catalog),
  scenario,
  model,
});
// A gap is a model proposal, not proof that an API does not exist.
if (selection.gaps.length) throw new Error(JSON.stringify(selection.gaps));
const contracts = await resolveApiOperations(
  catalog,
  selection.operations.map((operation) => operation.key),
);

// The host chooses a specific call and its explicit DAG context.
const operation = contracts[0];
if (!operation) throw new Error('Selection returned no operation');
const args = await generateApiArguments({
  callId: 'request-1',
  operation,
  scenario,
  model,
  bindings: [],
  // Specify requestMediaType when the OAS declares several body media types.
});
if (args.unresolvedInputs.length)
  throw new Error(JSON.stringify(args.unresolvedInputs));
const request = createHttpRequestNode({
  operation,
  arguments: args,
  baseUrl: trustedBaseUrl,
  credentialBindings: existingCredentials,
  position: [300, 0],
});
const result = assembleN8nWorkflow({
  id: 'reviewable-workflow',
  name: 'Reviewable workflow',
  nodes: [request],
  edges: [],
  starts: ['request-1'],
});
// Review/import result.workflow yourself. These functions never execute it.
```

`generateApiArguments` uses an OAS-derived Zod schema such as `{ values: { path: { id: string }, body: { name: string, quantity: number } } }`. The model supplies values, not schema text, missing-input reports, node JSON, method/path definitions, credential material, response assertions or status expectations. Code derives the returned `unresolvedInputs` from the original OAS requirements and supplied values; optional omissions do not need clarification. Original OAS constraints are checked after parsing the model proposal.

Catalog entries need only `{ id, spec }`: no service manifest, `operationId`, `baseUrl`, credential setup or per-path `effectPolicy`. Operation keys include document ID, snapshot hash and canonical OAS pointer; contract lookup rejects stale or changed documents. Full response definitions, inherited/overridden parameters, security alternatives and declared servers remain available independently of n8n conversion.

Request compilation requires a trusted base URL and credential references. It never takes a deployment origin or token from model output. HTTP Bearer credentials reuse existing n8n credential IDs/names; additional authentication mappings remain separate adapter work. `effectPolicy` is retained only in explicit legacy compilers. Hosts own approval for publishing and executing generated workflows.

`assembleN8nWorkflow` accepts explicit nodes, edges, named ports and starting nodes. It validates references, duplicate identities, ports, roots and acyclicity, then uses SDK `.connect` and `.toJSON`. Fan-out is supported; array order is not used as a sequence. SDK structural validation does not prove runtime behavior or data compatibility.

## Implemented checkpoint and remaining work

Implemented: package isolation, independent multi-document selection, full REST contract lookup, OAS-typed per-call values, literal HTTP Request nodes, explicit DAG assembly, and regression preservation. Unit tests cover independent calls; private service OAS fixtures and an isolated n8n instance exercise real parser and import/execution paths.

Not implemented in the new path yet: `planWorkflowGraph`, a typed registry/compiler for native control nodes, runtime output-binding materialization and data-dependency checks, multi-node fragment internal wiring, and gap-preview generation. Output bindings can be represented in core proposals, but the standalone request compiler explicitly refuses them until runtime support exists; it never substitutes a made-up literal. Existing cross-document scalar response bindings remain exercised through `/legacy`.

Webhook/callback extraction stays in core; inbound compilation lives in n8n. Receiving-request authentication/schema checks and callback registration/correlation remain pending. Document acceptance is separate from selected-node conversion: valid OAS is not rejected just because an adapter cannot map a feature.

See the [current Korean code walkthrough](docs/code-walkthrough.ko.md) and [design/implementation status](docs/composable-api-design.ko.md). The [earlier API reference](docs/legacy-api.md) and [earlier walkthrough](docs/legacy-code-walkthrough.ko.md) describe the pre-split implementation, not current main exports. Legacy model functions are under `@openapi-flow/langchain/legacy`; compilers under `@openapi-flow/n8n/legacy`; full host compositions under `examples/legacy-generation/`. `@openapi-flow/core/internal` is an unstable adapter integration boundary.

## Official usage example

See [`examples/langgraph-workflow`](examples/langgraph-workflow/README.md) for a non-published npm workspace demonstrating independent LangGraph stages with an injected model, multiple source documents, OAS-typed request values, trusted deployment/credential references, and reviewable n8n JSON output. It composes one selected API call; it does not invent a multi-call DAG or import/execute workflows automatically. The public fixture contains no internal service metadata.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
OPENAPI_FLOW_REAL_OAS_DIR=/path/to/private/oas npm run test:real-oas
npm run test:local-n8n
```

Do not copy private OAS documents or secrets into this repository. Types/interfaces live in the owning package's `src/types/`; structured-output schemas in `src/schemas/`; prompts in `src/prompts/`. Every package has a descriptive `public-api.ts` entrypoint. `.ts` imports use `.js` extensions for the emitted NodeNext ESM paths.

## Licensing

Our code is MIT-licensed. `@openapi-flow/n8n` depends separately on `@n8n/workflow-sdk` under n8n's [Sustainable Use License](https://docs.n8n.io/n8n-community-license/); our MIT license does not change those terms. Core and the LangChain adapter do not depend on that SDK. See the package-specific third-party notices.

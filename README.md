# openapi-flow

Composable Node.js libraries for selecting APIs from OpenAPI documents, generating OAS-typed request values with a host-supplied LangChain model, and building importable n8n workflow JSON with the official SDK. No HTTP server, embedded agent loop, API execution, n8n deployment, or mandatory MCP connection.

This branch contains **unreleased 0.2.0 work**. The published `@openapi-flow/core@0.1.0` has a different API. The new `langchain` and `n8n` packages have not been published. To use this source, run `npm ci && npm run build` in the workspace with Node.js 24 or later.

## Package boundaries

| Package                   | Responsibility                                                                | Main functions                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@openapi-flow/core`      | OAS intake, operation provenance, full selected contracts and request schemas | `createApiCatalog`, `listApiOperations`, `resolveApiOperations`, `createApiArgumentsSchema`, `validateApiArguments` |
| `@openapi-flow/langchain` | Independent model calls, typed proposals and graph design                     | `selectApiOperations`, `planApiBindings`, `generateApiArguments`, `planWorkflowGraph`                               |
| `@openapi-flow/n8n`       | Deterministic request/native node construction and DAG compilation            | `createHttpRequestNode`, `createN8nNativeCapabilities`, `compilePlannedN8nWorkflow`, `assembleN8nWorkflow`          |

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

Request compilation optionally accepts a host-supplied `baseUrl` and `credentialBindings`. Omitted addresses produce `https://replace_me.invalid`; missing required Bearer references produce `REPLACE_ME:<documentId>:<schemeName>` IDs and descriptive names. Template nodes visibly list pending configuration. No OAS server or model-proposed address is chosen automatically. Supplied invalid values still fail, anonymous operations receive no fake authentication, and missing OAS request values still need clarification. Credential references contain IDs/names, never tokens. Additional authentication mappings remain separate adapter work. `effectPolicy` is retained only in explicit legacy compilers. Hosts own approval for publishing and executing generated workflows.

The official LangGraph factories accept an optional `deployments` array keyed by OAS `documentId`; each entry's `baseUrl` and `credentialBindings` is optional. The CLI's `DEPLOYMENTS_JSON` may also be omitted. For example:

```ts
const graph = createPlannedWorkflowGenerationGraph({
  model,
  capabilities: createN8nNativeCapabilities(),
  deployments: [
    { documentId: 'service-a', baseUrl: 'https://service-a.example.test' },
    { documentId: 'service-b' }, // URL and required credential placeholders.
  ],
});
```

Templates are importable, not ready to execute. Supply the missing deployment settings and regenerate, or replace the placeholders and choose existing credentials after import. Bound request URLs live in the Materialize node's configuration, so editing only its HTTP Request URL does not update the materializer. A JSON-wide URL replacement must cover that configuration as well. Nodes with complete host settings keep the executable output shape without template notes. The `/legacy` compiler contracts remain strict and unchanged.

`assembleN8nWorkflow` accepts explicit nodes, edges, named ports and starting nodes. It validates references, duplicate identities, ports, roots and acyclicity, then uses SDK `.connect` and `.toJSON`. Fan-out is supported; array order is not used as a sequence. SDK structural validation does not prove runtime behavior or data compatibility.

## Implemented checkpoint and remaining work

Implemented: package isolation, independent multi-document selection, full REST contract lookup, OAS-typed per-call values, literal/runtime-bound HTTP Request nodes, explicit DAG assembly and multi-node fragment wiring. Unit tests cover independent calls; private service OAS fixtures and an isolated n8n instance exercise real parser and import/execution paths.

`planWorkflowGraph` designs native nodes, typed conditions/assertions, ports and DAG edges from the scenario and selected OAS API materials. Its model schema contains only `nativeNodes`, `edges` and `gaps`; core's `createWorkflowGraphPlan` derives `starts` from nodes without incoming edges and validates the executable plan. It does not infer or repair edges. Gap reports have empty starts and cannot be compiled. `createN8nNativeCapabilities` supplies IF, Merge Append, response-assertion Code and StopAndError definitions; hosts can register additional typed schemas and deterministic compilers. `validateWorkflowGraphPlan` rejects missing IDs/ports, cycles, unavailable response references and structurally incompatible join branches. `compilePlannedN8nWorkflow` revalidates the plan and emits SDK-validated JSON. Model output contains neither arbitrary JavaScript nor deployment URLs/credentials.

On a returned proposal's schema or graph validation failure, `planWorkflowGraph` throws `WorkflowGraphPlanningError`: `failure.stage` identifies the boundary and `failure.output` retains the rejected output for host-owned diagnostics or human review. Output at `proposal-schema` remains `unknown` because it has not passed the schema; at `graph-validation` it is a typed `WorkflowGraphProposal`, not an approved executable plan. No retry or output correction is built in. Transport errors and provider-internal parsing failures still propagate directly; those do not have a returned proposal to retain. Do not put private diagnostics in a public repository. Hosts supplying `WorkflowGraphPlan` directly still provide explicit `starts`, checked against the topology.

`planApiBindings` independently chooses response-body JSON Pointers and target request Pointers from the selected OAS contracts. `validateApiBindingPlan` checks call identities, declared/allowed fields, known incompatible types, overlap and cycles. Bound fields are excluded from literal model proposals. `createHttpRequestNode` generates a library-owned materialization Code node followed by HTTP Request when bindings are present; provide `apiNodeNames` mapping call IDs to actual API exit-node names. It reads actual response values, checks the complete resulting request with an OAS-derived standalone Ajv validator, and reuses the literal request serializers. Missing fields, wrong types and ambiguous multiple source envelopes fail before sending HTTP, without value substitution. Object containers come from OAS schemas, not numeric-key guesses.

The graph validator requires producers to be complete on every route to consumers. Independent calls may fan out; consumers needing several branch results require a compatible explicit join. Scenario-required order/conditions remain constraints. Independent DAG branches do not guarantee simultaneous execution: [n8n's execution-order documentation](https://docs.n8n.io/build/flow-logic/understand-execution-order/) describes sequential branch processing for v1 execution order.

`planReviewableWorkflowGraph` designs an internal DAG from ready/blocked API materials and identified gaps. Core validates identities, ports, cycles, joins and available responses even when gaps exist. `compileReviewableN8nWorkflow` returns the common `workflow` JSON: complete plans connect Start normally; gap plans preserve implementable HTTP/native nodes and internal connections, replace unresolved steps with failing Code placeholders, add explanatory Sticky Notes, omit every Start-to-root edge and set `active: false`. Its review result is `{ status: 'needs-review', workflow, diagnostics }`. Invalid OAS, malformed plans and missing required literals remain errors. Disconnected Start is a generation policy, not a security boundary: edited/partial executions still require host approval. See the [official example](examples/langgraph-workflow/README.md#결손-검토용-json).

Remaining: exhaustive OAS response-pointer/type proof, native-node output to API bindings, value transformations/item-wise loops and all native n8n variants. Static checks do not prove natural-language coverage or every complex schema implication; review and execution tests remain necessary. Existing legacy scalar bindings remain covered under `/legacy`.

Webhook/callback extraction stays in core; inbound compilation lives in n8n. Receiving-request authentication/schema checks and callback registration/correlation remain pending. Document acceptance is separate from selected-node conversion: valid OAS is not rejected just because an adapter cannot map a feature.

See the [current Korean code walkthrough](docs/code-walkthrough.ko.md) and [design/implementation status](docs/composable-api-design.ko.md). The [earlier API reference](docs/legacy-api.md) and [earlier walkthrough](docs/legacy-code-walkthrough.ko.md) describe the pre-split implementation, not current main exports. Legacy model functions are under `@openapi-flow/langchain/legacy`; compilers under `@openapi-flow/n8n/legacy`; full host compositions under `examples/legacy-generation/`. `@openapi-flow/core/internal` is an unstable adapter integration boundary.

## Official usage example

See [`examples/langgraph-workflow`](examples/langgraph-workflow/README.md) for a non-published npm workspace demonstrating independent LangGraph stages with an injected model, multiple source documents, OAS-typed request values, trusted deployment/credential references, and reviewable n8n JSON output. The CLI composes one selected API call. `createPlannedWorkflowGenerationGraph` adds model-designed native nodes, conditions and topology with no host composition callback and fails on gaps. `createReviewableWorkflowGenerationGraph` continues explicitly reported gaps into the common `workflow` output with a detached Start; complete plans use the same strict compiler. `createDagWorkflowGenerationGraph` remains available for explicit host-owned topology. These factories never import or execute workflows automatically. The public fixtures contain no internal service metadata.

## Development

```sh
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
OPENAPI_FLOW_REAL_OAS_DIR=/path/to/private/oas npm run test:real-oas
npm run test:local-n8n
npm run test:request-bindings-local-n8n
npm run test:deployment-template-local-n8n
npm run test:workflow-review-local-n8n
```

Do not copy private OAS documents or secrets into this repository. Types/interfaces live in the owning package's `src/types/`; structured-output schemas in `src/schemas/`; prompts in `src/prompts/`. Every package has a descriptive `public-api.ts` entrypoint. `.ts` imports use `.js` extensions for the emitted NodeNext ESM paths.

## Licensing

Our code is MIT-licensed. `@openapi-flow/n8n` depends separately on `@n8n/workflow-sdk` under n8n's [Sustainable Use License](https://docs.n8n.io/n8n-community-license/); our MIT license does not change those terms. Core and the LangChain adapter do not depend on that SDK. See the package-specific third-party notices.

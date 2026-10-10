# openapi-flow

Composable Node.js libraries for selecting APIs from OpenAPI documents, generating OAS-typed request values with a host-supplied LangChain model, and building importable n8n workflow JSON with the official SDK. No HTTP server, embedded agent loop, API execution, n8n deployment, or mandatory MCP connection.

This branch contains **unreleased 0.2.0 work**. The published `@openapi-flow/core@0.1.0` has a different API. The new `langchain` and `n8n` packages have not been published. To use this source, run `npm ci && npm run build` in the workspace with Node.js 24 or later.

## Current development scope

Focus on workflows started by **Manual Trigger** that call OAS-defined outgoing REST APIs. This includes multi-API selection, OAS-typed request values, response bindings, and conditions/joins using explicitly supplied native capabilities. Item-wise iteration remains unfinished work within this scope.

Further webhook/callback implementation is deferred, including inbound authentication/schema checks and callback registration/correlation. Existing inbound extraction and legacy compilation are retained, not removed or expanded. This development priority does not restrict acceptance of standards-valid OAS documents.

## TODO and roadmap

The agreed order is **item-wise execution → contract/response validation → multi-API quality evaluation → release preparation**. Request-format and authentication extensions are deferred; they are not prerequisites for this iteration.

- [ ] **1. Item-wise execution (current):** explicitly split an OAS response array into items; preserve item linking through dependent API calls; validate empty, multiple, reordered and invalid items without selecting the first item or coercing values. Batch loops and per-item joins need explicit execution contracts.
  - [x] Initial array-to-items capability, linked HTTP requests, item-aware IF/assertions and isolated n8n regression coverage.
  - [x] Explicit collection of one item stream's unchanged API response values with official Aggregate, including a following OAS array-body request.
  - [x] Item-scoped API fan-out join by shared native item ancestry, with per-port dependencies and missing/duplicate response rejection.
  - [x] Nested API response array splitting in explicit linked mode, preserving parent/child/intermediate response ancestry through five APIs.
  - [x] Explicit native JSON output array splitting, including two linked split levels, parent ancestry and five distinct REST APIs.
  - [x] Explicit finite Loop Over Items scopes for item-preserving linear paths, linked references across batches and completion-time response collection.
  - [x] Complete API fan-out inside a finite batch, with explicit shared-ancestor joins, reordered branches and one completion-time collection.
  - [x] Complete conditional batch paths with explicit IF alternatives and an opt-in exclusive rejoin; skipped business calls retain their original item on the return path.
  - [ ] Item-dropping Filter batch completion, nested batch scopes, automatic batch-scope planning, cross-invocation joins and collection across separately executed streams.
- [ ] **2. Additional request formats (later):** multipart upload, text and binary mappings and actual execution tests. Keep standards-valid document intake independent of node mapping.
- [ ] **3. Additional authentication (later):** AND combinations, cookie API key, OpenID Connect and mTLS. Preserve the existing implemented credential mappings.
- [ ] **4. Contract/response validation (current):** validate actual source response bodies against the OAS response selected by runtime status and media type; strengthen complex-schema/pointer tests; investigate the recorded n8n top-level JSON-string response issue without narrowing OAS acceptance or rewriting data.
  - [x] OAS-derived runtime response validation, exact/range/default response precedence, media-type specificity and complex-schema regression tests.
  - [x] Reproduction of the n8n JSON-string response issue and structural JSON equality in standalone const/enum validation.
  - [x] Conjunctive pointer/item projections, property-pattern interactions and OAS 3.0 syntax normalization, with differential and isolated n8n coverage.
  - [x] Full original OAS response validation before native IF/assertion comparisons, including unexamined fields, runtime status and media type.
  - [ ] Exhaustive pointer/schema implication coverage and resolution of the upstream n8n JSON-string response and task-runner error-display issues.
  - [x] Preserve native schema roots during source validation and original resources in item/pointer projections, with local/recursive `$ref`, anchors and nested `$id` regressions.
- [ ] **5. Multi-API/DAG quality evaluation (after 1 and 4):** evaluate the current public pipeline rather than legacy single-operation selection; measure operation choices, typed values, bindings, branches, iteration and gap reports across repeated runs. Keep contract-server execution distinct from real business API validation.
- [ ] **6. Release preparation (after evaluation):** synchronize current usage docs, test installed package tarballs in an independent consumer and publish the split 0.2.0 packages only after release approval.
  - [ ] Resolve dependency audit findings in the current Scalar/undici and n8n SDK/axios chains with verified compatible upstream versions; do not force-downgrade or add unchecked overrides.

Webhook/callback work remains deferred. Supporting every n8n native node and automatically changing data semantics/types are not roadmap requirements; add only explicitly required native capabilities.

For stage 5, freeze reviewed Honeypot/ICL OAS snapshots and scenario answers before measuring the model. Cover independent APIs, a five-API dependent DAG, native conditions/joins/assertions, array iteration and unavailable capabilities. Keep an unseen scenario group separate from prompt-development cases. Repeat the same model configuration and record first-proposal validity, API precision/recall, required input completion, binding/condition correctness, gap accuracy, execution outcomes, latency and token usage. Report numerator/denominator and rejected plans; do not hide failures with retries or fixture-specific corrections.

Quality evaluation must call the current independent public planning functions with a real model, then compile and execute accepted plans against an isolated OAS contract server. Deterministic regression tests establish implementation behavior, not model quality. A contract-server pass does not prove real-service business behavior. Agree on release thresholds after measuring the baseline, rather than declaring completion from a single successful workflow.

## Item-wise execution and source response contracts

Register `createResponseArrayCapability({ materials })` after resolving selected OAS API contracts. A native planner chooses only the source call ID and RFC 6901 array pointer. Code derives the `{ item: element }` output contract, validates the original response, and builds a Code reader plus the official Split Out node. Values are wrapped, not converted or flattened; an empty array emits no items.

For nested API arrays, register `createResponseArrayCapability({ materials, itemMode: 'linked' })`. This host-owned mode reads each input item's linked API response, validates the full response and emits an array wrapper paired with that input. Official Split Out links each child to its own wrapper; subsequent linked HTTP calls can bind the original parent, child and intermediate API response. A parent's empty array emits no children without shifting other parents' ancestry. The same linked registry also supports the initial single response. Without this mode, the original reader still requires exactly one input and one unambiguous source response. Nested splitting and explicit batch execution are separate features; neither automatically plans iteration scopes or accumulates separately executed streams.

Run `npm run test:nested-array-iteration-local-n8n` for the five-API nested regression. Import JSON, an IF-filtered variant and their eight-case report are written to `.local-artifacts/nested-array-iteration/`. The workflow uses a temporary local contract server: configure a running endpoint before importing it for execution. Its deterministic plan tests runtime contracts, not real-model planning quality or business-service semantics. The adapter preserves explicit [Code item links](https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/preserving-linking-in-the-code-node/); the tested [n8n 2.37.10 Split Out implementation](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/nodes-base/nodes/Transform/SplitOut/SplitOut.node.ts) assigns each child its source input's `pairedItem`.

Use `createHttpRequestNode({ ..., itemMode: 'linked', apiResponseContracts })` for calls in that item scope. The runtime uses n8n `itemMatching(inputIndex)` to read each source through ancestry, then returns a `pairedItem` pointing to its own input. It does not zip source arrays, match IDs or choose a first result. API sources in linked mode require `apiResponseContracts[callId]`. Supplied response-contract maps must contain every API source; compilation checks original contracts against materials. In single-item mode, providing this map enables source validation; omission retains the earlier request-only validation path, not a claimed response-contract proof. Official multi-API examples now supply the map.

`createN8nNativeCapabilities({ itemMode: 'linked' })` builds item-aware IF conditions and response assertions for that scope. The ordinary registry now rejects ambiguous multi-item response reads instead of taking the first result. Merge Append is still a branch join, not a per-item join or collection primitive. Do not treat it as an item-wise zip. The official host examples accept explicit `linkedItemCallIds`; they do not infer execution scopes from matching field names or model-created JSON.

Native IF and response assertions validate every referenced API's full original response before comparing selected fields. The public workflow compiler derives `apiResponseContracts` from its actual materials; callers do not manually duplicate the OAS contracts. Direct capability `compile` calls must supply the original contract and actual producer name for each API operand. Literal-only checks require neither an API contract nor an extra guard. Missing context fails at compilation; declared binding contracts are checked against the assembled producers.

IF compiles to a library-owned Code validation guard followed by the official IF node. The guard forwards original input JSON/binary values unchanged and preserves their ancestry through explicit input links; it creates no completion items. IF expressions remain small comparisons rather than carrying bundled validators inside n8n's expression delimiters. Assertions reuse the same complete-response reader before comparing. An invalid sibling field fails even when the selected field matches an assertion or the IF condition would be false. Status/media selection is OAS validation, not a model-planned expected-status check.

The array-iteration runner includes five negative cases for IF/assertion body, media and status validation, for 14 runtime cases in total. It asserts the original exception and failed node, and verifies that forbidden downstream requests never occur. On n8n 2.37.10, the [task-runner error parser](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/%40n8n/task-runner/src/js-task-runner/errors/execution-error.ts) splits messages at every colon and retains the last segment. JSON validator diagnostics therefore appear truncated in the display message, while the original exception remains in the execution stack. The local report retains both fields explicitly. This separate display defect is unresolved; no diagnostic rewriting, exception swallowing or error-recovery behavior was added.

`createApiResponseSchema({ operation })` derives a validator for observed response metadata/body. Exact status definitions override ranges, ranges override `default`, and specific media types override wildcards, following the [OAS Responses and Response definitions](https://spec.openapis.org/oas/v3.2.1.html#responses-object). `apiResponseValidationValue` projects status and normalized Content-Type for validation without altering body values. This is not an LLM-planned expected-status assertion. Runtime validation rejects a violated OAS source contract before a dependent HTTP request is sent.

Pointer candidates retain `allOf` intersections, sibling constraints and every matching `properties`/`patternProperties` assertion. `additionalProperties` applies only to unmatched names. Declared container kinds flow across composition at the same location; numeric object keys remain distinct from array positions. Parent `oneOf` alternatives become child candidates using `anyOf`: child values can overlap even when their parent discriminators do not. OAS 3.0 nullable/exclusive-bound syntax is normalized before deriving native response-value/item contracts, without modifying the original operation or data. Request materialization uses the same composition-aware container analysis and requires an explicit literal container when object versus array remains ambiguous.

These are necessary value candidates, not complete schema implication proofs or existence guarantees. Tuple positions, sibling discriminators, conditional/unevaluated rules, cardinality and the observed status/media contract remain the original full response validator's responsibility. Optional missing pointers still fail at runtime; candidate extraction never supplies a value. `npm run test:schema-projection-local-n8n` verifies composite array items and OAS 3.0 nullable collection through actual HTTP requests, with local import examples and a report under `.local-artifacts/schema-projection/`. This is deterministic contract execution, not a model quality evaluation.

Run `npm run test:array-iteration-local-n8n` for public contract cases; import examples are written to `.local-artifacts/array-iteration/workflow.json` and `conditional-workflow.json`. The private real-OAS runner accepts an explicit configuration via `OPENAPI_FLOW_ITERATION_CONFIG` and writes only local artifacts. These are deterministic execution regressions, not LLM quality scores or business-service tests. See the [official usage example](examples/langgraph-workflow/README.md#item별-rest-api-호출).

`createResponseCollectionCapability({ materials })` registers `collect-api-responses`. The planner selects only a supplied API call ID and a response-body pointer. Code validates each item-linked full response and selected value, then builds the official [Aggregate node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/) with list merging disabled and null retention enabled. Output `{ items: values }` preserves duplicates, nesting, types and received item order; it does not promise network completion order. Bind `/items` to a subsequent OAS array input in ordinary single-item mode. An empty stream does not run the collection or downstream API and does not fabricate `{ items: [] }`. Collection is per node invocation, not a cross-branch join or standalone accumulator. After an explicit batch scope it receives the Loop Over Items completion stream, resolves each item's original response across node runs and collects once. The compiled collector's original source contract is checked against workflow materials.

## Native output arrays

Register `createNativeArrayCapability({ sources, itemMode: 'linked' })` with actual `N8nNativeOutputSource` contracts derived by `createN8nNativeOutputSources`. The model selects only `sourceNodeId` and an RFC 6901 `pointer`; code derives the item schema and builds official Split Out nodes. Native pointers address the native JSON root, while API pointers address the HTTP response body. Both capabilities share array projection, reader and SDK fragment mechanics without treating native schemas as OAS response contracts.

The reader validates the complete original source before extracting the array. Each element remains `{ item: originalElement }` without flattening, conversion or fabricated values. Linked mode preserves each parent's ancestry through nested splits; empty arrays emit no children. Ordinary mode requires one input and one unambiguous source item. Unknown sources, missing pointers, non-array values, invalid original output and mismatched compiled source names/contracts fail explicitly.

For nested native arrays, the host first derives the parent split's output contract, then registers the next planning stage with both original and derived sources. Replace that stage's capability registry entry rather than registering duplicate names. Automatic recursive registry/scope planning is not implemented. See the [official host example](examples/langgraph-workflow/README.md#native-출력-배열의-반복).

`npm run test:native-array-iteration-local-n8n` runs twenty deterministic cases on n8n 2.37.10: the same ten cases with inline contracts and with recursive `$defs`/`$ref` producer contracts. Two Split Out levels feed five distinct REST APIs, fan-out, ancestry-based join, collection and one final array-body call. Each normal case makes 13 requests; an empty middle group and identical values retain their own ancestry. Invalid native fields/items and API contract/media failures stop forbidden later calls. Import JSONs/report: `.local-artifacts/native-array-iteration/five-api-workflow.json`, `five-api-references-workflow.json` and `report.json`. Configure a running endpoint before execution. This does not measure Chomsky planning quality or call business services.

Native producers are now validated independently at their original schema roots. Item and binding-pointer projections retain the original resource in a standard compound schema and reference its original locations rather than copying fragments into a new reference scope. Core uses Ajv's public `addSchema`/`getSchema` registry and fast-uri for URI resolution. Its initial retrieval URI is `https://openapi-flow.invalid/schema/<sha256>` using the JSON document's digest; an explicit `$id` resolves against this base. This URI is an offline identifier, not a fetch endpoint. No source values are invented, schemas are not fetched remotely, and original contracts/values are not mutated. `$ref` sibling assertions remain conjunctive. Missing references fail explicitly; non-progressing projection cycles are not replaced by unconstrained schemas. See [JSON Schema initial base URIs](https://json-schema.org/draft/2020-12/json-schema-core#section-9.1.1).

`npm run test:native-schema-references` now checks both the previously failing original source compiler and the independently reusable projected item contract. It is a passing regression after this fix. Unit cases cover recursive references, aliases, anchors, nested relative IDs, special-character pointers, same-named definitions in distinct native roots, JSON round trips and schema-like const data. General schema implication, dynamic-scope projection coverage and externally supplied resource registries remain separate work; this does not claim support for every JSON Schema contract. See [JSON Schema compound documents](https://json-schema.org/draft/2020-12/json-schema-core#section-9.3) and [Ajv reference resolution](https://ajv.js.org/guide/combining-schemas.html#combining-schemas-with-ref).

## Explicit batch execution

`compileBatchedN8nWorkflow` accepts the same complete DAG/materials/capabilities/API fragments as `compilePlannedN8nWorkflow`, plus required host-supplied `batchScopes`. Each scope names existing logical node instances, its entry/exit and a positive integer batch size. The original plan remains acyclic and unchanged. The adapter validates the path, then uses official SDK nodes/connections to insert [Loop Over Items](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/): `loop` enters the path, its exit returns to the controller, and `done` connects to the original downstream nodes. Reset is explicitly disabled, so processing the finite input stream terminates.

Scopes must not overlap and must have one entry and one exit. A linear step declares `preservesInputItems: true`: one linked output per input or an execution error. Linked HTTP materializers and linked assertions declare this contract. Such steps may fan out to complete branches; `join-api-items` declares `joinsInputItemsByAncestry: { scopeNodeId }` instead of claiming that its multi-input stream is one-to-one. Code checks that every join port has exactly one branch and every branch retains the shared scope ancestor that identifies each entry item. Item-preserving upstream relays retain that identity. Custom host compilers must honor their declarations; the validator does not prove arbitrary JavaScript semantics.

Register the opt-in `createPassThroughCapability()` if the plan needs a common entry before fan-out. It compiles the official [No Operation node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop/) with `parameters: {}` and forwards input unchanged; it creates neither a missing API substitute nor a completion item. It is not automatically added to the native registry and does not invent an output schema. Existing item-preserving steps can also be the scope entry.

IF with a discarded alternative, item-dropping Filter, Split Out, Aggregate and ordinary Merge Append are not complete batch return contracts. If a batch becomes empty, they may never execute the return edge and remaining batches would stop. This check does not restrict OAS intake. Put Split Out before the scope and collection after completion. Item-dropping Filter completion, nested scopes, cross-invocation joins and model-planned scopes remain TODO. A batch join groups responses within each batch invocation, not across separate scope executions.

Register `createExclusiveBranchMergeCapability()` explicitly to use `rejoin-exclusive-branches` with `{ sourceNodeId: 'eligible' }`, where `eligible` is an existing IF instance. Connect its true/false paths to different `input1`/`input2` ports. Code checks that both alternatives are covered without duplicate/unmatched routes. In a batch, every intermediate branch step must have a one-to-one linked item contract and both paths must rejoin inside the same scope. An explicit No Operation skip path forwards the actual original item; it does not invent a completion item. Normal `merge-append` retains its independent-branch contract. Responses produced only on the true path remain unavailable on the false path or unconditionally after rejoin.

This capability uses the official Merge 3.2 append node with `executionOrder: 'v1'`. In the pinned n8n 2.37.10 engine, a waiting Merge can execute once runnable work is exhausted even when one alternative produced no data; it retains the available input items. See [Merge documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/) and [the pinned execution engine](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/core/src/execution-engine/workflow-execute.ts). `integration/conditional-batch-runtime-probe.mjs` checks that behavior independently of OSS compilation.

`npm run test:conditional-batch-local-n8n` verifies 14 cases: batch sizes 1/2/10 with all/mixed/no eligible items, empty input, invalid source/response, wrong media type and an assertion failure. Five distinct API nodes are available, but confirm/audit are called only for eligible items. All original detail items are collected once after completion; skipped items are not represented as successful confirm/audit responses. Import JSONs/report: `.local-artifacts/conditional-batch/`. The mixed size-1 workflow is `workflow-conditional-batch-1-3.json`. Configure its temporary endpoint before execution. This is deterministic contract-server verification, not Chomsky planning quality.

`npm run test:batch-iteration-local-n8n` checks five API instances, sizes 1/2/10, adjacent scopes, a start scope, original-item/response ancestry, one completion-time collection, empty input and contract/assertion failures on n8n 2.37.10. Its ten-case report and import JSONs are under `.local-artifacts/batch-iteration/`. They use a temporary local endpoint; configure the server and address before execution. This deterministic regression is not a Chomsky quality evaluation. The private real-OAS runner also accepts an explicit `OPENAPI_FLOW_ITERATION_BATCH_SIZE` and writes to `.local-artifacts/real-array-iteration/batch-<size>/`; it never calls the business service.

`npm run test:batch-item-join-local-n8n` checks eight further cases: two/three complete branches, sizes 1/2/10, a reversed branch, duplicate IDs/values, empty input, invalid source/branch responses and wrong media type. The five-API case issues 13 requests for three original items, joins each batch and collects once after completion. Import JSONs and the report are under `.local-artifacts/batch-item-join/`; they also require a running local contract endpoint, not a real service or model. See the [host composition example](examples/langgraph-workflow/README.md#배치-안의-api-분기와-합류).

`createItemJoinCapability({ materials, scopes })` registers `join-api-items`. Supply actual compiled native scope outputs from `createN8nNativeOutputSources`; do not invent names or schemas. The planner selects a supplied `scopeNodeId` and unique `sourceCallIds` in input-port order. Code verifies the API and shared native scope dependencies separately on each incoming port, then builds per-branch Code readers → official Merge Append → library-owned item grouping. Readers validate the original OAS response and native scope schema, and use `itemMatching` reference identity to attest each response's shared ancestor. Runtime scope indexes identify those ancestor objects, not positions in independent response arrays or business IDs. Duplicate IDs and identical values remain separate items.

Every participating ancestor must have exactly one response from every selected API; missing, duplicate, ambiguous or invalid responses fail before the next request. When all branches explicitly exclude the same ancestor, it produces no output; empty scopes also fabricate nothing. Output `{ responses: { callId: unchangedBody } }` follows original scope order and retains every contributing input in `pairedItem`, so linked downstream requests can bind both the joined native output and original API/scope values. This is per invocation, not an accumulator or a cross-run join. Private implementation readers use explicit fragment `inputEndpoints`; existing single-entry fragments are unchanged.

Run `npm run test:item-join-local-n8n` for reordered two/three-branch joins, identical values, aligned filters, empty streams and failed contracts. Import examples live in `.local-artifacts/item-join/workflow.json` and `five-api-workflow.json`. The latter uses five API instances: a list, three independent branch calls and a dependent follow-up. These plans are deterministic regression fixtures, not real-model quality results.

Standalone validators compare JSON structure without JavaScript constructor/prototype identity. The bundle explicitly supplies a JSON-value equality helper to Ajv's equality runtime; standard keywords, schemas and data are unchanged. The private `.cts` helper emits the CommonJS plain `default` property required by Ajv instead of an ESM getter export, which the verified n8n Code environment excludes. Public packages remain ESM. This prevents valid object/array const/enum values from failing solely because n8n isolates data objects. Changed values, types, extra keys, array order and duplicate constraints still fail.

`npm run test:json-response-local-n8n` checks actual JSON values through HTTP Request and the OAS validator, writing `.local-artifacts/json-response/report.json`. On verified n8n 2.37.10 it exits nonzero for the unresolved top-level string defect: ordinary strings fail in HTTP Request; strings such as `"42"`, `"{\"id\":42}"` and `""` are parsed again into different values. The source contract validator rejects those changed results. Do not call this a green regression test, narrow OAS acceptance, switch response formats, or silently repair the data. Resolving the n8n implementation is a separate upstream task.

## Package boundaries

| Package                   | Responsibility                                                                | Main functions                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@openapi-flow/core`      | OAS intake, operation provenance, full selected contracts and request schemas | `createApiCatalog`, `listApiOperations`, `resolveApiOperations`, `createApiArgumentsSchema`, `validateApiArguments` |
| `@openapi-flow/langchain` | Independent model calls, typed proposals and graph design                     | `selectApiOperations`, `planApiBindings`, `generateApiArguments`, `planWorkflowGraph`                               |
| `@openapi-flow/n8n`       | Deterministic request/native node construction and DAG compilation            | `createHttpRequestNode`, `createN8nNativeCapabilities`, `compilePlannedN8nWorkflow`, `assembleN8nWorkflow`          |

Core has no LangChain or n8n dependency. The adapters each depend on core, not on each other. A host can put each function in a LangGraph node, replace a model call, provide values manually, retry one call, or require human approval before compilation/import/execution. Workflow topology is not stored in the OAS and operation selection order does not define execution order.

## Optional-material orchestration

`orchestrateWorkflow({ workflowId, scenario, model, materials?, capabilities?, preparedNativeNodes?, gaps?, edges? })` plans native instances and then connections from only the supplied material groups. Omission means an empty group, not a default registry or inferred API. `materials` contains selected OAS contracts and immutable ready/blocked request arguments. API-only and native-only plans are supported. Prepared nodes and fixed edges are preserved; unknown IDs/ports, repeated edges, invalid required values, cycles and unavailable producers are errors, not repaired proposals. A prepared native node still needs its registered implementation in `capabilities`; optional groups do not weaken required contracts.

For independent stages, use `planNativeNodes` and `planWorkflowConnections`. The native model returns only new instance identities, supplied capability choices, schema-typed parameters and unmet requirement descriptions. Code derives ports, native outputs and gap IDs. The connection model returns only new edges and unmet requirements/blocked calls; it cannot regenerate API values, native parameters, ports, schemas, starts or SDK JSON. Supplied edges are not echoed. Core derives roots and checks dependency availability on every incoming route. No native capabilities means no native-selection model call. Fully bound APIs still skip literal argument generation.

When **new native output feeds an API input**, plan that producer **before** `planApiBindings` and `generateApiArguments`: call `planNativeNodes` with selected `apiMaterials` (contracts plus call IDs, no request arguments), derive `createNativeOutputContracts`, plan bindings, generate remaining literals, then call `planWorkflowConnections` with the resulting immutable API/native materials. Final orchestration does not retroactively change API arguments. The official [`createOrchestratedWorkflowGenerationGraph`](examples/langgraph-workflow/README.md#분리된-계획과-optional-재료) composes these stages. Existing graph factories remain available for their prepared-material paths. The host still owns LangGraph state, HITL, retries, compilation, import and execution.

```ts
const plan = await orchestrateWorkflow({
  workflowId: 'api-only',
  scenario,
  model,
  materials: [{ status: 'ready', operation, arguments: args }],
  // No capabilities: do not choose or invent native nodes.
});
// Compile with compileReviewableN8nWorkflow using the same immutable materials.
```

Returned gaps are proposals for review, not proof of a missing service feature. Compile them through the existing review compiler to preserve internal connections, show warning regions and detach Start. All material groups may be omitted: the connection model can report explicitly requested unmet requirements without inventing an API or native capability. A proposed executable graph with neither nodes nor gaps still fails the existing root check. No data coercion, automatic value replacement, implicit capabilities or built-in retry is added.

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
  selectApiRequestMediaType,
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
const requestMediaType = await selectApiRequestMediaType({ operation, scenario, model });
const args = await generateApiArguments({
  callId: 'request-1',
  operation,
  requestMediaType,
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

`listApiRequestMediaTypes` exposes the selected OAS body's declared formats. `selectApiRequestMediaType` returns no format for an operation without a body and chooses the sole declared format without a model call. For several formats it uses a described enum of the OAS content keys. An explicit model choice is preserved; an unspecified or ambiguous format returns `null` and code calls `selectDefaultApiRequestMediaType`. Its deterministic preference is `application/json`, then `application/x-www-form-urlencoded`, then other concrete OAS keys in code-point order, then wildcard keys in code-point order. It never inserts an undeclared format, changes request values or hides invalid model output. The policy does not add transport support for other formats: an unmapped selected format still fails during n8n compilation. All official graph factories include a separate `request-media` stage after contract resolution and carry its choice into binding validation, argument generation and node compilation. Hosts composing their own graph can call the same selector or supply a validated explicit `requestMediaType`.

Discovery selection proposes only missing API capabilities. It does not decide detailed contract insufficiency from summaries: full selected request/response contracts are inspected by the binding and graph planners. Its model gap output is only `{ description }`; code sets `kind: 'missing_operation'`. The public gap contract still accepts host-established `insufficient_contract` diagnostics.

Request compilation optionally accepts a host-supplied `baseUrl` and `credentialBindings`. Omitted addresses produce `https://replace_me.invalid`; missing required credential references produce `REPLACE_ME:<documentId>:<schemeName>` IDs and descriptive names. Template nodes visibly list pending configuration. No OAS server or model-proposed address is chosen automatically. Supplied invalid values still fail, anonymous operations receive no fake authentication, and missing OAS request values still need clarification. Credential references contain IDs/names, never tokens. `effectPolicy` is retained only in explicit legacy compilers. Hosts own approval for publishing and executing generated workflows.

`resolveOpenApiSecurity` preserves OAS security alternatives, combined requirements and scopes without engine-specific credential types. `resolveHttpRequestAuthentication` maps a selected single scheme to an existing n8n credential: HTTP Bearer/Basic/Digest, header/query API key, or OAuth2. If OAS declares several OR alternatives, supply the zero-based `securityRequirementIndex`; code never silently chooses the first alternative or drops authentication. An empty requirement explicitly selects anonymous access. AND combinations, cookie API keys, OpenID Connect and mutual TLS still fail during selected-node conversion, not OAS intake. Stored credential secrets, API key names and OAuth2 grants/scopes remain host/n8n configuration. Node notes state the OAS requirements; the compiler does not read or verify the credential store. These generic credential types follow the [n8n HTTP Request credential documentation](https://docs.n8n.io/integrations/builtin/credentials/httprequest).

`npm run test:http-authentication-local-n8n` executes all six mappings in isolated n8n 2.37.10, both with literal arguments and with a value bound from an actual preceding API response. Its synthetic responder checks transmitted authentication, Digest challenge handling and an OAuth2 client-credentials token grant. It does not verify other OAuth2 grants, real-service permissions or remote credentials. Temporary credential secrets are excluded from workflow JSON and removed with the disposable n8n volume.

The official LangGraph factories accept an optional `deployments` array keyed by OAS `documentId`; each entry's `baseUrl`, `credentialBindings` and `securityRequirementIndex` is optional. A supplied index applies to every selected operation of that document; hosts needing different choices per operation can call `createHttpRequestNode` independently. The CLI's `DEPLOYMENTS_JSON` may also be omitted. For example:

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

`planWorkflowGraph` designs native nodes, typed conditions/assertions, ports and DAG edges from the scenario and selected OAS API materials. Its model schema contains only `additionalNativeNodes`, `edges` and `gaps`; existing prepared nodes are fixed input materials with explicit implementation-owned ports. Code assembles prepared and additional nodes into the public plan's `nativeNodes`; it rejects repeated prepared IDs rather than deduplicating model output. Core's `createWorkflowGraphPlan` derives `starts` from nodes without incoming edges and validates the executable plan. It does not infer or repair edges. Gap reports have empty starts and cannot be compiled. `createN8nNativeCapabilities` supplies IF, Merge Append, response-assertion Code and StopAndError definitions; hosts can register additional typed schemas and deterministic compilers. `validateWorkflowGraphPlan` rejects missing IDs/ports, cycles, unavailable response references and structurally incompatible join branches. `compilePlannedN8nWorkflow` revalidates the plan and emits SDK-validated JSON. Model output contains neither arbitrary JavaScript nor deployment URLs/credentials.

On a returned proposal's schema or graph validation failure, `planWorkflowGraph` throws `WorkflowGraphPlanningError`: `failure.stage` identifies the boundary and `failure.output` retains the rejected output for host-owned diagnostics or human review. Output at `proposal-schema` remains `unknown` because it has not passed the schema; at `graph-validation` it is a typed `WorkflowGraphOutput` with model-owned `additionalNativeNodes`, not an approved executable plan. No retry or output correction is built in. Transport errors and provider-internal parsing failures still propagate directly; those do not have a returned proposal to retain. Do not put private diagnostics in a public repository. Hosts supplying `WorkflowGraphPlan` directly still provide explicit `starts`, checked against the topology.

`planApiBindings` independently chooses response-body JSON Pointers and target request Pointers from the selected OAS contracts. `validateApiBindingPlan` checks call identities, declared/allowed fields, known incompatible types, overlap and cycles. Bound fields are excluded from literal model proposals. `createHttpRequestNode` generates a library-owned materialization Code node followed by HTTP Request when bindings are present; provide `apiNodeNames` mapping call IDs to actual API exit-node names. It reads actual response values, checks the complete resulting request with an OAS-derived standalone Ajv validator, and reuses the literal request serializers. Missing fields, wrong types and ambiguous multiple source envelopes fail before sending HTTP, without value substitution. Object containers come from OAS schemas, not numeric-key guesses.

The graph validator requires producers to be complete on every route to consumers. Independent calls may fan out; consumers needing several branch results require a compatible explicit join. Scenario-required order/conditions remain constraints. Independent DAG branches do not guarantee simultaneous execution: [n8n's execution-order documentation](https://docs.n8n.io/build/flow-logic/understand-execution-order/) describes sequential branch processing for v1 execution order.

`planReviewableWorkflowGraph` designs an internal DAG from ready/blocked API materials and identified gaps. Core validates identities, ports, cycles, joins and available responses even when gaps exist. `compileReviewableN8nWorkflow` returns the common `workflow` JSON: complete plans connect Start normally; gap plans preserve implementable HTTP/native nodes and internal connections, replace unresolved steps with failing Code placeholders, add explanatory Sticky Notes, omit every Start-to-root edge and set `active: false`. Its review result is `{ status: 'needs-review', workflow, diagnostics }`. Invalid OAS, malformed plans and missing required literals remain errors. Disconnected Start is a generation policy, not a security boundary: edited/partial executions still require host approval. See the [official example](examples/langgraph-workflow/README.md#결손-검토용-json).

Declared native JSON outputs can now feed API requests. `createNativeOutputContracts` derives their contracts from registered capabilities and validated parameters; `planApiBindings({ nativeOutputs })` includes those sources without inventing schemas. `createN8nNativeOutputSources` resolves their actual SDK exit-node names for `createHttpRequestNode({ nativeOutputSources })`. The compiler checks names/contracts and producer availability on every incoming route. Runtime checks both the native output and complete OAS request without coercion, defaults or repair. Ordinary bindings require one unambiguous JSON item; explicitly linked execution uses the item scope described above.

`createJsonOutputCapability` provides typed, explicit literal context through n8n Edit Fields JSON mode. It does not convert API responses, evaluate literal expression-like text or infer values. It is opt-in and leaves the existing default native registry unchanged. Hosts may register other deterministic native producers with an `outputSchema` callback. Graph planners accept `preparedNativeNodes`: code preserves their parameters while the model designs connections and any additional nodes. The [official example](examples/langgraph-workflow/README.md#native-출력-바인딩) wires these public functions.

Remaining: exhaustive OAS response-pointer/type proof, item-wise loops, combined/OIDC/mTLS/cookie-key authentication mappings and all native n8n variants. Automatic semantic/unit/type correction is not a planned feature. Explicit user-requested calculations may be registered separately; source values must remain intact and results must satisfy the target OAS. Static checks do not prove natural-language coverage or every complex schema implication; review and execution tests remain necessary. Existing legacy scalar bindings remain covered under `/legacy`.

Webhook/callback extraction stays in core; inbound compilation lives in n8n. Further inbound work is deferred under the current Manual Trigger/REST scope. Document acceptance is separate from selected-node conversion: valid OAS is not rejected just because an adapter cannot map a feature.

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
npm run test:array-iteration-local-n8n
npm run test:nested-array-iteration-local-n8n
npm run test:deployment-template-local-n8n
npm run test:workflow-review-local-n8n
```

Do not copy private OAS documents or secrets into this repository. Types/interfaces live in the owning package's `src/types/`; structured-output schemas in `src/schemas/`; prompts in `src/prompts/`. Every package has a descriptive `public-api.ts` entrypoint. `.ts` imports use `.js` extensions for the emitted NodeNext ESM paths.

## Licensing

Our code is MIT-licensed. `@openapi-flow/n8n` depends separately on `@n8n/workflow-sdk` under n8n's [Sustainable Use License](https://docs.n8n.io/n8n-community-license/); our MIT license does not change those terms. Core and the LangChain adapter do not depend on that SDK. See the package-specific third-party notices.

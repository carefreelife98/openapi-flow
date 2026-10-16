# Migrating to the 0.2.0 package split

0.2.0 is a coordinated release of three packages, not a compatible in-place upgrade of core 0.1.0. Do not mix 0.1.0 core with 0.2.0 adapters. Node.js 24 or later and a compatible host LangChain installation are required.

## Choose the owning package

| Responsibility | Package |
| --- | --- |
| OAS catalogs, snapshot keys, full operation lookup, schemas, binding/DAG validation | `@openapi-flow/core` |
| API selection, request-media decision, literal inputs, bindings, native/connection planning | `@openapi-flow/langchain` |
| HTTP/native fragments, execution contracts, SDK workflow JSON | `@openapi-flow/n8n` |
| Model construction, LangGraph state/loop, HITL, provider endpoint, approval/import/execution | Your host application |

Use each package's exported entrypoint rather than deep-importing source or `dist` paths. `core/runtime` is execution-only; `core/internal` is explicitly unstable. Earlier planning and compilation entrypoints are under `langchain/legacy` and `n8n/legacy`. The old API documentation is historical, not a reference for current main exports.

## Installation before publication

The source workspace can be built with `npm ci && npm run build`. The official [LangGraph example](../examples/langgraph-workflow/README.md) is a host composition in this repository, not a fourth published package or a server.

For an independent application before registry publication, install the three verified tarballs from the release-candidate artifact directory in one npm command, together with your compatible LangChain peer dependency. The tarball consumer gate verifies this path. Do not require consumers to install hidden SDK declaration helpers or enable `skipLibCheck`.

After a separately approved publication, install the same exact 0.2.0 versions of all three packages. Until then, a registry installation command for unpublished versions is not a valid quick start.

## Replace the old combined flow

1. Supply `{ id, spec }` for each parsed OAS document to `createApiCatalog`.
2. Give `listApiOperations` discovery metadata and the scenario to `selectApiOperations`. Review its proposed choices and gaps.
3. Resolve each returned key with `resolveApiOperations`; keys bind to the document snapshot. Do not replace missing `operationId` with an acceptance restriction.
4. Resolve request media, plan native instances and bindings from the selected full contracts, then call `generateApiArguments` for literal decisions still required. A fully bound request can skip its literal model call.
5. Plan connections with the same immutable API/native materials. Code validates identities, ports, dependencies, branches and cycles; selection array order is not execution order.
6. Compile with `createHttpRequestNode` and the appropriate workflow assembler/compiler. Review the returned import JSON before supplying it to n8n.

The [workspace example](../README.md#independent-stages) shows exact public function calls. Standalone stages remain available so the host can implement clarification, API reselection, self-review or HITL without replacing library contracts or modifying model output.

## Important runtime differences

- API response pointers address the **response body**. Native output pointers address the native JSON root. Do not add a transport-envelope `body` prefix to an API pointer.
- Ordinary bindings require one unambiguous source item. Explicit `itemMode: 'linked'` follows the current item's ancestry. An ordinary Merge Append is not an ancestry-based per-item join. Use explicit compatible execution scopes rather than applying linked mode indiscriminately.
- User data retains its types and meaning. The library does not coerce an integer to a string, pick a first array item, synthesize a missing identifier or repair invalid schema/model output.
- Optional deployment configuration creates visible URL/credential placeholders when omitted, as documented. Missing required API request values are not deployment placeholders: they require clarification.
- Unsupported OAS security alternatives or request formats fail during selected-node conversion. Do not weaken the original OAS or silently choose an authentication alternative.
- A `needs-review` workflow retains its internal DAG and warning regions but detaches Start. Partial/manual execution can still be dangerous; this is not an execution sandbox.

## Model-quality limits

Selection sees discovery metadata, not every response field. A matching description can select an API whose detailed contract cannot satisfy a later binding. A gap may also be a false model diagnosis. The host must surface these outcomes; a retry/reselection loop is not built into the libraries.

The compiler creates a Manual Trigger, while the native planner handles only supplied capabilities. A model can misclassify this responsibility in a natural-language request. This known issue is recorded; no special-case prompt rewriting or fake trigger capability is added by migration guidance.

Dependency licenses remain applicable to installed dependencies; see each package's included third-party notices. No company OAS, provider credential or private evaluation artifact belongs in a published package.

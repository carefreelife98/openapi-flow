# @openapi-flow/core

Engine-independent OpenAPI catalog, full operation contract lookup, OAS-derived Zod request schemas and argument validation. This is unreleased `0.2.0` source; published `0.1.0` has a different API.

`createApiArgumentGenerationContract({ operation, bindings, requestMediaType })` is the shared literal-generation boundary. It returns the Zod `schema`, its matching `literalInputSchema` JSON Schema, and `hasLiteralInputs`. Bound paths have no original value definition and are forbidden (including through open additional properties); unbound OAS-approved fields stay available. Fully bound closed nested objects have no remaining literal decision. Open objects can still accept additional scenario values, so binding every named property does not close that OAS contract. The original operation and complete runtime request schema remain unchanged.

Dynamic OAS assertions are no longer round-tripped through experimental `z.fromJSONSchema`. `createOasValueSchema` uses Zod's public refinement and metadata APIs: Scalar's JSON Schema validator checks the preserved assertions, and Zod exports those same assertions to LangChain. Type-less constraints, enum siblings and simultaneous compositions are not replaced by inferred types or weaker schemas. OAS 3.0 `nullable` and boolean exclusive bounds are explicitly translated to Draft 2020-12 syntax; formats, annotations and enum/example data are retained. Each embedded schema has a resource ID so fragment references keep their original scope. These IDs are schema identifiers, not inferred API input values. `validateApiArguments` and the complete `createApiRequestSchema` use the same dialect conversion; the latter retains required fields for the n8n standalone validator. Uncompileable selected schemas fail with their source before a model call. Provider-specific schema support is still an external boundary, not a reason to trim the OAS contract.

See [Zod's JSON Schema and metadata APIs](https://zod.dev/json-schema#metadata) and the [OAS 3.0 Schema Object](https://spec.openapis.org/oas/v3.0.4.html#schema-object) for the conversion boundary and nullable semantics. This does not claim exhaustive support for every schema dialect or provider.

```ts
import {
  createApiCatalog,
  listApiOperations,
  resolveApiOperations,
} from '@openapi-flow/core';
```

The host supplies `{ id, spec }` documents. Catalog creation requires neither deployment credentials nor a per-path effect policy. The selected full OAS contract remains available before any engine-specific conversion. Operation keys carry document ID, snapshot hash and OAS JSON Pointer; changed documents fail lookup.

`createApiArgumentsSchema` preserves OAS request types and excludes bound fields from model proposals. `validateApiArguments` checks literal constraints and returns missing-input pointers. `validateApiBindingPlan` checks response-to-request identities, pointers, known incompatible types and cycles. `materializeApiArguments(values, bindings, responses, material)` copies actual values without coercion or defaults; the OAS material determines missing container kinds. `createApiRequestSchema` supplies the complete final request schema for runtime validation. The `/runtime` entrypoint contains execution-only materialization and serializers without catalog/document intake. Core does not call an LLM, import LangChain/n8n, execute APIs or provide a server. The `/internal` export is an unstable adapter boundary. See the [workspace guide](https://github.com/carefreelife98/openapi-flow#independent-stages).

`WorkflowGraphPlan` describes native capability settings, named-port edges, starts and unmet requirements. `validateWorkflowGraphPlan` uses host-supplied capability contracts to check graph identity/ports/cycles, exclusive-branch join compatibility and API response availability on every incoming route. It does not prove scenario coverage or exhaustively validate response pointer types against every OAS schema dialect; missing fields fail in the runtime compiler. This contract is engine-independent and does not import an n8n node registry.

Our code is MIT-licensed. Core has no n8n SDK dependency. Dependency licenses remain separate; see [third-party notices](./THIRD_PARTY_NOTICES.md).

`ReviewableWorkflowApiMaterial` discriminates ready calls with real arguments from blocked calls with OAS identity, declared bindings and causal gap IDs, but no fabricated arguments. `createReviewableWorkflowGraphPlan` adds explicitly identified gaps and blocked calls to the proposed DAG, derives its actual roots, and invokes `validateReviewableWorkflowGraphPlan`. Topology and binding-contract validation are never skipped because of gaps. Blocked/gap nodes have ports but no available API response. `validateApiBindingAssignments` checks assignments independently of execution readiness; `validateApiBindingGaps` requires every reported gap to identify a known call and an OAS-declared request pointer. The strict `validateApiBindingPlan` still rejects all gaps. These contracts do not imply that review workflows may be executed.

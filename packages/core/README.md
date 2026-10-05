# @openapi-flow/core

Engine-independent OpenAPI catalog, full operation contract lookup, OAS-derived Zod request schemas and argument validation. This is unreleased `0.2.0` source; published `0.1.0` has a different API.

`createApiArgumentGenerationContract({ operation, bindings, requestMediaType })` is the shared literal-generation boundary. It returns the Zod `schema`, its matching `literalInputSchema` JSON Schema, and `hasLiteralInputs`. Bound paths have no original value definition and are forbidden (including through open additional properties); unbound OAS-approved fields stay available. Fully bound closed nested objects have no remaining literal decision. Open objects can still accept additional scenario values, so binding every named property does not close that OAS contract. The original operation and complete runtime request schema remain unchanged.

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

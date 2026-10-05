# @openapi-flow/n8n

Deterministic OpenAPI request-node creation and explicit n8n DAG assembly with the official workflow SDK. Unreleased `0.2.0` source; this package is not yet published.

- `createHttpRequestNode`: full selected OAS contract + literal values/response bindings + trusted base URL/credential references → SDK node fragment. Bound requests additionally require `apiNodeNames` and compile into materialization Code → HTTP Request.
- `assembleN8nWorkflow`: explicit fragments, named ports, edges and starts → SDK-validated importable JSON. Fan-out is supported; node-array order does not define execution order.
- `createN8nNativeCapabilities`: described Zod configuration schemas and deterministic compilers for IF, Merge Append, response-assertion Code and StopAndError. Custom capability registration is supported.
- `compilePlannedN8nWorkflow`: validates model/host graph plans against materials/capabilities, checks response availability and joins, and builds importable JSON using the SDK.
- `compileInboundWorkflow`: preserved Webhook/Callback response compilation.

No LLM dependency, HTTP server, workflow import/publication or API execution. Compilation does not require per-path `effectPolicy`; the host owns execution approval. Bound requests read a single unambiguous API full-response envelope, preserve actual JSON types, validate the complete request against its OAS schema and reuse literal serialization. The validator is compiled on the host with [Ajv standalone code generation](https://ajv.js.org/standalone.html); n8n receives no schema compiler or eval requirement. Native comparisons currently read the first output item. Missing fields fail without defaults. Code is library-owned, not model-written. Multi-node fragments require explicit internal edges, validated and wired by the assembler. Other native variants, item-wise bindings, native-output bindings, transformations and exhaustive response-schema proof remain pending. Earlier policy-aware single/sequence compilers live under `/legacy`.

Our code is MIT-licensed. The separately licensed `@n8n/workflow-sdk` dependency is subject to n8n's [Sustainable Use License](https://docs.n8n.io/n8n-community-license/). Our license does not change those terms. See [third-party notices](./THIRD_PARTY_NOTICES.md) and the [workspace guide](https://github.com/carefreelife98/openapi-flow#implemented-checkpoint-and-remaining-work).

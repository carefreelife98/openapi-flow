# @openapi-flow/n8n

## Unreleased: shared response-evaluation schema projection

Response-evaluation contracts use core's sequential schema projection instead of
repeatedly embedding intermediate schema bundles. API source extraction, original
value types, item lineage and array-measurement failure diagnostics are retained.
This is a schema-processing change, not a new execution node or business rule.
A replay of three original OAS-backed evaluation rules agreed on 27 test values;
it is not a full workflow quality result. Published 0.5.1 is unchanged.

Combined evaluation output also reuses identical canonical schema resources when
multiple checks refer to the same native output. Conflicting resource declarations
fail rather than merge. Isolated n8n execution passed six evaluation conditions,
including two checks over one native output with unchanged values and pointers.
This is execution-contract verification, not a natural-language scenario pass.

0.4.2 declares that `gather-api-responses` settings are fully determined by its
explicitly selected producer IDs. Core can copy that registered contract without
a second model value decision. This is opt-in capability behavior, not field-name
inference, arbitrary defaulting, or a replacement for the official execution node.
See the [0.4.2 record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.4.2.md).

0.4.0 adds original native-output projection/measurement/collection,
explicit API map selection and typed key joins, and official SDK node metadata,
configuration validation and construction helpers. Execution reuses the official
n8n nodes. These helpers do not provide automatic planning for all n8n node types,
arbitrary computation, classification or pagination. Development sections below
target this version. Publication, compatibility and accepted limitations are in
the [release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.4.0.md).

0.4.0 source adds `N8nNativeFeature.CollectNativeOutputValues` and
`createNativeValueCollectionCapability({ sources })`. This is a contract adapter
for official Aggregate, not a new aggregation implementation. Select an actual
native producer and its pointer to collect unchanged stream values into `items`.
The existing API collector shares the same reader/SDK compilation path. Original
types, nested arrays, duplicates, nulls, order and aggregate ancestry are retained;
missing selected values fail before aggregation. Empty input creates no result.
This is a reduction, not a branch join, grouping per parent or pagination.
It is not present in published 0.3.18. See the
[collection contract](../../docs/native-feature-planning.md).

0.4.0 source extends the existing IF and assertion operands with
`{source:'node-output',nodeId,pointer}`. This is not a new native feature family.
Planning specializes native IDs and pointer choices from actual completed output
contracts, separately from API response bodies. The compiler requires the actual
`nativeOutputSources` names/schemas. In linked item mode it follows item ancestry;
otherwise multiple source items fail rather than choosing the first.

The shared Code boundary validates the full source, selected-value presence and
operator types before IF expression evaluation. n8n can handle expression errors
without failing the workflow, so missing optional values must not masquerade as a
normal false branch. A valid false comparison remains valid and is not rejected.
No source values, original types, business thresholds or classification labels are
invented. Run `node integration/native-output-comparisons-local-n8n.mjs` for the
isolated engine checks. This source is not in published 0.3.18.

0.4.0 source adds `N8nNativeFeature.ProjectNativeOutput` and
`createNativeOutputProjectionCapability({ sources })`. Select unchanged fields from
one actual native JSON producer with `{sourceNodeId,fields:[{name,pointer}]}`.
Core derives source-specific pointer choices and output types; a guard validates the
full producer and selected-value presence, then official Edit Fields performs the
selection per linked input item. Empty input remains empty. Compiling requires actual
compiled producer names/schemas, not guessed names. This does not provide arbitrary arithmetic, conversion,
classification, collection, or pagination. Explicit derived count fields may add
`measurement: 'utf16-code-units'` for a string or `'array-items'` for an array;
official Edit Fields evaluates `.length`. Omitting `measurement` still copies the
original value. UTF-16 units are not Unicode characters/graphemes or a replacement
for OAS length validation. The model must not infer a missing business counting
policy. Missing/null/wrong-typed values fail before Edit Fields, never becoming zero.
Strict planning distinguishes copy fields from measured fields with a required unit.
No arbitrary code, casts or new native family is introduced. Run
`node integration/native-output-projection-local-n8n.mjs` for isolated typed-value,
empty-input and fail-fast consumer checks. This source is not in published 0.3.18.

0.4.0 source adds `N8nNativeFeature.JoinApiResponseArraysByKey` and
`createApiResponseKeyJoinCapability({ materials })`. Explicit left/right API-array
and relative key pointers compile to official SDK Merge 3.2 matching-fields mode,
with strict typed equality, all duplicate matches and inner/full/left/right retention.
Full OAS response validation and linked readers preserve unchanged rows under fixed
`left`/`right` fields. Missing-key handling must be explicit; missing keys never match
each other or become null. This is not the ancestry-based `JoinApiItems`, a positional
zip, a page accumulator, or a claim of per-item preservation inside a batch scope.
The isolated synthetic engine check is `node integration/api-response-key-join-local-n8n.mjs`.
This source is not part of published 0.3.18. See the [native planning guide](../../docs/native-feature-planning.md).

0.4.0 source adds `N8nNativeFeature.SelectApiResponseMapEntry` and
`createApiResponseMapEntryCapability`. Select one exact object key with
`{sourceNodeId,pointer,key}` and preserve the original value as `{key,value}`.
Use existing `SplitNativeOutputArray` on `/value` for grouped arrays. Only the key
may be deferred through explicit native runtime field ownership; API identity and
response-pointer structure remain literal. OAS-derived output contracts, full-response
validation, exact own-key checks and linked item ancestry are preserved. Missing keys
fail without choosing a first entry or fabricating an empty array. This source is not
part of the published 0.3.18 release. See the [native planning guide](../../docs/native-feature-planning.md).

Version **0.3.18** aligns with LangChain's typed source decision fix.
The official SDK compiler and runtime response validation are unchanged. See the
[release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.18.md).

Version **0.3.17** aligns with Core and LangChain's additive planning contracts.
The official SDK compiler and original response-value validation are unchanged.
Rejected or incomplete goals are not executable workflows. See the
[release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.17.md).

Version **0.3.16** aligns with Core's incremental connection finalization. The
existing official-SDK compilation path consumes the validated final plan; partial
sessions are not executable workflows. See the
[release status and limitations](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.16.md).

Version **0.3.14** introduces the fixed results family described below. See the
[0.3.14 release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.14.md)
for actual publication and host status; preparation is not publication. The owner
accepted the upstream SDK's unresolved Zod 3 advisory for this release on
2026-10-25. Oversized collection validation can exhaust memory; actual host
exploitability has not been established. Raising the host Zod peer does not replace
the SDK's separately pinned Zod 3; no override or audit exclusion is used.

## Fixed API results (0.3.14)

`compilePlannedN8nWorkflow` and `compileN8nWorkflowTemplate` expose Core's shared
structured error contract. An untyped dependency exception becomes the exact
`cause` of `N8N_COMPILATION_FAILED`; existing typed errors pass through unchanged.
Diagnostic JSON excludes raw messages, stacks, credentials and model output.

`createApiResponseResultsCapability({ materials })` / `N8nNativeFeature.GatherApiResponses` register `gather-api-responses`. The model selects only `sourceNodeIds`. Code fixes `{ results: [{ callId, documentId, method, path, body }] }`, derives metadata and body schemas from original OAS contracts, and keeps each complete response body unchanged. Official SDK Merge and Aggregate nodes assemble the list after full-response validation. Duplicate calls to one operation remain separate by `callId`; exactly one source item per call is required. Wait-only joins use Merge and original API references without result reconstruction. Never infer downstream binding identity from a results array index.

Default planning includes this family and no longer offers legacy `ComposeApiResponses`. Its explicit enum selection and factory remain compatible; material inventories include all thirteen registered families. Consult the 0.3.14 release record above for publication and host status. See [the source guide](https://github.com/carefreelife98/openapi-flow#fixed-api-response-results-0314) and run `npm run test:api-response-results-local-n8n` for isolated engine checks.

## Published package

Zod `^4.6.7` is a required host peer for the public configuration schemas. It is not an independently pinned runtime dependency. The n8n SDK's internal Zod 3 remains separately owned; this does not pass a Zod 4 instance into an API requiring Zod 3.

Version **0.3.13**, with matching `@openapi-flow/core@0.3.13`. The response-object schema now distinguishes workflow-local output labels from missing API business inputs: preserve explicitly requested labels, otherwise choose unique concise labels from supplied API metadata. Data values, JSON types, node implementations and runtime validation are unchanged. Known limitation: Ajv 8.20.0 ignores a declared `properties.__proto__`. Generated validation can reject valid data or omit that property's constraints; do not rely on it for contracts using that key. The accepted limitation and original failing regression remain unchanged. No field substitution or schema compatibility transform is included. See the [release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.13.md) for actual publication and host status.

`createApiResponseObjectCapability({ materials })` / `N8nNativeFeature.ComposeApiResponses` register `compose-api-responses`. The model selects only `fields: [{ name, sourceNodeId, pointer }]`. Code derives value schemas from original OAS contracts, validates full responses and derives join inputs from distinct sources in first-field occurrence order. The compiler reuses official SDK Merge Append and Edit Fields (Set); one source needs no Merge. Literal names, nulls, scalar types and nested values are preserved. Duplicate names, absent pointers, undeclared bodies and ambiguous source item counts fail without defaults or coercion. This is one response item per API invocation, not a native-output projection or per-item batch join. See [the source guide](https://github.com/carefreelife98/openapi-flow#named-api-response-objects-038).

`describeN8nManualTrigger()` describes the Manual Trigger already supplied by this compiler. Pass that descriptor as `entrypoint` to native and connection planning so a model sees the actual compiler contract without selecting an extra trigger. The descriptor is not a data producer or a substitute for graph validation.

`compileN8nWorkflowTemplate` supports canonical `gapNodes`. It preserves
internal control edges, reuses Korean warning regions and stop-on-execution
surrogates, and leaves Start detached. Full Core topology validation remains in
place; the strict compiler still rejects unresolved plans. See the
[gap contract](../../docs/workflow-draft-conversation-host.md#explicit-capability-gaps).

templates retain API `requestedInputs` metadata and report requested
optional values in their slots and Korean guide. Preflight and the final request
materializer check presence separately from the unchanged OAS, including missing
optional descendants of a response-bound object. Strict HTTP node creation also
rejects missing requested literals. See [requested inputs](../../docs/workflow-draft-api-binding-questions.md#값이-미정인-선택-입력의-요청-추적).

`resolveN8nNativePlanningFeatures` separates selectable implementation definitions from material readiness. Five source-dependent families can be selected before producers exist, then bind the original contracts through existing snapshots and SDK compilation. No guessed source schema or runtime name is used. See [planning and host integration](../../docs/native-feature-planning.md).

material-dependent array/collection/item-join compilation rebinds current data contracts and resolves runtime names from actual SDK producer exits. `createN8nNativeOutputSources` requires actual `apiResponseContracts` for referenced APIs; partial subsets can declare external native outputs explicitly. Template requests accept `itemMode: 'linked'` for ancestry-preserving item streams. No old-contract/name fallback is used; custom compiler extensions must retain a coherent material binder. See [material snapshots and runtime proof](../../docs/native-material-snapshots.md).

templates accept whole-object or explicit field-pointer runtime parameters for `createJsonOutputCapability` and StopAndError. A central editable input map, per-slot checks, full combined-object preflight and immediate native guards preserve original literals, schemas and revision. The compiler still uses official SDK Set/StopAndError nodes; structural settings are not guessed at execution time. Slots and the Korean guide identify where actual values belong. Staged planning/editing contracts are available, but older combined host factories do not automatically acquire them. See the [supported scope and checks](../../docs/native-runtime-inputs.md). These additions are not in npm 0.2.0.

Standalone strict, reviewable and finite-batch compilation also accepts explicit `nativeInputs: { revision, inputValues? }`. A runtime-owned plan requires that configuration; there is no invented revision or template draft. Results with slots include `nativeInputTemplate` with original schemas, readiness, edit locations and a Korean guide. Missing actual values remain absent and fail at preflight before external calls. Review gaps retain internal wiring and warning regions with Start detached. Omission on literal-only plans preserves their existing result shape. See the [standalone compiler protocol](../../docs/native-runtime-inputs.md#standalone-compiler-input-protocol).

`describeN8nManualTrigger()` exposes the compiler-owned start contract for requirement planning. Its description and actual SDK trigger creation share one module, so hosts can declare the existing start separately from selectable native instances. It is explicit planning metadata, not a registry default, deployment check or extra trigger node.

`resolveN8nNativeFeatures` and `N8nNativeFeature` expose one registry for twelve existing feature families. Omission inventories every family with explicit `ready`/`requires-context` status; an explicit enum list is strict and `[]` selects none. Ready capabilities retain the existing schemas, source declarations and SDK compilers. Material-dependent families require actual OAS/native contracts, not invented placeholders. The published four-feature factory keeps its original selection. See the [registration and extension contract](../../docs/native-feature-registry.md).

Deterministic OpenAPI request-node creation and explicit n8n DAG assembly with the official workflow SDK. Version `0.3.9` depends on matching core `0.3.9`.

## Installed declaration dependencies

This adapter's public types reference `@n8n/workflow-sdk@0.36.4`, which depends on `n8n-workflow@2.43.4`. Declarations in that SDK/workflow chain, `@n8n/errors@0.15.0` and `@n8n/utils@1.50.1` import modules/types listed only as development dependencies. A consumer does not install another package's development dependencies. This adapter therefore declares the required packages in its own `dependencies`: `@n8n/config@2.41.2`, `@sentry/node@10.70.0`, `nock@14.0.14`, `@types/estree@1.0.8`, `@types/express@5.0.1`, `@types/json-schema@7.0.15`, `@types/luxon@3.2.0`, `@types/semver@7.7.0` and `@types/ssh2@1.15.0`. These versions follow the corresponding upstream manifests; a fresh strict consumer verifies compatibility. Installing Sentry does not initialize telemetry in this adapter.

Normal installation brings these packages automatically, including production installations that omit development dependencies. Consumers do not need to install them manually, enable `skipLibCheck`, add declaration shims or run a custom installation script. These dependencies do not start an HTTP server, execute nock or configure an n8n instance. Core and LangChain packages do not own this SDK-specific contract. Keep these declarations until a verified SDK/workflow upgrade supplies its complete public declaration dependency graph; remove them only after the independent strict consumer still passes. See the [TypeScript publishing guidance](https://www.typescriptlang.org/docs/handbook/declaration-files/publishing.html#dependencies).

## Public APIs

- `createHttpRequestNode`: full selected OAS contract + literal values/response bindings + optional trusted base URL/credential references → SDK node fragment. Bound requests additionally require `apiNodeNames` and compile into materialization Code → HTTP Request.
- `httpRequestDeploymentOptionsSchema`: shared validation for optional execution settings. Missing URLs become `https://replace_me.invalid`; required missing Bearer references become `REPLACE_ME:<documentId>:<schemeName>`. Supplied invalid settings fail rather than becoming placeholders.
- `assembleN8nWorkflow`: explicit fragments, named ports, edges and starts → SDK-validated importable JSON. Fan-out is supported; node-array order does not define execution order.
- `createN8nNativeCapabilities`: described Zod configuration schemas and deterministic compilers for IF, Merge Append, response-assertion Code and StopAndError. Custom capability registration is supported.
- `compilePlannedN8nWorkflow`: validates model/host graph plans against materials/capabilities, checks response availability and joins, and builds importable JSON using the SDK.
- `compileBatchedN8nWorkflow`: the same complete-plan checks plus explicit finite batch scopes → SDK Loop Over Items wiring, unchanged item ancestry and completion-time downstream execution.
- `compileReviewableN8nWorkflow`: validated review plan + ready/blocked API materials + ready fragments + native capabilities → common `workflow` JSON. Complete plans use the strict compiler. Gap plans return `{ status: 'needs-review', workflow, diagnostics }` with connected internal nodes and a detached Start.
- `compileInboundWorkflow`: preserved Webhook/Callback response compilation.

Built-in IF and response assertions provide capability-owned planning-schema hooks. Their response `nodeId` is an enum of supplied API call instances during generation, while their runtime parameter schemas remain unchanged. Without API materials, only literal operands are offered; other native capabilities remain usable. The specialized schema does not change OAS acceptance, data types, response values or SDK compilation. Both generation-time and final graph/reference checks are retained.

No LLM dependency, HTTP server, workflow import/publication or API execution. Compilation does not require per-path `effectPolicy`; the host owns execution approval. Bound requests preserve actual JSON types, validate the complete request against its OAS schema and reuse literal serialization. Ordinary reads require one unambiguous item; explicit linked mode uses n8n ancestry for HTTP bindings, IF and assertions. Native JSON output binding, Split Out array iteration including linked nested API arrays, Aggregate collection, shared-scope API item joins and explicit linear/complete-fan-out batch paths are implemented; conditional/filtering and nested batch scopes, cross-invocation joins and exhaustive response-schema proof remain pending. The validator is compiled on the host with [Ajv standalone code generation](https://ajv.js.org/standalone.html); n8n receives no schema compiler or eval requirement. Its bundled equality helper compares JSON structurally rather than inspecting constructors across isolated realms, without changing schemas or values. Missing required API values fail without defaults. Code is library-owned, not model-written. Multi-node fragments require explicit internal edges, validated and wired by the assembler. Earlier policy-aware single/sequence compilers live under `/legacy`.

Template nodes visibly list missing execution settings in their notes. No OAS server is selected automatically, no credential secret is embedded, and anonymous APIs receive no credential placeholder. Provide settings and regenerate before execution, or replace placeholders and select existing n8n credentials. Bound URLs also live in the Materialize node configuration; editing only the HTTP Request URL is insufficient. Fully configured output and strict `/legacy` contracts remain unchanged.

Review workflows preserve confirmed HTTP Request/native nodes, materialization nodes and internal DAG edges. Each gap and blocked API call becomes a main-input/main-output Code placeholder that always throws `OPENAPI_FLOW_UNRESOLVED_STEP`; a Sticky Note explains the reported requirement. Placeholder code is library-owned and encodes descriptions as data, never JavaScript instructions. No unavailable API, argument or response is fabricated. Every Start-to-root connection is omitted, and `active: false` is supplementary. Review status does not certify scenario coverage or execution safety. Reconnecting Start can execute real preceding API calls before the placeholder fails; host approval and credential controls remain necessary.

Each placeholder is enclosed in a red Sticky Note region with the Korean heading `확인 필요`, localized stage labels, replacement guidance and execution warnings. The node is named `확인 필요 · <nodeId>` and displays a short Korean note in the canvas. The region reserves space for its complete diagnostic text above the node; multiple regions are placed separately below existing positioned nodes. Supplied descriptions, identifiers and OAS contracts are preserved, not automatically translated or truncated. This uses built-in nodes only and needs no community-node installation.

Compilation types live in `src/types/reviewable-workflow.ts` and `src/types/workflow-compilation.ts`; fixed failure nodes in `src/nodes/gap/`; annotations/escaping in `src/workflow/review/`; assembly in `src/workflow/build-n8n-workflow.ts`. The assembler creates the sole Manual Trigger and preserves all internal edges. Core validates topology even with gaps. Unblocked calls cannot reference blocked API responses; confirmed response-dependent calls must themselves be explicitly blocked. Invalid OAS, literal inputs, ports, references or unsupported unblocked compilers are errors, not automatic gaps. Existing strict compilers retain their fail-fast behavior. The old unpublished notes-only preview API was replaced, not aliased.

`integration/workflow-review-local-n8n.mjs` imports/exports three public scripted-model gap cases and an independent-root case, executes only Start with zero API calls, then deliberately reconnects one case against a local contract server and verifies failure at the placeholder without downstream calls. Output is in `.local-artifacts/workflow-review/`. This tests CLI runtime, not browser partial execution, real LLM selection quality or business APIs. [n8n distinguishes manual, partial and production execution](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions/); `active: false` alone does not prevent manual execution. Redact scenario/request/diagnostic content before sharing workflow JSON.

Our code is MIT-licensed. The separately licensed `@n8n/workflow-sdk` dependency is subject to n8n's [Sustainable Use License](https://docs.n8n.io/n8n-community-license/). Our license does not change those terms. See [third-party notices](./THIRD_PARTY_NOTICES.md) and the [workspace guide](https://github.com/carefreelife98/openapi-flow#implemented-checkpoint-and-remaining-work).

## Native response checks

`compilePlannedN8nWorkflow`, `compileBatchedN8nWorkflow` and `compileReviewableN8nWorkflow` provide original API response contracts from their materials to native compilers. IF/assertions require the original OAS contract and actual source name for each referenced API. If invoking a capability's `compile` directly, supply `apiResponseContracts` alongside `apiNodeNames`; literal-only checks need no response context. Assembly rejects a different declared contract or producer.

Shared compilation lives in `nodes/native/comparisons/`, with types in `types/comparison-input-compilation.ts` and `types/comparison-input-guard.ts`. IF uses Code guard → official IF, preserving input values, binary fields and paired-item ancestry. Its expressions contain only source reads and comparisons. Assertions use the same full-source reader before checking values. Runtime status/media select the OAS response contract; native JSON uses its actual producer contract, never a fictitious HTTP body. Matching one field never exempts invalid sibling fields. Selected pointers and operator types are checked in Code before IF; generated guard node IDs and names remain unchanged. No schema or data conversion is introduced.

`test:array-iteration-local-n8n` covers 14 cases, including five new IF/assertion failures with no forbidden downstream calls. Its report explicitly retains the original error and the n8n display message. n8n 2.37.10's [task-runner parser](https://github.com/n8n-io/n8n/blob/n8n%402.37.10/packages/%40n8n/task-runner/src/js-task-runner/errors/execution-error.ts) truncates colon-containing errors despite preserving the original stack. This display defect remains unresolved; the adapter does not rewrite errors to accommodate it.

## Declared native output bindings

`createJsonOutputCapability({ name, description, parametersSchema })` creates an opt-in typed literal producer using the official SDK's Edit Fields (`n8n-nodes-base.set`, version 3.4) JSON mode. Parameters are validated unchanged: schema coercion, defaults or transformations cannot silently rewrite them. Expression-like strings and dotted keys remain data. This is not a general calculation engine or an automatic conversion step.

Native producers declare `outputSchema(parameters)` in their capability. `createN8nNativeOutputSources({ nativeNodes, capabilities, apiNodeNames })` derives the schema and actual SDK exit name. Pass these as `nativeOutputSources` to `createHttpRequestNode`; retain `apiNodeNames` for API response producers. API values are read from `json.body`; native values from the JSON item root. Both use the same pointer materializer and OAS request validation/serialization. Native source schemas are also validated before HTTP. A missing field, incompatible type, ambiguous multiple item output, wrong runtime name/schema or unavailable graph producer is an error, not a fallback.

`integration/native-output-bindings-local-n8n.mjs` uses a supplied private ICL OAS file and a local contract endpoint. Its CLI is an explicitly scripted baseline; `runNativeOutputValidation` also accepts a real LangChain model. It validates unchanged mixed JSON types, dotted keys, expression-like literal text and three producer failures. It does not call ICL, prove response business semantics, add iteration or broaden authentication. Artifacts live under `.local-artifacts/native-output-bindings/<plannerLabel>/` and are not published. The [Edit Fields documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.set/) and [upstream implementation](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Set/v2/SetV2.node.ts) describe JSON mode; the adapter disables inclusion of other input fields and dot notation explicitly.

Each validation attempt now retains an independent `runs/<UUID>/` directory: `planning-context.json`, successful `workflow.json`/`report.json`, or a `failure.json` containing the phase and application-owned planning stage/cause/raw output. It never copies unclassified transport messages, headers or request objects. Top-level workflow/report files still represent the latest successful result, not an aggregate success rate. No failure is repaired or retried by the runner.

Observed upstream issue: on n8n `2.37.10`, a valid top-level JSON string response with `autodetect` + `fullResponse: true` failed before the next node. The installed HTTP Request implementation parses the JSON at `HttpRequestV3.node.js:688`, then parses the resulting string again at line `799`. Current `createHttpRequestNode` fragments now use an explicit OSS response adapter: official File-mode HTTP transport `Receive <callId>` → deterministic Code decoder `Request <callId>`. The latter is the public fragment exit; all response names must refer to that decoded exit. The adapter reads original bytes using the official `this.helpers.getBinaryDataBuffer` API and parses JSON once, without changing OAS contracts or repairing values. This is an OSS mitigation, not an upstream n8n fix. Legacy generation entrypoints are unchanged.

`createResponseCollectionCapability({ materials })` registers `collect-api-responses`. Only source call ID and pointer are planned; code validates every original response and compiles Code reader → Aggregate. Its `{items: values}` output preserves nesting, nulls, duplicates and input item order. Missing pointers fail before Aggregate, never becoming null substitutes. Collection applies to one incoming stream in one invocation, not a join or standalone accumulator. A batch scope's done stream can supply all processed items in one invocation; the reader uses each item's ancestry to resolve source responses across node runs. Empty streams do not fabricate output. Source name/contract declarations are checked against compiled workflow materials for both API and native fragments.

File mode disables n8n's automatic JSON request encoding too. The OSS serializer encodes the OAS value once; the node adapter encodes that wire text into the JSON Body setting, which n8n parses back to the unchanged wire text before sending. The API does not receive the setting envelope. Both literal and materialized JSON bodies use this contract, including strings, nulls, arrays and DELETE bodies.

`npm run test:json-response-local-n8n` verifies nine unchanged JSON values through source → OAS validation → response-bound echo POST → literal echo DELETE → response collection. Both actual received bodies and responses must equal the original values. Ordinary, numeric-looking, JSON-shaped and empty strings retain their types. `node integration/json-response-local-n8n.mjs --native` retains a separately failing unmodified-n8n baseline. Artifacts: `.local-artifacts/json-response/` and its `native/` subdirectory. `npm run test:http-response-decoding-local-n8n` checks twelve additional transport cases, including malformed JSON, invalid UTF-8, structured `+json`, text charsets, binary bytes and no-body responses. Raw metadata/status and item ancestry remain intact; invalid content is never replaced by `{}`, `null` or an empty item. JSON is UTF-8; text uses its explicit header charset or the native UTF-8 codec default. Binary routing retains the verified HTTP Request v4.3 policy, with bytes exposed as `binary.data`. The temporary `openApiFlowRawResponse` binary field is reserved for the transport adapter and removed from its output. See [official binary access](https://docs.n8n.io/code/cookbook/code-node/get-binary-data-buffer/).

`createItemJoinCapability({ materials, scopes })` registers `join-api-items` with existing API contracts and actual compiled native scope sources. Only `scopeNodeId` and unique `sourceCallIds` are planned. Input ports correspond to that call order; each port requires its own API and the shared native ancestor. Per-branch readers validate full OAS responses and the native scope, official Merge Append waits for the branches, and library-owned grouping combines only responses whose n8n ancestry identifies the same scope object. It never matches business IDs, equal JSON or independent stream positions. Missing/duplicate branch results and ambiguous ancestry are errors.

Output `{ responses: { callId: unchangedBody } }` preserves values and every contributing item link. Results follow original scope order. Both branches excluding an item yields no result for that item; an asymmetric exclusion is an error, not a silently dropped join. Empty scopes emit nothing. Scope names/schemas and API contracts are checked against the compiled producers. The implementation is invocation-scoped and can join complete branches in each explicit batch invocation, as described below. Cross-invocation joins and nested batch scopes remain pending. SDK fragments may declare validated `inputEndpoints` for separate input readers; the workflow assembler routes the ports to those actual entry nodes.

Derived response pointer/item candidates preserve conjunctive constraints and normalize OAS 3.0 syntax before native validation. They do not replace full source validation: projected oneOf branches can overlap, and item candidates do not prove tuple positions, sibling conditions or complete schema implication. `npm run test:schema-projection-local-n8n` checks composite item binding and nullable scalar collection through the installed n8n runtime. Neither original OAS contracts nor data are modified.

## Nested API response arrays

Register `createResponseArrayCapability({ materials, itemMode: 'linked' })` to split each input's linked API response array. The host selects execution mode; the planner still supplies only `sourceNodeId` and `pointer`. The reader validates every full OAS response before Split Out and pairs each array wrapper with its own input. Split Out preserves that parent link for every unchanged child. Dependent linked API calls can read both split levels and intermediate API responses. Empty arrays produce no child requests; missing/ambiguous ancestry and invalid OAS values fail without substitution. The ordinary array registry retains its singleton guard.

`npm run test:nested-array-iteration-local-n8n` verifies two split levels, five APIs, repeated parent/child IDs, IF-filtered parents, an empty middle array, full empty streams and invalid response/media cases on n8n 2.37.10. Local import JSON/report: `.local-artifacts/nested-array-iteration/`. This is a deterministic regression, not an LLM quality score. Cross-invocation accumulation and automatic scope selection remain pending. Explicit batch execution is a separate compiler below.

### Native JSON output arrays

`createNativeArrayCapability({ sources, itemMode: 'linked' })` accepts actual native output contracts and compiled names from `createN8nNativeOutputSources`. Its structured-output parameters contain only the supplied `sourceNodeId` and array `pointer`. Code derives the item contract and validates the whole original native output before official Split Out, sharing mechanics with API array splitting in `src/nodes/native/arrays/`. Native pointers start at the JSON root rather than an HTTP response body. No conversion, flattening or default values are added. Empty arrays emit no children; linked mode retains parent ancestry; ordinary mode rejects ambiguous multiple inputs/sources.

The host derives parent contracts before registering a child planning stage; automatic recursive scope discovery remains pending. Source names/schemas and dependencies are checked by workflow assembly. `npm run test:native-array-iteration-local-n8n` covers twenty cases: ten each with inline and recursive-reference producer contracts. Both variants include two splits, five distinct REST APIs, fan-out/join/collection, empty streams and original native/API contract failures. Local artifacts: `.local-artifacts/native-array-iteration/`, including `five-api-references-workflow.json`. These are deterministic fixtures, not model quality results.

Native output validation compiles each original schema independently instead of embedding producers under a shared root. Core's item/pointer projections bundle the original resource and reference its locations using Ajv's public registry and fast-uri; local and recursive `$ref`, anchors and nested IDs retain scope. The host assigns an offline retrieval URI to anonymous resources without changing original input contracts or values. Runtime nodes receive standalone validators, not a schema resolver. `npm run test:native-schema-references` now verifies the original compiler and reusable item contract as a passing regression. Missing references fail; external registry injection, dynamic-scope projection coverage and exhaustive schema implication remain pending.

## Finite batch paths

Call `compileBatchedN8nWorkflow({ ...completePlanInput, batchScopes })`. Required scopes contain `id`, `batchSize`, `nodeIds`, `entryNodeId` and `exitNodeId`. No scope, size or member is inferred. The logical DAG and all existing provenance/response/port checks remain intact; only the adapter adds official SDK Loop Over Items v3 controllers and their return edges. Scope size is a positive safe integer, reset is false and controller IDs/names must not collide with any existing SDK node.

Scopes must not overlap and must have a single entry/exit. Fragments declare either `preservesInputItems` for one-to-one linked steps or `joinsInputItemsByAncestry: { scopeNodeId }` for explicit joins of complete branches. `validateBatchItemFlow` traces the declared flow, checks one branch per join input and requires a shared scope ancestor that identifies every entry item. Fan-out is allowed without cloning logical/API nodes. Item-preserving relays before the scope retain ancestry. Earlier batch completion is not assumed to be the original exit node's latest run. Custom compilers must honor their declarations; this is not arbitrary JavaScript proof.

`createPassThroughCapability()` is opt-in and compiles the official [No Operation node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.noop/), version 1, with a strict empty configuration. It preserves input items/links unchanged and can supply the common entry before fan-out. It neither emits synthetic items nor declares a guessed native output schema.

IF with a discarded alternative, item-dropping Filter, Split Out, Aggregate and ordinary Merge Append lack a complete batch return contract: an empty branch may never execute its return and stop the remaining batches. Place Split Out before the scope and Aggregate after completion. This does not narrow OAS intake. Item-dropping Filter completion, nested batch scopes, cross-invocation joins and automatic model scope planning remain pending.

Register `createExclusiveBranchMergeCapability()` explicitly for `rejoin-exclusive-branches`. Its only parameter is an existing IF's `sourceNodeId`; code owns the official Merge 3.2 append parameters and two input ports. Core verifies distinct complete alternatives and retains route-specific response availability. Batch validation requires every IF output to return through a one-to-one linked path and rejoin inside the same scope. IF declares `partitionsInputItems`; rejoin declares `rejoinsExclusiveOutputs`, rather than claiming a single-input contract. Normal Merge Append is unchanged. Custom compilers must preserve these declarations.

An explicit `createPassThroughCapability()` skip branch returns the actual item unchanged, not an empty completion item. In n8n 2.37.10 with `executionOrder: 'v1'`, waiting Merge handles an alternative that never ran after runnable work is exhausted. No `alwaysOutputData`, forced execution order changes or missing-response defaults are added. A response from only the executed business branch is still unavailable unconditionally after rejoin.

`npm run test:conditional-batch-local-n8n` checks 14 deterministic cases with five distinct API nodes, all/mixed/no eligible items at batch sizes 1/2/10, empty input and contract/assertion failures. It collects all original detail items once after completion; skipped items are not successful business API responses. Import JSONs/report: `.local-artifacts/conditional-batch/`. These tests do not measure real-model planning or call business services. Source contracts and validators remain separated under `src/schemas/`, `src/types/`, core `src/workflow/` and n8n `src/workflow/batch/`.

`npm run test:batch-iteration-local-n8n` verifies ten cases on n8n 2.37.10, including five API instances, multiple batch sizes, linked cross-run references and one final array-body request. Import JSONs/report live under `.local-artifacts/batch-iteration/`; regenerate with a running endpoint before execution. Types and schema are separated in `src/types/batch-execution.ts` and `src/schemas/batch-execution-schema.ts`; validation/lowering live in `src/workflow/batch/` and reuse `compile-validated-workflow-fragments.ts`.

`npm run test:batch-item-join-local-n8n` verifies eight complete-branch cases on the same pinned runtime. Reordered branches and identical original values retain distinct ancestry; source/branch contract errors and wrong media type stop later batches and final collection. The three-branch/five-API case makes 13 requests for three items and collects once. Local import JSONs/report: `.local-artifacts/batch-item-join/`. These deterministic fixtures test runtime behavior, not Chomsky selection quality or business APIs.

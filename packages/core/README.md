# @openapi-flow/core

Zod `^4.6.5` is a required peer, shared with the host rather than installed as a separately pinned runtime copy. Development tests use 4.6.5; the strict installed-consumer check also uses the host's 4.6.7. This preserves the public schema type boundary without casts or dependency overrides.

Version **0.3.9**. Canonical draft, clarification and runtime-input APIs described below are included in this release source. Requirement-edit schema descriptions distinguish explicit record editing from workflow behavior changes; runtime validation rules and typed human answers are unchanged. Original-choice follow-ups still derive their display and typed reply in Core. Ajv 8.20.0 does not correctly validate a declared `properties.__proto__`; generated validation may reject valid data or omit that property's constraints. This previously accepted limitation remains unchanged, without renaming data or skipping its failing regression. See the [release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.9.md) for publication and host status.

Native and fixed-material connection planning accept the optional, existing `WorkflowEntryPointContract` as `entrypoint`. Core validates and snapshots this owner-provided start alongside the other inputs; it does not infer one when absent, add a selectable trigger or let model output modify it.

Connection planning accepts explicit current `deferredApiInputIds` derived with `collectDeferredApiInputSlots`. Missing inputs remain absent and require canonical template preflight before execution; supplied values and the full DAG are still validated. See [input deferral](https://github.com/carefreelife98/openapi-flow/blob/main/docs/deferred-connection-planning.md).

canonical `gapNodes` and the separate `createWorkflowDraftCapabilityGap`,
`inspectWorkflowDraftCapabilityGap`, `describeWorkflowDraftCapabilityGap` functions
preserve explicit unsupported roles, original evidence and supplied contract
identities without inventing data outputs. See the
[gap contract](../../docs/workflow-draft-conversation-host.md#explicit-capability-gaps).

`requestedInputs` metadata tracks scenario-required presence separately
from OAS requiredness. Questions, answers, canonical calls and execution slots
retain the same pointers; `listMissingRequestedApiInputs` shares deterministic
presence checks with compiled runtimes. Original schemas and actual values remain
unchanged. See [requested inputs](../../docs/workflow-draft-api-binding-questions.md#값이-미정인-선택-입력의-요청-추적).

request-dependency intent has its own description, Zod schema and
`resolveWorkflowDraftApiBindingIntent` receipt. Supplying that `inputIntent` to
API binding planning restricts mappings/questions to validated selected targets
and requires complete coverage. OAS literal generation and missing-required-value
checks remain unchanged. See [input intent](../../docs/workflow-draft-api-binding-questions.md#요청-의도를-먼저-고정하는-선택-단계).

semantic edits support explicit restoration of currently removed
requirements, without copying historical replacement values. See
[requirement restoration](../../docs/workflow-draft-requirement-restoration.md).

answer-source resolution and replayable input-answer evidence are
documented in the [answer extraction guide](../../docs/api-input-answer-extraction.md).

combined graph planning adds captured source contexts, explicit
prepared/additional instance assembly and verifiable planning records under
`workflow/graphs`. Shared API/native data capture has its own schema/type modules.
See the [combined graph guide](../../docs/graph-planning-records.md). A legacy
executable gap report is explicitly marked unvalidated, not certified as a DAG.

connection planning has deterministic source capture, plan assembly
and provenance creation/verification in `workflow/connections`. See the
[connection planning guide](../../docs/connection-planning-records.md). These APIs
do not call a model, modify fixed materials or replace full DAG validation.

native-plan contracts preserve additional instances separately from
prepared materials, derive gap identities/implementation receipts, and validate
optional model/code-only provenance. Empty explicit OAS inventories form real empty
catalogs; supplied invalid documents still fail. See
[native planning ownership and records](../../docs/native-planning-records.md).

binding-planning records preserve actual proposed pointer mappings,
per-call reasons and original supplied OAS/native context. Core snapshots only
declared source data and verifies records against the original input and plan.
See [binding decisions and provenance](../../docs/binding-planning-records.md).

literal-generation records distinguish original proposed literals from
confirmed/bound inputs. Core snapshots data, owns the projected-contract evidence
and verifies persisted records against the original generation input. No values or
reasons are fabricated when no literal fields remain. See
[literal attribution and call roles](../../docs/literal-generation-records.md).

request-format decisions distinguish no body, a sole declared format,
explicit model choice and the approved explicit-null default policy. Core owns
resolution and exact optional scenario/requestBody evidence; model reasoning does
not impersonate code's default choice. Format logic is grouped in `arguments/media`.
See [request media decisions](../../docs/request-media-decisions.md).

discovery explanation APIs snapshot and validate the actual scenario,
candidate metadata and original operation identities. Code derives evidence from
the selected API, offered alternatives or entire supplied inventory; models never
write source quotes or contract claims here. See
[API selection explanations](../../docs/api-selection-explanations.md).

semantic edit questions declare an explicit owner. Independent semantic
questions still block their actual scope; concerns owned by selected API/native,
requirement or connection stages retain exact provenance and route only to that
verified stage. They do not create duplicate workflow blockers or fabricate answers.
`describeWorkflowDraftClarificationOwnership` describes those code-resolved owners.
The wire schema also makes whole-request `no-change` exclusive with real edits.
See [question ownership](../../docs/workflow-draft-clarification-ownership.md).

canonical drafts require code-owned `requirementHistory`. Explicit
revisions/withdrawals preserve prior snapshots and exact evidence, while active
planning messages remain separate from the audit transcript. Typed requirement
answers use a candidate context without rebasing the original plan. See
[requirement history and current evidence](../../docs/workflow-draft-requirement-history.md).

`describeWorkflowDraftSelectedNodes` and
`describeWorkflowDraftRequirementEdit` expose selected API/native identities before
request values or producer contracts are ready. The derived
`createWorkflowDraftRequirementAnswerSchema` bounds typed human scope answers;
Core re-derives that authority during staging and assembly. Missing materials still
block final assembly. See [requirement edits and selected scopes](../../docs/workflow-draft-requirement-edits.md).

[typed API binding questions](../../docs/workflow-draft-api-binding-questions.md)
use the selected OAS input/source contracts. Code owns question wording, identities,
schemas and validated source choices. Explicit human `answers` resolve the same
proposal without inventing values, repairing outputs or exposing partial bindings.

`describeWorkflowClarificationAnswerRevision`,
`reviseWorkflowClarificationAnswers` and `validateWorkflowClarificationAnswerRevision`
provide atomic typed answer replacement and question reopening without a model.
Original snapshots and explicit transition receipts remain auditable; current
answer evidence is separated from superseded receipts. See [answer revisions](../../docs/workflow-clarification-answer-revisions.md).

review suggestion contracts validate the current read-only review projection,
original evidence and configured budgets, then allocate stable suggestion identities.
`adoptWorkflowReviewSuggestion` creates an explicit user-adoption receipt, never an
edit or executable workflow. See [review follow-ups and adoption](../../docs/workflow-review-suggestions.md).

[selected API addition/replacement primitives](../../docs/workflow-draft-api-call-planning.md)
derive the new request from its full original OAS key, validate actual source mappings,
exclude bound/confirmed fields from literal schemas and return typed missing-input
questions or explicitly enabled runtime slots. Identities, graph metadata, evidence
text and validation remain code-owned; existing sibling settings are preserved.

native additions expose the actual selected implementation schema while code retains the instance ID/capability. `describeWorkflowDraftNativeNodeAddition`, `createWorkflowDraftNativeNodeAdditionSchema` and `resolveWorkflowDraftNativeNodeAddition` validate configuration/ownership or return questions, without automatic connections or adoption. `resolveWorkflowDraftNativeNodeParameterOwnership` separately derives an immutable ownership/remaining-literal contract for staged mixed-field generation. See [native instance additions](../../docs/workflow-draft-native-node-addition.md).

Independent native configuration accepts ordered `replies` containing the original code-identified question and exact user text. Core validates target/material fingerprints, original proposals and answer order without rewriting the scenario or selection. Missing plan-time literal values are handled by the value stage, not treated as missing capabilities during role selection. These receipts check consistency, not caller authenticity; see [native setting replies](../../docs/native-runtime-inputs.md#answering-a-selected-instances-questions).

`resolveNativeMaterialSnapshot` and draft-facing `resolveWorkflowDraftNativeSnapshot` bind actual producer contracts independently for each content revision. Pending references expose no previous output schema; edit staging discovers cascading consumer repairs after explicit upstream decisions. Original definitions, full schema checks and atomic DAG validation remain intact. See [material snapshots](../../docs/native-material-snapshots.md).

`describeWorkflowDraftNativeReferenceRepair`/`resolveWorkflowDraftNativeReferenceRepair` derive one actual consumer task, validate implementation-owned parameter locations and construct only reference patches. Questions produce no partial repair; original settings and complete-graph validation remain authoritative. See the [repair boundary and remaining composition work](../../docs/workflow-draft-native-reference-repairs.md).

native parameter editing derives selected field types from the registered implementation, preserves unpatched settings and validates original Zod refinements and actual response/native sources. Runtime ownership is explicitly opt-in; missing choices yield scoped questions, not dummy values or partial resolutions. See the [native parameter-edit contract](../../docs/workflow-draft-native-parameter-edits.md).

`describeWorkflowDraftConnectionEdit`/`resolveWorkflowDraftConnectionEdit` derive actual staged ports/reference constraints and validate explicit connection deltas through atomic assembly. Unrelated edges are retained; incomplete contracts/repairs return visible prerequisites, not fake readiness. See the [connection-edit contract](../../docs/workflow-draft-connection-edits.md).

`stageWorkflowDraftEdit` exposes explicit pending edit results and unavailable source contracts without pretending incomplete content is canonical. `describeWorkflowDraftApiBindingEdit`/`resolveWorkflowDraftApiBindingEdit` support source-grounded changes for an existing API or actual consumer repair; `validateApiBindingAssignment` shares the complete validator's declaration checks without fabricating unrelated binding lists. See the [staged binding-edit boundary](../../docs/workflow-draft-api-binding-edits.md).

scoped API input-edit contracts derive target schemas from the selected original OAS and validate source-grounded typed values before generating precise patches. `createWorkflowDraftApiInputEditContract`, `createWorkflowDraftApiInputEditValuesSchema` and `resolveWorkflowDraftApiInputEdits` are usable without a model; the LangChain adapter adds separate target/value calls. See [ownership, validation and pending-input semantics](../../docs/workflow-draft-api-input-edits.md).

`prepareWorkflowDraftEdit` and `assembleWorkflowDraftEdit` accept explicit step results, preserve unpatched request/native values and derive consumer repair work from declared references. Final assembly returns a checked candidate revision with structural impact; it never mutates the original draft or repairs missing mappings/edges silently. These are deterministic host-to-core contracts, not generic schemas for model generation. See the [scoped assembly guide](../../docs/workflow-draft-edit-assembly.md).

`createWorkflowDraftEditPlan`, `validateWorkflowDraftEditPlan` and `describeWorkflowDraftEditContext` bind explicit semantic edits to the current draft, contracts and request messages. Code owns version fingerprints, new instance IDs and direct stage metadata; no draft mutation or implicit repair occurs. This is the analysis boundary, not a complete edit assembler. See the [edit analysis contract](../../docs/workflow-draft-edit-analysis.md).

native input contracts add `collectNativeRuntimeInputSlots`, `inspectNativeRuntimeInputs` and `createWorkflowRuntimeInputsSchema`. Capabilities declaring runtime-independent ports, references and output contracts can defer whole objects or explicitly selected field pointers while preserving other literals. Code derives identities and validates the full combined object without changing actual values; canonical drafts and API/native readiness remain separate. Export individual slot schemas to preserve independent resource scopes. Scoped edits, staged new draft-native additions and independent role/value planning support explicit field ownership. `resolveNativeInstanceSelection`, `describeNativeNodeConfiguration` and `resolveNativeNodeParameters` derive/validate the standalone contracts without model calls or fabricated drafts/edges. See the [native runtime input contract](../../docs/native-runtime-inputs.md).

requirements APIs add `createWorkflowClarificationRound`, `resolveWorkflowClarificationReplies`, explicit question-budget configuration and source checks. Questions have code-owned identities; partial/deferred answers preserve confirmed facts without automatically adopting suggestions. See the [clarification contract](https://github.com/carefreelife98/openapi-flow/blob/main/docs/workflow-requirements-clarification.md). These additions are not in npm 0.2.0.

source additions provide `inspectApiArgumentRequirements`, `validateApiInputAnswers`, `applyConfirmedApiInputs`, `resolveApiSelectionAnswers` and `createApiInputAnswersSchema`. Snapshot/call-scoped `confirmedInputs` are excluded from literal generation and applied by code. These additions are not included in npm 0.2.0; see the [conversation guide](https://github.com/carefreelife98/openapi-flow/blob/main/docs/conversational-generation.md).

Engine-independent OpenAPI catalog, full operation contract lookup, OAS-derived Zod request schemas and argument validation. Version `0.2.0` is published; `0.1.0` has a different API.

`createWorkflowPlanningCapabilities({ capabilities, apiCallIds })` specializes only capabilities that explicitly provide `createPlanningParametersSchema(context)`. Existing runtime schemas and capability objects are not mutated; custom definitions without the hook retain their schema. `validateNativeApiResponseReferences({ nativeNodes, capabilities, apiCallIds })` checks the API identities declared by each implementation's `responseReferences` and per-port `inputReferences`. It does not inspect arbitrary JSON field names, validate native-output identities as API IDs, infer a missing producer or repair a reference. These functions establish early planning boundaries; execution order and response contract validation remain separate.

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

`listApiResponsePointers(operation)` describes finite response-body declarations grouped by the original response key and media type. Each `declaredPointers` entry has an exact RFC 6901 body pointer, its `schemaLocation`, and the type/description actually declared by the schema. Empty pointer means the entire response body. Composition and conditional branch locations stay distinct; enum/example/default data are not traversed as schemas. OAS 3.0 nullable syntax is normalized without changing the operation.

`dynamicLocations` identifies dictionaries, pattern keys, homogeneous array items, unexpanded references, recursive schema boundaries and unconstrained values. It never invents a dictionary key or a sample item index. A tuple's explicitly declared positions can be listed, but their runtime existence is not guaranteed. This catalog is advisory, not an exhaustive schema projection, a whitelist, a schema satisfiability proof or a promise that optional/conditional fields exist. The full OAS and existing binding/runtime validators remain authoritative; missing response values still fail without substitution.

`WorkflowGraphPlan` describes native capability settings, named-port edges, starts and unmet requirements. `validateWorkflowGraphPlan` uses host-supplied capability contracts to check graph identity/ports/cycles, exclusive-branch join compatibility and API response availability on every incoming route. It does not prove scenario coverage or exhaustively validate response pointer types against every OAS schema dialect; missing fields fail in the runtime compiler. This contract is engine-independent and does not import an n8n node registry.

Our code is MIT-licensed. Core has no n8n SDK dependency. Dependency licenses remain separate; see [third-party notices](./THIRD_PARTY_NOTICES.md).

`ReviewableWorkflowApiMaterial` discriminates ready calls with real arguments from blocked calls with OAS identity, declared bindings and causal gap IDs, but no fabricated arguments. `createReviewableWorkflowGraphPlan` adds explicitly identified gaps and blocked calls to the proposed DAG, derives its actual roots, and invokes `validateReviewableWorkflowGraphPlan`. Topology and binding-contract validation are never skipped because of gaps. Blocked/gap nodes have ports but no available API response. `validateApiBindingAssignments` checks assignments independently of execution readiness; `validateApiBindingGaps` requires every reported gap to identify a known call and an OAS-declared request pointer. The strict `validateApiBindingPlan` still rejects all gaps. These contracts do not imply that review workflows may be executed.

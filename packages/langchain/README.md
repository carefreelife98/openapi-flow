# @openapi-flow/langchain

## Unreleased: native repair separates flow context from reference authority

`generateWorkflowConnectionNativeParameters` receives the code-derived read-only
`workflowContext` alongside the original, scoped value-producer contracts. An
empty `sourceNodeIds` list does not erase surrounding workflow roles and ports.
The model still chooses only the target's remaining settings in one structured
call; no fixed input count, old-setting substitution or extra review call is
introduced. Local validation continues to reject references outside the selected
producer scope, including identities visible only in the read-only overview.
This candidate is not yet installed in Qoopilot or published on npm.

## Unreleased candidate: verified binding key and path IDs

When `literalSourceMessages` are supplied, the existing source-selection call can
extract explicitly supplied dynamic keys or relative paths with their original
text/JSON source identities. Core validates the original value and assigns a
node-scoped ID. Field planning selects only offered `keyId` or `pathId` objects;
code copies the verified original strings into the final pointer. Declared OAS
properties remain fixed code-owned fields. Original schema and DAG checks remain.
Without verified key sources, dynamic-name candidates are absent from model
choices; manual core bindings still support explicit names and paths.

This replaces the experimental exclusion-regex implementation and adds no model
call or dependency. Source extraction still requires semantic model judgment;
source membership does not prove that a key is relevant or exists at runtime.
Actual model source and field calls both accepted the new schema. After correcting
the host's omitted native-setting answer, one original price-call replay returned
a valid collected-array binding in two calls without gaps. A separate all-API
binding replay still failed: discovery selected one producer but attributed a key
to another unselected producer. The independent owner choices remain a candidate
design issue; neither replay is a full-scenario pass. Published 0.5.1 and installed
host packages are unchanged.

## Unreleased: native source provenance

`createNativeOutputContracts` now includes optional `provenance` generated from
registered capability names, descriptions and implementation-declared input
references. Discovery and hydrated binding context retain the original output
schema and this metadata. Per-call discovery excludes native outputs whose known
input lineage already requires the target API, including transitive native
consumers. The resolver also rejects attempts to select these excluded IDs.
External contracts without provenance remain explicitly unknown; absence does
not prove independence. Final type, reference and DAG checks remain required.
Snapshot fingerprints include provenance: stored source selections must be
replanned if their supplied provenance changes. Published 0.5.1 is unchanged.

## Unreleased: code-owned enum dispatch

With `generateApiArguments({ selectOasEnums: true })`, development source derives
unanswered enum targets from the original OAS and `requestedInputs`. The literal
model no longer returns a separate `enumIntentInputs` dispatch list. An omitted
literal therefore cannot prevent an explicitly requested enum from reaching its
ID-only selection stage merely because the model says another stage owns it.
Display explanations never schedule work. Confirmed, bound and supplied values
remain protected, and unrequested optional fields are not selected. The enum
model can return `not-supplied`; code does not choose defaults or invent values.
This change is not yet available in the published 0.5.1 packages.

0.4.2 adds `planWorkflowIntent`, one independently callable semantic overview
stage before API/native selection. Its roles distinguish current work, conditional
possibilities and exclusions without concrete API IDs, values or ports. The host
owns scheduling, checkpoints and requirement revisions. Presentation reasons are
requested in the same planning call but are not a gate for valid execution fields.
Actual literal provenance and contract checks stay intact. See the
[0.4.2 record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.4.2.md).

## Unreleased: scope and full native-selection review

`reviewNativeInstanceSelection` can classify a reported gap as `not-required`
when it concerns unrequested, expressly excluded or only optional future work.
Code attaches the unchanged scenario, keeps the original selection and derives
`needs-reselection`, never execution approval. A display reason is optional. Other
unsupported needs and business decisions retain their existing blocking priority.
The host must explicitly request a fresh selection and charge it to its budget.
The new union member is not part of public 0.4.1; exhaustive assessment switches
must handle it when adopting a release that includes this change.

With explicit `reviewInstances: true`, review also requires an assessment of every
selected instance ID and one `coverageAssessment` of the entire selection. This
includes gap-free and empty selections: dropping all roles cannot skip the review.
Roles are assessed as required, not required or requiring a business decision;
coverage distinguishes covered, reselection, unsupported behavior and a business
decision. Code checks closed IDs, complete maps and unchanged
source. These checks do not prove the model's interpretation of user intent.

Without that option, the existing reported-gap shape and zero-model-call behavior
for a gap-free selection remain. Full review always makes one explicit model call;
there is no automatic retry. The example graph accepts
`reviewOptions: { reviewInstances: true }`, includes it in the checkpoint fingerprint
and requires a matching full review before readiness. Changing review mode cannot
reuse a checkpoint. Selection, review and reselection all consume the host's
existing shared budget; an exhausted budget never becomes readiness.

Actual-model diagnostics on one original scenario exposed both an unrequested role
and loss of required collection after reselection. The full review prevented that
empty-selection shortcut, but one detail-model run still exhausted its six-call,
two-reselection budget. An explicitly configured planning-model control on the same
scenario and API contracts passed native selection/review in two calls. Neither run
is a full-workflow or five-scenario quality result. No model-routing default or
installed Qoopilot package was changed in those diagnostics. These APIs are included
in the 0.4.2 candidate; publication is tracked separately in its release record.

0.4.0 adds independent selection/goal review, scoped connection
outlines and originating-stage recovery planners. Each call is independently
composable; loops, budget, checkpoints and user review stay in the host. Connection
steps select explicit start/finish intent, while code resolves a unique actual
port and validates the whole patch. No missing edge is treated as completion.
Custom model doubles must follow the supplied structured schema. Publication and
accepted limitations are tracked in the
[release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.4.0.md).

0.4.0 source adds `reviewNativeInstanceSelection` and explicit
`selectNativeNodeInstances({ feedback: { selection, review }, ...source })`.
Review makes at most one model call (zero with no reported gaps), uses exact supplied
gap IDs and producer/capability choices, and retains the original selection unchanged.
Only `needs-reselection` feedback permits a new explicitly requested selection;
unsupported behavior and business decisions cannot be bypassed this way. Ordinary
selection and configuration validation still applies to the new candidate. The host
owns budgets, checkpointing, user questions and whether to invoke either function;
there is no hidden loop, output repair or execution approval. Classification is model
evidence, not a proof of scenario correctness. See [native planning](../../docs/native-feature-planning.md).
This is not part of published 0.3.18.

Version **0.3.18** distinguishes independent inputs, selected response sources,
missing requested sources and partially missing sources in the model output.
Code constructs only the fixed fields implied by the validated decision. Invalid
extra fields fail rather than being stripped. Public function inputs/returns are
unchanged; custom model/test doubles must follow the supplied structured schema,
not the previous internal flat wire shape. See the
[release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.18.md).

Version **0.3.17** adds `createWorkflowConnectionGoalRejection`, its public Zod
schema/type and optional goal-call `rejectedProposals`. Original JSON output and
validation reasons remain private host feedback. Each library call still performs
one model invocation; only the host owns iteration and budgets. Clarification
receives all discovery metadata, with detailed schemas retained for later stages.
The broad-query timeout remains. See the
[release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.17.md).

Version **0.3.16** adds `planWorkflowConnectionGoals` and
`planWorkflowConnectionStep`. Each makes one structured model call; the host owns
looping, checkpointing and review. Native planning stages accept optional abort
signals. See the [connection guide](https://github.com/carefreelife98/openapi-flow/blob/main/docs/incremental-connection-planning.md)
and [release status and limitations](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.16.md).

Version **0.3.15** adds `selectApiBindingSources`, `planApiCallBindings` and
`planApiBindingsByCall` for scoped API binding work. The model no longer needs to
regenerate a whole selected-call inventory in this path. Code checks complete
coverage and cross-call cycles, and the host explicitly chooses concurrency and
stores validated progress for resume. Existing `planApiBindings` stays compatible.
See [scalable bindings](https://github.com/carefreelife98/openapi-flow/blob/main/docs/scalable-api-binding-planning.md)
and the [release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.15.md).

Version **0.3.14** adds source-owned structured errors and preserves initial
argument provenance failures across optional enum selection. Existing prompts,
values, schemas and retry behavior are unchanged; the host still chooses the
planning inventory. The owner accepted the n8n adapter's unresolved upstream
Zod 3 advisory for this release on 2026-10-25; this does not clear the audit.
See the [0.3.14 release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.14.md)
for actual publication and host status; preparation is not publication.

API selection and binding planning expose Core's shared `OpenApiFlowError`
diagnostic. Existing native/graph planning error subclasses retain their identity,
failure payload and cause. A typed outer error can now wrap a previously untyped
exception; use `cause` for its original identity and serialize only the diagnostic.
No model-output repair or hidden retry is added, and not every internal model
call/provider-specific timeout has been migrated.

Zod `^4.6.7` is a required host peer, alongside `@langchain/core`. The three libraries share the host's Zod for public schema types instead of creating an isolated pinned copy. Modern package managers install compatible missing peers; a host that directly creates Zod schemas should declare its own compatible Zod dependency.

Version **0.3.13**, with matching `@openapi-flow/core@0.3.13`. Native edit target selection and value generation share actual code-derived API/native source identities and response contracts. Connection edits also forward the optional supplied entrypoint rather than infer one. Model output remains subject to the existing deterministic validators; no output filtering or hidden retries are added. Optional enum interpretation from 0.3.11/0.3.12 remains available. The host supplies its LangChain model and owns LangGraph, storage and review policies. The Core/n8n Ajv `properties.__proto__` limitation and actual publication/host status are documented in the [release record](https://github.com/carefreelife98/openapi-flow/blob/main/docs/releases/0.3.13.md); this release does not rewrite OAS or values to hide it.

Optional review follow-ups distinguish unapproved review material from actual user intent and request user-facing text without internal bookkeeping IDs. These are source instructions, not a semantic correctness guarantee or output sanitization. See the [follow-up contract](https://github.com/carefreelife98/openapi-flow/blob/main/docs/workflow-review-suggestions.md).

`planNativeNodes` and `planWorkflowConnections` accept optional `entrypoint`, using core's existing owner type. When the host compiles a Manual Trigger workflow, pass `entrypoint: describeN8nManualTrigger()` from `@openapi-flow/n8n` to both stages. The same contract reaches the model input and original planning evidence, never its output schema. It describes an already supplied start, not a missing selectable capability. `orchestrateWorkflow` forwards it; omission does not invent one.

`planWorkflowConnections` forwards explicit current `deferredApiInputIds`. Code derives their original slot contracts, validates existing request values and checks the complete graph; the model chooses connections, not replacement values. See [input deferral](https://github.com/carefreelife98/openapi-flow/blob/main/docs/deferred-connection-planning.md).

`analyzeWorkflowDraftEdit` offers `report-capability-gap` in its existing
bounded semantic call. The model selects a role, scoped finding and mandatory
reason; Core owns IDs, original messages and inventory capture. No separate gap
agent, parameter-generation call, retry or synthesized contract is introduced.
See the [gap contract](../../docs/workflow-draft-conversation-host.md#explicit-capability-gaps).

`generateWorkflowDraftApiCallArguments({ trackRequestedInputs: true })`
asks for requested input pointers in the existing OAS-typed value call, including
optional literals whose actual value is not known. Core checks declaration and
presence; no extra model call, invented value or changed OAS required list is used.
See [requested inputs](../../docs/workflow-draft-api-binding-questions.md#값이-미정인-선택-입력의-요청-추적).

`selectWorkflowDraftApiBindingInputs` selects only requested
response-to-request target pointers before producer mapping. Passing its
`inputIntent` to `planWorkflowDraftApiCallBindings` narrows both the model-visible
target contracts and the output schema. An empty selection makes no binding-model
call; required literals remain the argument stage responsibility. These primitives
remain independently callable. See [input intent](../../docs/workflow-draft-api-binding-questions.md#요청-의도를-먼저-고정하는-선택-단계).

`analyzeApiInputAnswers` always returns code-checked `sources` for
revalidation; model reasons remain optional. The canonical example supports
[natural input replies](../../docs/canonical-natural-input-replies.md).

`analyzeWorkflowDraftEdit` offers `restore-requirement` only for
code-derived removed IDs. See
[requirement restoration](../../docs/workflow-draft-requirement-restoration.md).

`analyzeApiInputAnswers` selects code-owned JSON candidate IDs or
unquoted text-boundary IDs. The model writes neither values nor `sourceText`;
Core resolves original spans and validates them without coercion. See the
[answer extraction guide](../../docs/api-input-answer-extraction.md).

`planWorkflowGraph` and `planReviewableWorkflowGraph` accept
`includeExplanations: true` for same-call strategy, native-instance and edge reasons,
with separate code-owned source/verification records. Explicitly empty native
registries support API-only plans without requesting impossible node fields.
See the [combined graph guide](../../docs/graph-planning-records.md).

`planWorkflowConnections({ includeExplanations: true })` returns the
original execution plan plus separate per-new-edge/blocked-call reasons and
code-owned source receipts. No explanation-only call is added. The two combined
node-and-graph planners have their own explanation contract. See the
[connection planning guide](../../docs/connection-planning-records.md).

`planNativeNodes({ includeExplanations: true })` records same-call reasons
for each new instance or an explicit no-additions decision. Code attaches the source
context and implementation receipts. Runtime-enabled model contracts choose an
explicit `parameterSource`; code derives empty runtime parameters/flags, never from
placeholder text. See [native planning records](../../docs/native-planning-records.md).

`planApiBindings({ includeExplanations: true })` asks for a short reason
per call in the existing strict function call. Original gap descriptions remain
their reasons; code owns the supplied-contract evidence in `bindingPlanning`.
Executable `calls[].bindings` contain no audit metadata. See
[binding planning records](../../docs/binding-planning-records.md).

`generateApiArguments({ includeExplanations: true })` adds a same-call
short reason and a code-owned `literalGeneration` record for the original proposal,
not the final values after confirmed-input merge. Optional `purpose` scopes repeated
API roles. No remaining literals means zero calls and no required model; otherwise
a supplied structured-output model is required. See
[literal records and source boundaries](../../docs/literal-generation-records.md).

`analyzeApiRequestMediaType` returns the typed origin/resolution record,
with optional same-call reasons and code-attached original scenario/requestBody
evidence. Zero/one format needs no model; explicit null alone uses the existing
documented default. `selectApiRequestMediaType` remains the string-only projection
of the same implementation. Choose one API, not both in sequence. See
[request format decisions](../../docs/request-media-decisions.md).

`selectApiOperations` and `analyzeApiSelection` accept optional
`includeExplanations: true`. The same call returns only a short reason per decision;
core attaches the exact scenario and chosen/alternative/full discovery inventory.
Omission preserves the standalone selector's existing non-explanation output.
This is discovery provenance, not full OAS contract or semantic correctness proof.
See [API selection explanations](../../docs/api-selection-explanations.md).

selected-API binding questions now emit typed current-input pointers and
actual source alternatives, not free-form questions or claims about missing OAS.
Core renders/validates the question and resolves explicit human choices without
another model call. See [scoped binding questions](../../docs/workflow-draft-api-binding-questions.md).

`suggestWorkflowReviewFollowUps` makes one bounded structured-output call
for the actual current HITL boundary. The model proposes optional messages and source
references; core owns identities, evidence text and explicit adoption. No suggestion
becomes intent or a graph patch without a human action. See [the contract](../../docs/workflow-review-suggestions.md).

`planWorkflowDraftApiCallBindings` and `generateWorkflowDraftApiCallArguments`
separate one selected API instance's source choices from OAS-typed literal extraction.
Code-known mappings and fully owned inputs require no model-generated constants.
Optional literal extraction uses function calling with unchanged local validation,
not strict output that would force absent OAS values. See the
[API addition/replacement guide](../../docs/workflow-draft-api-call-planning.md).

`generateWorkflowDraftNativeNodeAddition` configures one code-identified `add-native-node` step with the actual registered schema. Optional `selectWorkflowDraftNativeNodeParameterOwnership` separates explicit field ownership from typed remaining values, so hosts can checkpoint/review between calls. Entirely deferred or fixed strict-empty settings need no value model. Evidence selects actual IDs instead of generated quotations. Connection planning and host review remain separate. See [native additions](../../docs/workflow-draft-native-node-addition.md).

`planWorkflowDraftNativeReferenceRepair` uses one bounded call for an actual native consumer task. Model output contains only code-keyed source decisions or questions; core owns reference locations, patches and validation. See the [native repair contract](../../docs/workflow-draft-native-reference-repairs.md). Material-dependent registry refresh and complete conversational composition remain unfinished.

`selectWorkflowDraftNativeParameterEditTargets` and `generateWorkflowDraftNativeParameterEdits` split an existing native revision into target choice and typed parameter values. Core owns schemas, identity and deterministic patches; removal/explicit field-deferral work needs no value call. Opted-in field deferral preserves unrelated literals/owners, and set transfers only the selected owner back to a literal. See the [native parameter-edit contract](../../docs/workflow-draft-native-parameter-edits.md). New draft-native instances use their separate ownership/value stages. Independent hosts can use `selectNativeNodeInstances` followed by `generateNativeNodeParameters` for mixed-field planning without constructing a fake draft. Each invocation is separately checkpointable; no nested planning calls are hidden in the compact planner.

`planWorkflowDraftConnectionEdit` makes one bounded connection-delta call only after actual material results and consumer repairs resolve. Its schema constrains real endpoint/port pairs and editable existing edges; code validates the full candidate DAG. Retained edges and parameter values are not regenerated. See the [connection-edit contract](../../docs/workflow-draft-connection-edits.md); material-dependent native repairs, new-instance models and full conversational host integration remain unfinished.

`planWorkflowDraftApiBindingEdit` makes one bounded source/ownership decision call for a pending reference-edit step or a code-derived consumer repair. Core re-derives staged authority, preserves unrelated mappings and values, and rejects stale/unknown sources or incompatible declarations without transforming data. Unknown producer choices return scoped questions, not a partial applied edit. Literal displacement is an explicit `replace-literal-with-binding` decision. See the [binding edit/staging contract](../../docs/workflow-draft-api-binding-edits.md); connection/native edits use separate stages. Material-dependent native repair, new-instance composition and host review/resume remain unfinished.

`selectWorkflowDraftApiInputEditTargets` and `generateWorkflowDraftApiInputEdits` split an existing literal edit into target selection and OAS-typed actual-value extraction. Core owns field schemas/IDs, exact source checks and deterministic patches; unchanged values are preserved. Missing actual values return `needs-input` without a partial resolution; removals need no value call. Hosts can review between the two calls or supply structured targets/values directly through core. See the [scoped input-edit contract](../../docs/workflow-draft-api-input-edits.md). Binding, connection and native edits use separate stages; registry refresh, new-instance models and complete LangGraph composition remain unfinished.

`analyzeWorkflowDraftEdit` makes one bounded call for semantic change decisions, supplied candidates and existing targets. Core resolves original OAS identities and validates exact current-request provenance, stale state and code-owned IDs. Values, settings, bindings, connections and atomic application remain separate stages. No whole-workflow regeneration or automatic retry is added. See the [edit analysis boundary and remaining composition](../../docs/workflow-draft-edit-analysis.md).

`planNativeNodes({ ..., allowRuntimeParameters: true })` offers explicit runtime parameter ownership only for implementing capabilities. One schema/material factory supplies both the output alternatives and HumanMessage `parameterSources`, so the model receives the same contract it may return. Omission stays literal-only; the model never supplies runtime slot IDs or schemas. Older combined planning compositions do not automatically forward this option. See the [native runtime input contract](../../docs/native-runtime-inputs.md).

`generateNativeNodeParameters` can resume a `needs-clarification` result with `replies: [{ question, text }]`, retaining the same selected role, original scenario and source snapshot. Append another pair for each actual follow-up; stale or out-of-order questions fail before invocation. The model receives validated question/reply data separately and still returns only the same typed setting decision. It does not repeat capability selection or acquire graph/ownership authority. The [native setting reply guide](../../docs/native-runtime-inputs.md#answering-a-selected-instances-questions) shows the host boundary.

`clarifyWorkflowRequirements({ model, context, limits, options? })` makes one described structured-output call for user-grounded requirements and necessary categorized questions. Optional explanations/suggestions are removed from the output schema when disabled. Core validates exact source references and allocates identities; the output has no runtime argument values and does not automatically adopt suggestions. Official Zod inline serialization owns the wire schema while the original Zod schema validates the response. See the [clarification contract](https://github.com/carefreelife98/openapi-flow/blob/main/docs/workflow-requirements-clarification.md). This does not add a host graph or guarantee model semantic accuracy.

source additions provide `analyzeApiSelection` and `extractApiInputAnswers`. The former separates consequential API-role choices from absent capabilities; the latter extracts only pending, OAS-typed answers and checks their complete value spans against the user's actual reply. Existing selectors remain available. These additions are not included in npm 0.2.0; see the [conversation guide](https://github.com/carefreelife98/openapi-flow/blob/main/docs/conversational-generation.md).

Independent model calls for OpenAPI workflows. Version `0.3.9` depends on matching core `0.3.9`.

- `selectApiOperations`: choose catalog candidates and describe capability gaps with structured output.
- `planApiBindings`: selected OAS contracts and optional declared `nativeOutputs` → output-to-request pointer bindings and request-data gaps, independently of native control-flow planning. API pointers read response bodies; native pointers read the declared JSON output. Neither changes value types or semantics.
- `generateApiArguments`: propose one call's OAS-typed request values and report missing inputs.
- `selectApiRequestMediaType`: choose among the full OAS body's declared formats using scenario-grounded structured output. Zero or one format needs no model call. Unspecified or ambiguous multiple-format requests use core's deterministic `selectDefaultApiRequestMediaType`: JSON, then form-urlencoded, then other concrete keys, then wildcard keys; ties use code-point order. Only declared formats can be chosen, explicit choices remain intact and invalid model output still fails.
- Requests with no remaining literal inputs return empty values without invoking the model, including fully bound nested closed bodies and whole-body bindings. OAS-permitted additional properties remain potential literal inputs.
- `planWorkflowGraph`: selected API contracts/values and registered native capabilities → typed native settings, conditions/assertions, explicit DAG edges/starts and gaps.
- `planReviewableWorkflowGraph`: ready/blocked API materials + identified gaps + native capabilities → a validated internal DAG retaining unresolved steps. Structured output contains `additionalNativeNodes`, `edges`, `additionalGaps` and `blockedCalls`; the returned plan's `nativeNodes` combines fixed prepared materials and new additions. Core derives roots and validates all references. Gap IDs have ports but no fabricated API output. Calls dependent on unavailable scenario work must be explicitly blocked; nonexistent API values/code are never invented. Graph array order does not define execution order.

Argument generation uses core's `createApiArgumentGenerationContract` for both the structured-output schema and `literalInputSchema` in the HumanMessage. It does not send the original parameter/body definitions or the binding plan to that model stage. Forbidden bound paths may appear as negative schema constraints, never as available inputs. Invalid proposals fail schema parsing rather than being repaired or silently trimmed. This literal-ownership contract is separate from the unchanged OAS contract used after runtime values are assembled.

The host supplies a LangChain chat model. No model endpoint, Chomsky adapter, agent loop, LangGraph checkpoint storage or n8n connection is created internally. These functions use named message classes and Zod output schemas with field descriptions. The host can place each invocation in its own LangGraph node and control retries/HITL. Plan bindings before literal arguments so response-supplied fields are not invented as constants. Final graph planning uses these dependencies together with scenario-required order and conditions.

This package depends on core and has a LangChain peer dependency; it does not depend on n8n. The graph schema is built from host-provided capability schemas. The planner validates executable proposals without repairing them; gap proposals remain non-executable and are returned for host review. It does not generate JavaScript, credential data, deployment origins or API-node JSON. Old single/linear planning functions live under `/legacy`; full generation compositions are private workspace examples, not this package's main API.

Binding gap output now requires `{ callId, targetPointer, description }`, not a description alone. Each target must exist in the request OAS. Assignment validation still runs on gap reports, so invalid bindings cannot be disguised as unmet requirements. The host decides whether to fail immediately or prepare a review workflow.

`planApiBindings` owns requested producer-to-request dependencies, not independent literal values. Calls without dependencies return `bindings: []`; absent dependencies are not failures. `gaps: []` means no requested dependency is blocked. Only an unavailable producer, an incompatible source contract or an unsupported explicitly requested transformation belongs in a binding gap. Independent literals (whether supplied or missing) belong to `generateApiArguments`; missing API capabilities belong to selection. These ownership rules are included in both the prompt and the field descriptions sent to the model. Validators check structural and OAS contracts, not the truth of free-text descriptions: genuine gaps remain blocked, and model-reported gaps are never silently discarded by a text heuristic.

Each API material sent by `planApiBindings` also includes core's `responsePointerCatalog`: code-derived body paths, declared types/descriptions and dynamic boundaries, alongside the unchanged full OAS contract. The model still chooses dependencies and source pointers; exact declared paths are supplied instead of requiring it to reconstruct those paths from the large contract alone. Response keys in the context are OAS metadata, not expected statuses to plan. The output remains `ApiBindingPlan`; no output-repair or pointer whitelist is added. This improves the available evidence but does not guarantee model choice or actual field presence.

`planNativeNodes` similarly reports unmet native behavior only. Selected API calls are OAS-backed materials compiled separately, not native HTTP capability choices. Deferred API argument generation, response-to-request binding and connection planning are not native gaps. This boundary is explicit in its prompt and field descriptions; it does not bypass contract validation or infer whether a free-text gap is true.

Native proposal schemas now use capability-owned `createPlanningParametersSchema({ apiCallIds })` hooks when supplied. Built-in n8n IF/assertion schemas constrain response IDs to actual supplied call instances; the model's capability context receives the same specialized schema. The two combined graph planners use this boundary too. With zero API calls, response operands are absent, not an empty enum. Custom capabilities without a hook retain their own schema without field-name rewriting. After proposal parsing, `planNativeNodes` validates declared API response references before returning a native plan; custom references and per-port dependencies receive the same check. Prepared native references also fail before native/connection model invocation. Schema errors remain `proposal-schema` failures with the original proposal; a custom schema-valid but unknown response ID fails `node-validation`. No value correction, defaulting or retry is introduced. ID membership does not replace the later dependency-route or source-response checks.

Discovery selection cannot produce `insufficient_contract` from metadata-only candidates. Model gap output has only `description`; the library assigns `missing_operation`. Detailed input and response limitations belong to stages that read full contracts. Review output omits known empty `blockedCalls`/`additionalNativeNodes` fields; code adds those constants only when the supplied context proves they are empty. Dynamic fields remain required. Real LangChain wire schemas are checked against the JSON Schema meta-schema, including all-blocked and empty-registry contexts.

See the [workspace guide](https://github.com/carefreelife98/openapi-flow#independent-stages). Our code is MIT-licensed; dependency terms remain separate.

Both graph planners accept optional `preparedNativeNodes`. These are fixed materials, not model output: their IDs/parameters and implementation-owned input/output ports are supplied explicitly while the model plans connections. Prepare such producers before binding/argument generation, deriving their schemas with core's `createNativeOutputContracts`. The model's `additionalNativeNodes` contains new nodes only, or `[]` if no addition is needed; the ambiguous old model field `nativeNodes` is not accepted as an alias. Repeating a prepared ID, guessing a producer, changing parameters through a coercing/defaulting schema or bypassing a required producer fails validation. Native output contracts must come from registered capability implementations, never model-generated declarations. Planning errors retain the raw model output, stage and original validation cause; hosts own persistence/privacy and retry policy.

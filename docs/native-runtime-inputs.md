# Native runtime inputs (unreleased)

These source additions are not in npm 0.2.0. They extend the existing API input
slots to explicitly declared native parameter objects and fields. They do not create dummy
values or make every native configuration editable at execution time.

## Ownership and supported scope

A capability may declare `supportsRuntimeParameters: true` only when its ports,
producer references and output contract do not depend on its parameter values.
`createJsonOutputCapability` and the registered `stop-and-error` implementation
currently supply this contract and the corresponding SDK compiler. Merge input
counts, IF response references, array sources and other structural decisions must
remain known during planning. Core and the SDK template compiler accept either
whole-object ownership or explicit field-pointer ownership, preserving the other
literal values. The scoped native edit API and canonical conversation now support
explicit field deferral and literal ownership transfer. New draft-native additions
also expose separate ownership and remaining-literal stages, integrated into the
canonical conversation. Standalone hosts can now use `selectNativeNodeInstances`
and `generateNativeNodeParameters` as separate stages for literal, whole-object or
mixed-field ownership. The existing compact `planNativeNodes` call retains its
single-call literal/whole-object contract; it does not silently invoke the new stages.
This is not an OAS document acceptance rule.

```ts
import { z } from 'zod';
import {
  createWorkflowDraft,
  collectNativeRuntimeInputSlots,
  inspectNativeRuntimeInputs,
  createWorkflowRuntimeInputsSchema,
} from '@openapi-flow/core';
import {
  createJsonOutputCapability,
  compileN8nWorkflowTemplate,
} from '@openapi-flow/n8n';

const capability = createJsonOutputCapability({
  name: 'request-context',
  description: 'Actual request context supplied before execution.',
  parametersSchema: z.strictObject({
    itemId: z.string().min(1),
    quantity: z.number().int().min(0),
    enabled: z.boolean(),
  }),
});
const context = { operations: [], capabilities: [capability], messages: [] };
const draft = createWorkflowDraft({
  context,
  content: {
    id: 'user-workflow',
    requirements: [],
    apiCalls: [],
    nativeNodes: [
      {
        id: 'request-context-1',
        capability: capability.name,
        parameters: {},
        runtimeParameters: true,
      },
    ],
    edges: [],
  },
});
const materials = {
  nativeNodes: draft.nativeNodes,
  capabilities: context.capabilities,
};
const slots = collectNativeRuntimeInputSlots(materials);
const formContract = createWorkflowRuntimeInputsSchema(slots);
const pending = inspectNativeRuntimeInputs({ ...materials, inputValues: {} });
const template = compileN8nWorkflowTemplate({
  draft,
  context,
  name: 'Actual typed inputs',
});
```

`parameters: {}` with `runtimeParameters: true` is a declaration of input
ownership, not an actual empty parameter object or a bypass of the required
schema. The library derives slot IDs from the node, capability and original
schema. The model does not generate slot IDs, schemas or confirmed runtime values.
Two instances of the same capability receive different slots.

Pass an explicit `inputValues` map to inspect or compile with actual values, or
edit the exported `입력 설정` node before execution. Keys are the returned slot
IDs. A slot targeting `''` takes the complete JSON parameter object; a field slot
takes that field's actual JSON value, with no object wrapper. Missing values stay
absent. Credentials belong in n8n credentials, not this map.

## Explicit field ownership (Core and SDK)

The host can explicitly preserve confirmed values and declare only the unknown
fields. Using the capability/context from above:

```ts
const mixed = createWorkflowDraft({
  context,
  content: {
    id: 'mixed-input-workflow',
    requirements: [],
    apiCalls: [],
    nativeNodes: [
      {
        id: 'request-context-1',
        capability: capability.name,
        parameters: { itemId: 'explicit-item', enabled: false },
        runtimeParameters: { pointers: ['/quantity'] },
      },
    ],
    edges: [],
  },
});
const [quantity] = collectNativeRuntimeInputSlots({
  nativeNodes: mixed.nativeNodes,
  capabilities: context.capabilities,
});
if (!quantity || quantity.targetPointer !== '/quantity') {
  throw new Error('Expected the declared quantity input slot');
}
const supplied = compileN8nWorkflowTemplate({
  draft: mixed,
  context,
  name: 'Explicit field inputs',
  inputValues: { [quantity.id]: 0 },
});
```

Duplicate/overlapping targets, an existing literal at the same target, invalid
pointers and undeclared closed-schema fields fail. Original literals are never
overwritten. Code derives slot schemas from the original resource, and checks the
complete combined object after assignment; individually valid projected fields do
not bypass correlated union constraints. Container identity comes from the schema
or an explicit existing literal container, not numeric-key guesses. Sparse arrays
are not filled. Pointer-list order does not change slot IDs. The canonical draft
and input map are not mutated.

`createNativeRuntimeParameterMaterializations` derives the immutable assignment
contract. The pure `materializeNativeRuntimeParameters` function is shared by
Core inspection and the native-only offline runtime bundle. Both global
preflight and the immediate native guard validate the full unchanged original
schema. Native guards do not load the HTTP request runtime. These primitives do
not themselves choose unknown fields from a natural-language request or silently
transfer ownership during later edits.

## Planning and validation

### Independent role selection and typed values

```ts
import {
  selectNativeNodeInstances,
  generateNativeNodeParameters,
} from '@openapi-flow/langchain';
import { createNativeNodePlan } from '@openapi-flow/core';
import type { PlannedNativeNode } from '@openapi-flow/core';

const input = {
  planId: 'my-native-plan',
  scenario,
  capabilities, // actual implementation registry supplied by the host
  apiMaterials, // optional actual OAS-backed call instances
  allowRuntimeParameters: true,
  includeExplanations: true,
};
const selection = await selectNativeNodeInstances({ ...input, model });
const nodes: PlannedNativeNode[] = [];
for (const instance of selection.instances) {
  const result = await generateNativeNodeParameters({
    ...input,
    selection,
    nodeId: instance.id,
    model,
    configuredNodes: nodes,
  });
  if (result.status === 'needs-clarification') {
    // The host persists the question and chooses when to resume this instance.
    continue;
  }
  nodes.push(result.node);
}
if (nodes.length !== selection.instances.length) {
  throw new Error(
    'Persist pending questions and resume unresolved instances before final assembly',
  );
}
const nativePlan = createNativeNodePlan({
  ...input,
  proposal: {
    nativeNodes: nodes,
    gaps: selection.gaps.map(({ description }) => ({ description })),
  },
});
```

The selection model chooses only capability, scenario role and explicit input
ownership. Code allocates deterministic role-scoped IDs, checks collisions and
derives the remaining literal schema from the actual implementation. A field owner
uses `parameterSource: 'workflow-fields'` plus RFC 6901 `pointers`; the model never
returns slot identities, schemas, ports or parameter values in that stage. The
capability context and output alternatives share one source-material factory.

The value model receives only the remaining typed parameters and actual supplied
sources. Runtime-owned fields are not available value choices. Whole-object,
fully field-owned and proven empty settings require zero value calls and no model.
Literal choices require at most one call per function invocation. Explanations
remain in the original proposal, not executable parameters.

The example's loop is a host scheduling choice, not dependency or execution order.
Each public function can be a separate LangGraph checkpoint node. Supply completed
nodes explicitly through `configuredNodes`; unfinished selections never acquire
invented output contracts. Parameter-dependent capability construction still
requires actual source contracts supplied by the host. Selection/argument changes
invalidate the saved selection or configuration fingerprint rather than silently
rebasing it. A clarification leaves the node unresolved; the host must retain that
pending status and ask the user, not treat a partial native plan as a complete DAG.
Connection planning, DAG validation and SDK compilation remain separate stages.

### Answering a selected instance's questions

The role selector does not require literal values to be known already.
Its code-owned `parameterPlanning` material declares that missing plan-time values
are questions for the separate value stage, not missing native capabilities.
Runtime ownership is reserved for fields explicitly deferred to execution.

When value generation returns `needs-clarification`, preserve that complete result
and the exact configuration input used for it. Pass the user's text through
`replies`, not by rewriting the original `scenario` or changing the selection:

```ts
import { generateNativeNodeParameters } from '@openapi-flow/langchain';
import type { GenerateNativeNodeParametersInput } from '@openapi-flow/langchain';

const input: GenerateNativeNodeParametersInput = {
  ...planningInput,
  selection,
  nodeId,
  model,
};
const result = await generateNativeNodeParameters(input);
if (result.status === 'needs-clarification') {
  const replies = [{ question: result, text: userReply }];
  const answeredInput: GenerateNativeNodeParametersInput = {
    ...input,
    replies,
  };
  const resumed = await generateNativeNodeParameters(answeredInput);
  // If another question remains, retain answeredInput and append its next answer:
  // [...replies, { question: resumed, text: nextUserReply }]
  // only after checking resumed.status === 'needs-clarification'.
}
```

Core allocates the question ID from the exact instance, source fingerprint and
original question proposal. It validates each ordered question/answer pair before
a model call, including subsequent rounds. Another node's question, altered
question content/ID, duplicated or reordered rounds, stale source data, empty text
and modified earlier answers followed by old questions fail without substitution.
The exact reply text and original question stay in the description; only generated
typed settings enter executable parameters. The value schema does not gain node
IDs, ownership changes, graph edits or fixed metadata for the model to regenerate.

Use a separate LangGraph interrupt node between value calls. A `MemorySaver`
checkpoint can retain selection, question, source configuration and reply history,
then resume just the value stage after `Command({ resume: userReply })`. Transport
failures do not repeat a completed role selection. The actual checkpoint/HITL path
is tested in `test/native-instance-configuration.test.mjs`.

This is a scoped setting reply, not a general workflow-edit API. Keep the original
source/configured-node snapshot while a question is pending. Source changes require
an explicit new planning attempt, not applying an old answer to a new fingerprint.
Question hashes check consistency of host-supplied receipts; they do not authenticate
the model or the human. The host owns trusted persistence, approval and cancellation.
Whole-owned/proven-empty settings have no literal choice and reject nonempty replies
instead of silently ignoring them.

### Existing compact planner

`planNativeNodes({ ..., allowRuntimeParameters: true })` opts into this branch
only for capabilities that implement it. Omission preserves literal-only model
generation. The output schema and HumanMessage capability materials are built
from the same contract, including `parameterSources`. The runtime option is not
forwarded automatically through older combined planning compositions.

When both sources are available, the model must now select an explicit
`parameterSource: 'literal'` with actual parameters, or
`parameterSource: 'workflow-input'` with no parameter values. Code creates the
canonical `parameters: {}` / `runtimeParameters: true` declaration for the latter.
Only the model output contract changes; the draft/SDK examples above keep their
existing form. The old model flag is not accepted as an alias, and marker-looking
literal strings are never converted into runtime ownership. See
[native planning records and source selection](native-planning-records.md).

`inspectNativeRuntimeInputs` distinguishes `needs-input`, `invalid-input` and
`ready`. Ready inspection returns literal native nodes with the actual unchanged
parameter object; it does not overwrite the canonical draft. Canonical readiness
separates API `requestInputsReady`, `nativeInputsReady` and `runtimeInputsReady`.

The normal SDK template path is Manual Trigger → input setup → global preflight
→ original DAG. Preflight validates all required inputs before any branch calls
an external service. Each runtime native fragment validates the original schema
and revision again immediately before its official Set or StopAndError node.
Subsequent API materialization still validates the complete original OAS request.
Zero, false, null where permitted, nested arrays, dotted keys and expression-looking
strings remain data. No coercion, trimming, examples or defaults fill a slot.

The runtime contract must be exportable as JSON Schema without losing checks.
Executable JavaScript refinements/transforms are explicitly rejected for runtime
slots, rather than omitted from validation. This is a native runtime compilation
boundary, not an additional OAS document acceptance rule.

## Standalone compiler input protocol

`compilePlannedN8nWorkflow`, `compileReviewableN8nWorkflow` and
`compileBatchedN8nWorkflow` accept the same explicit optional `nativeInputs`
configuration. This lets hosts compose selection, typed configuration, API
bindings and connections independently without manufacturing a canonical draft
just to export runtime-owned settings.

```ts
const nativeInputs = { revision: 7 };
const sources = createN8nNativeOutputSources({
  nativeNodes: plan.nativeNodes,
  capabilities,
  apiNodeNames,
  apiResponseContracts,
  nativeInputs,
});
// Build API fragments from these actual SDK source names and original OAS contracts.
const result = compilePlannedN8nWorkflow({
  id,
  name,
  plan,
  materials,
  apiNodes,
  capabilities,
  nativeInputs,
});
```

`revision` is an explicit nonnegative safe integer owned by the host's current
plan revision. Supply the same value to native source compilation and final
compilation. Omitting the configuration on a runtime-owned final plan fails with
`nativeInputs.revision is required`; the compiler never invents revision zero.
Omitting `inputValues` leaves the actual value map empty. Wrong types, undeclared
or stale slot IDs, and malformed supplied configuration fail before export.

Results with runtime slots expose
`nativeInputTemplate: { revision, inputsReady, inputSlots, guide }`.
Each slot retains its original schema and identifies the editable input node and
actual compiled guard entry. `inputsReady` means only that supplied native values
match these input contracts; it does not approve credentials, API execution,
business effects or general workflow correctness. To compile supplied values,
pass their returned slot IDs as `nativeInputs.inputValues` on the same plan.

The shared implementation inserts Manual Trigger → input setup → global native
preflight → every original graph root. Each runtime native guard still validates
its unchanged complete schema immediately before its SDK node. API fragments
continue validating the original OAS at their existing boundary. Complete plans
keep all original graph edges. Review gaps retain their Korean warning regions
and internal edges while only Start stays detached. Finite batch scopes use the
same input preparation before the unchanged batch lowering. Literal-only plans
without configuration retain their original JSON/result shape.

Capability protocol capture preserves prototype methods and their original
private state; material rebinding retains the explicit compiler input context.
This does not make source-dependent structural parameters runtime-editable, or
bypass their existing reference-structure validation.

This is also used by the existing factories under the explicit staged option
below; omission keeps their compact planner rather than silently redirecting it.

## Staged native planning in existing hosts

The example's `createOrchestratedWorkflowGenerationGraph` and
`createConversationalWorkflowGenerationGraph` accept
`nativePlanning: { mode: 'staged', planDependencies?, allowRuntimeParameters? }`, an explicit
host checkpointer and optional `nativeInputs`. Enabling runtime ownership requires
an explicit `nativeInputs.revision` before any model invocation. Only the supplied
capabilities are available in these factories; the canonical draft host's registry
selection and completed-plan edit flow remain distinct APIs.

Role selection, per-instance configuration, clarification and final assembly are
separate checkpointed nodes. Worklist order does not define DAG execution order.
A question defers that configuration while other selected instances are attempted;
actual source snapshots are captured separately for each task. Missing values do
not become invented settings, runtime ownership or successful outputs. API bindings
and final connections still wait for the native material plan to be complete.

`nativeSelection`, `nativeConfigurations`, `nativePlanningStatus` and
`nativeReplyIssues` expose serializable planning state. Original selection remains
unchanged across answers. Runtime-capability objects stay injected in the host;
they are not serialized into a checkpoint. A pending task retains its original
`configuredNodes` and ordered `replies`, even if an independent task finishes.
All original receipts and the final assembled node list are revalidated before
API planning.

`inspectNativeNodeConfigurationReadiness` reports declared constructor prerequisites
using only actual completed outputs and supplied API contracts. The example worklist
defers instances that lack those prerequisites, configures independent producers,
and resumes consumers once actual contracts are available. If none can progress and
no user question is pending, it reports the missing contracts before a value call.
An unfinished selected role is never counted as an output.

Value generation binds source-dependent implementations separately from the original
selection receipt. The generated source-ID enum contains only actual completed
producers; code derives output schemas and validates pointers against those contracts.
Final node assembly and planning records resolve the same actual dependency snapshot.
`resolveN8nNativeMaterials` exposes the adapter's data-contract binding with retained
SDK compilers; it does not invent SDK producer names or compile a graph by itself.
The example reconstructs bound implementations before bindings, connections and export,
rather than serializing executable factories into a checkpoint.

Constructor readiness is not semantic dependency planning. It does not prove that an
available unrelated producer satisfies the scenario, nor automatically schedule an
arbitrary chain whose exact producer choices are still unknown. A question retains
its original source snapshot; later producers are not silently inserted into an old
question. Those cases still require an explicit new planning decision. The worklist
does not infer dependencies from equal field names or selected array order.

### Explicit producer dependencies

Enable `nativePlanning.planDependencies: true` to place a checkpointed
`planNativeDependencies` node between role selection and configuration scheduling.
The independently callable `planNativeInstanceDependencies` adapter makes zero or
one model call. Core exposes `describeNativeInstanceDependencies`,
`createNativeInstanceDependenciesSchema`, `resolveNativeInstanceDependencies` and
`validateNativeInstanceDependencies`; callers can supply their own producer choices
without using the adapter or the example graph.

The output contains only `sourcesByNodeId`, with code-derived instance IDs as strict
row keys. Each row chooses `sourceNodeIds` from supplied API calls, prepared native
nodes and the other actually selected roles. Optional explanations use the existing
`includeExplanations` flag. These are declared choices and short reasons, not proof
of model provenance or semantic accuracy. Future role IDs are never labeled ready
output contracts. Missing/foreign rows, unknown/self/duplicate producer IDs and
cycles fail without repair; the model cannot emit parameters, output schemas,
ports or runtime edges in this stage.

Pass the resulting `dependencies` to configuration inspection/generation/resolution.
The scheduler waits for those specific selected producers, not any unrelated output
that happens to satisfy a constructor count. Value schemas, model-visible API/native
sources and source-ID enums are restricted to the explicit choice. An empty choice
exposes no producers; it never falls back to the entire inventory. Actual generated
API/native/control reference IDs must match the choice exactly. Supplied completed
consumers are checked too, even if another producer has an identical schema.

The original selection, producer choice and each question's source bundle are
preserved across replies. Changed/tampered dependency receipts and stale question
fingerprints fail before another value call. An explicit retry of a failed dependency
stage does not repeat completed role selection. There is no hidden model retry.

This plan controls readiness and permissible settings references. It is not an n8n
execution DAG. Only the separate connection stage creates edges, followed by the
existing topology checks. The canonical completed-draft conversation host remains
a separate composition; this option does not add a new turn-edit protocol there.

Connection planning receives a code-derived `nativeParameterReadiness` list after
material validation. Each entry identifies validated plan-time settings separately
from explicit execution input pointers (`['']` for whole-object ownership). The
connection boundary checks partial nodes' remaining required literal fields with
the same projected parameter contract used by value generation. Slot derivation
may inspect unfinished ownership, but final connection materials cannot label
those unfinished literals as ready. No missing literal is filled or defaulted.
The original scenario may contain an earlier unanswered question; that historical
text does not invalidate the current supplied settings. The model cannot generate
or change this readiness metadata, native parameters or ownership in its connection
output. This improves the context boundary; it is not proof that a model can never
invent a semantically wrong orchestration gap.

The `native-configuration` interrupt lists actual Core questions and an explicit
selection ID. Resume with `{ action: 'reply', questionId, text }`, or cancel with
`{ action: 'cancel' }`. Unknown IDs and whitespace-only replies persist issues and
ask again without calling a model. Two roles of the same capability have distinct
IDs/questions/slots and can be answered in either order. Natural-language text is
preserved, not appended to a rewritten scenario or trimmed. Source changes reject
an old answer before generation; archived result changes fail before export.

The graph does not retry model errors automatically. A caller's explicit retry
resumes the saved value node, not completed role selection. Concurrent thread IDs
remain separate. MemorySaver is host-owned and is not restart-proof storage;
the host owns thread IDs, lifetime/concurrency policy and `recursionLimit` for long
worklists. General workflow edits still use the canonical draft conversation API.

## Independent schema resources

`createWorkflowRuntimeInputsSchema` validates the map in process using each
slot's own schema resource. When exporting validation, serialize its individual
fields, not an assumed universal compound schema. Two independent native
contracts can legitimately arrive with the same absolute `$id`; nesting them
under one validator root makes that resource ambiguous.

The n8n adapter therefore compiles a strict value-map envelope and an independent
standalone validator for every slot. Original `$id`, `$ref`, recursive constraints
and values remain unchanged. The per-native guard also retains its original root.
Unknown/stale keys and invalid values still fail. No resource renaming or schema
assertion removal is performed.

## Development verification

- `test/native-runtime-inputs.test.mjs`: ownership, typed inputs, unchanged
  materialization, readiness, guards, recursive/shared-ID resources and invalid
  values. Different original schemas with the same ID are checked independently.
- `test/native-runtime-planning-http.test.mjs`: actual LangChain HTTP tool schema
  and capability materials agree on literal/runtime ownership; staged ChatOpenAI
  JSON Schema requests exclude runtime-owned fields and preserve required types.
- `test/native-instance-configuration.test.mjs`: independent roles, code-owned
  identities, mixed values, configured-source boundaries, questions, zero-call
  paths and failure preservation. These automated tests do not call a live model.
- `test/native-input-workflow-compilation.test.mjs`: standalone strict/review
  runtime inputs, real fragment names, complete and detached review wiring,
  private prototype implementations, material-wrapper rebinding and finite-batch
  scope preservation. No model or business API call is made by these tests.
- `test/staged-native-host.test.mjs`: both existing factories, actual MemorySaver
  interrupts, independent configuration progress, reply ordering/isolation,
  OAS/native bindings, explicit value retry and stale/tampered source rejection.
  Its scripted model is not a live-provider quality benchmark.
- `npm run test:native-runtime-input-local-n8n`: isolated n8n and synthetic local
  contract server; no business API or model call.
- `npm run test:packed-consumer`: public exports and strict independently installed
  TypeScript declarations, also using actual private OAS supplied by the developer.

These gates do not prove general model selection quality or complete
conversational host coverage. An earlier post-correction Chomsky attempt failed
at token-server DNS lookup (`ENOTFOUND`), before any model invocation. The distinct
later canonical and standalone runs below passed; the earlier failure remains
preserved. The existing special `__proto__` Ajv regression is still failing and
has not been skipped or repaired by schema rewriting.

## Canonical conversation checkpoint (2026-10-19)

The canonical host path now has a separate real Chomsky/ICL execution case:
`.local-artifacts/canonical-input-reply/1792348822314-91273/`.
It keeps all 34 original operations available, starts with a short item lookup,
answers the missing item ID, then asks for a conditional price lookup while
explicitly leaving the error message to n8n execution-time input. The existing
host's `allowRuntimeParameters` option is enabled. The model selects the API, IF,
Stop And Error configuration ownership and connections; code derives the one
native slot. No fixture message is inserted into the model's native parameters.

Twelve model calls and five isolated n8n checks passed: initial lookup; missing
native input rejected at global preflight with zero requests; provided input and
successful response executing both APIs; an OAS-valid nonzero response stopping
at Stop And Error without the price call; and cancellation restoring the original
lookup with no native slot. The supplied runtime message is an explicit test-user
input containing expression-looking text, and its exact string is retained by
the error node. The price lookup consumes a different source-response item ID.
Normal executions are three, expected rejections are two, local requests are
five, and business API calls are zero. Generated outputs are not repaired or
retried. `workflow-add-price-missing-input.json` retains the unfilled template;
`workflow-add-price.json` is compiled from the same draft with the explicit input.
Both contain temporary local service/credential references.

This proves the canonical whole-object Stop And Error path, not mixed
literal/runtime fields, every capability, general model quality, or the separate
`planNativeNodes` composition. Production implementation is unchanged;
only existing fixtures/integration assertions are extended. The whole-object
restriction and unsupported structural deferral remain explicit rather than
replacing known values or inventing parameter defaults.

The existing standalone `planNativeNodes` verifier was then run unchanged at
`.local-artifacts/native-runtime-live/1792349057013-92561/report.json`.
Three model calls returned successfully: native instances/runtime ownership,
API bindings and graph connections. No literal-model call was needed. The
compiler consumed the actual supplied runtime object, and isolated n8n made two
local calls, preserving that object exactly in the echo request while an
independent health request joined it at Merge. No model retry/output repair or
business service call occurred. This case supplies synthetic API contracts and
preselected API materials; it is not an ICL operation-selection benchmark.

Final root typecheck, lint, format, whitespace and documentation links passed.
Fresh full regression passed 941/942 with no skipped/cancelled tests and only
the unchanged Ajv synthetic key failure. These are unreleased development
checkpoints, not completion of mixed-field native inputs or the complete goal.

# Adding one selected native instance

These are unreleased source APIs, not features in npm 0.2.0. They configure one
`add-native-node` step after semantic analysis has selected a registered capability.
They do not generate a whole draft, choose another capability or adopt the candidate.

## Code-owned and model-owned work

`createWorkflowDraftEditPlan` already allocates the new instance ID and identifies
its capability. `describeWorkflowDraftNativeNodeAddition` resolves that exact
unfinished step, the staged actual API/native source contracts and the implementation's
original Zod parameter schema. Material-dependent factories bind current contracts;
unfinished, self and blocked native outputs are not offered as known sources.

`createWorkflowDraftNativeNodeAdditionSchema(input)` has an object root containing
one `decision`. The model can return:

- `provided` with implementation-typed `parameters`;
- `needs-clarification` with a focused question and no applicable resolution;
- `runtime-parameters`, only when the caller opts in and the implementation declares
  runtime-independent ports, references and output schema.

The schema has no fields for new IDs, capability selection, ports, edges, revisions,
fingerprints, schemas or workflow JSON. Existing API/native values are not regenerated.
Original refinements still validate locally. Defaults, coercion or transformations
cannot turn a different proposal into an accepted configuration. Unrepresentable
schemas fail rather than dropping their assertions.

```ts
import {
  generateWorkflowDraftNativeNodeAddition,
  selectWorkflowDraftNativeNodeParameterOwnership,
  planWorkflowDraftConnectionEdit,
} from '@openapi-flow/langchain';

const addition = await generateWorkflowDraftNativeNodeAddition({
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions,
  repairs,
  stepId,
  model,
});
if (addition.status === 'needs-clarification') {
  return addition.questions; // No partially applicable resolution.
}
const routing = await planWorkflowDraftConnectionEdit({
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions: [...resolutions, addition.resolution],
  repairs,
  model,
});
if (routing.status === 'ready') {
  return routing.candidate; // Host review/adoption is still explicit.
}
```

The host can make the same structured decision without a model through
`resolveWorkflowDraftNativeNodeAddition`, supplying the current description's
fingerprint. That boundary checks freshness, current evidence, full implementation
parameters, source kinds/pointers, output contracts and runtime-slot support.
It returns a `native-literal` or `native-runtime` resolution for atomic assembly.
It never changes the original draft or adds edges automatically.

## Separately planned runtime fields

`selectWorkflowDraftNativeNodeParameterOwnership` selects only literal ownership,
an explicitly deferred whole object, explicit runtime field pointers, or a scoped
question. It makes no model call when policy/implementation permits only literals.
The Core equivalent is `resolveWorkflowDraftNativeNodeParameterOwnership`.

```ts
const stage = {
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions,
  repairs,
  stepId,
  allowRuntimeParameters: true,
};
const selected = await selectWorkflowDraftNativeNodeParameterOwnership({
  ...stage,
  model,
});
if (selected.status === 'needs-clarification') return selected.questions;
// Persist/review this code-owned receipt before the separate value stage.
const addition = await generateWorkflowDraftNativeNodeAddition({
  ...stage,
  parameterOwnership: selected.contract,
  model,
});
```

The receipt is reconstructed from the actual staged node, original registered
schema and current evidence. Changed IDs, schemas, owners, source snapshots or a
receipt mutated during generation fail, without automatic rebase or retries.
The value stage cannot select ownership again. It receives only remaining literal
fields with their actual types and keeps unrelated required values required.
Entirely owned fields/configurations make zero value-model calls; their absence
is a declared input source, not an invented placeholder value. Partly owned nodes
produce `native-mixed` resolutions; whole-object ownership remains `native-runtime`.

Static references on a selected finite path are projected without expanding every
recursive occurrence. Other instances and recursive resources retain their own
original constraints. A deferred array index requires the actual preceding literal
prefix; the compiler does not fill holes. Closed-object forbidden declarations
can be omitted because `additionalProperties: false` already rejects those fields.
An entirely owned empty object ancestor has no literal choice and is created from
the original schema by the runtime materializer. Open objects retain explicit
negative constraints; unsupported provider syntax is not silently weakened.
Original schemas and complete runtime validation are unchanged.

With `allowRuntimeParameters` enabled, the canonical LangGraph host checkpoints
`native-addition-ownership` separately from `native-addition`. The ownership result
and original reasons/evidence remain in review results. A failure in the second
stage can be explicitly resumed without replaying ownership selection. Hosts may
use the same two public functions in their own graph; no fixed graph is imposed
by the libraries. Omitting the receipt preserves the existing bounded one-call
API; it does not add a hidden ownership model call.

For a selected strict empty Zod object, code conservatively proves that the closed
input contract has only `{}` and checks that value with the unchanged original
validator. `generateWorkflowDraftNativeNodeAddition` then makes zero model calls;
`model` is not required in that case. This is not a missing-value default. Open
objects, optional/default fields and wrapped schemas do not receive this shortcut.
The implementation remains authoritative; no capability-name whitelist chooses
these settings. Code-owned explanation text identifies the fixed contract when
explanations are enabled.

The model selects current `sourceMessageIds` and optional actual source IDs, not
quotations or OAS citation paths. Shared draft evidence code attaches unchanged
message text and original OAS/native identities. The result retains the supplied
`proposal` separately from its canonical evidence-bearing `decision`. Membership
checks do not prove that an explanation semantically entails a chosen value.

## Connections, roles and review

Multiple instances can use the same capability; semantic decisions must distinguish
their intended roles. Identical repeated decisions remain errors, not silently
deduplicated nodes. Each addition receives its own code-allocated ID.

A new source-dependent node is not a valid disconnected root. The explicit
connection stage uses actual implementation ports and full source availability.
Inserting a new IF into an existing route requires a `revise-connections` decision
for that existing route, in addition to adding the IF. Adding a node does not
authorize removing unrelated existing edges. Core preserves all other settings,
bindings, sibling nodes and approvals according to the existing impact contract.

In a LangGraph host, keep generation, connection planning and review in separate
checkpointed nodes. Do not invoke a model inside a replayed interrupt node. The
official example's existing operation/input questions now call `interrupt()` once
per node invocation, persist invalid-answer issues, then follow a graph edge back
to ask again. Resume schemas are exposed as JSON Schema for UI forms, while the
same Zod schema performs local validation so issues can be stored and displayed.
Consumed request answers are cleared rather than replayed. This follows the
[official interrupt validation/replay rules](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
and is tested with the installed LangGraph 1.4.19 and `MemorySaver`.

This does not yet compose the completed-plan edit/review/resume lifecycle in that
example. New API-instance planning, semantic requirement lifecycle, review-policy
scheduling, optional HITL suggestions and full host composition remain goal gates.
It is not a server, a new mandatory graph or restart-proof storage.

## Verification and provider boundary

Unit/actual local ChatOpenAI HTTP checks cover actual types, evidence enums,
optional explanation/runtime fields, repeated roles, stale state, unchanged values,
questions, original refinements, rejected transforms and zero-call empty settings.
Recursive original Zod contracts use official JSON Schema references; they are
not rejected merely because the schema is recursive. The shared wire serializer
uses Zod's `cycles: 'ref'` and retains original local validation. JSON Schema
validity is not a claim that every external model accepts every recursive contract.

`npm run test:native-node-addition-local-n8n` configures an IF and explicitly inserts
it before a response-bound API, imports the SDK template into isolated n8n 2.37.10
and executes both branches. Matching data makes three requests; nonmatching data
makes two and does not call the guarded API. The independent root still executes.
All existing API values/bindings and native settings are compared unchanged.
Artifacts, exact decisions, both executions and import JSON are written under
`.local-artifacts/native-node-addition/`. The normal runner uses explicit structured
decisions and makes no model/business API calls.

The first actual Chomsky attempt failed at token-host DNS lookup (`ENOTFOUND`)
before any model call. After the user connected the VPN, one fresh attempt passed:
two model calls generated IF settings and explicit connection deltas, with no model
retry or proposal repair. The unchanged result passed both isolated n8n branches
(three matching requests; two nonmatching requests), while the independent root
and existing values/bindings were preserved. No business API was called. Exact
decisions, execution reports and import JSON:
`.local-artifacts/native-node-addition/1792266659391-62153/`.
This proves that tested provider path, not broad model quality or the unfinished
completed-plan host lifecycle. See the [implementation ledger](conversational-oss-implementation.md).

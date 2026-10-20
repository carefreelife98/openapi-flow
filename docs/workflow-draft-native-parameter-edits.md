# Native parameter edits

These APIs are unreleased source additions, not features published in npm 0.2.0.
They implement an unfinished `revise-native-node` step. They do not select a new
capability, create a native instance or silently repair consumer/connection work.

## Two bounded stages

`selectWorkflowDraftNativeParameterEditTargets` chooses only the requested
set/remove pointers, plus explicit field deferral when opted in. Core re-derives the actual staged node and registered native
schema, validates current-message evidence, rejects overlaps and assigns target
identities. The host may review these targets before generating any values.

`generateWorkflowDraftNativeParameterEdits` then generates only the selected
set-values, using their actual registered types. Removal/deferral-only edits make zero
value calls. Source candidates are real staged API/native instances; pending
replacement/native contracts are not presented as confirmed sources. Unrelated
parameters, API values, identities, capabilities and connections are not re-created.

```ts
import {
  selectWorkflowDraftNativeParameterEditTargets,
  generateWorkflowDraftNativeParameterEdits,
} from '@openapi-flow/langchain';
import { assembleWorkflowDraftEdit } from '@openapi-flow/core';

const stage = {
  draft,
  context,
  plan,
  requestMessageIds,
  resolutions,
  repairs,
  stepId,
  model,
};
const selected = await selectWorkflowDraftNativeParameterEditTargets(stage);
if (selected.status === 'ready') {
  // Optional host review before this second call.
  const result = await generateWorkflowDraftNativeParameterEdits({
    ...stage,
    contract: selected.contract,
  });
  if (result.status === 'ready') {
    const candidate = assembleWorkflowDraftEdit({
      ...stage,
      resolutions: [...resolutions, result.resolution],
      connections, // separately planned explicit deltas, if required
    });
    // Host reviews/adopts the candidate; the original draft is unchanged.
  }
}
```

Structured host input needs no model. Use `describeWorkflowDraftNativeParameterEdit`,
`resolveWorkflowDraftNativeParameterEditTargets` and
`resolveWorkflowDraftNativeParameterEdits` directly. Persisted contracts are strictly
shape-checked and reconstructed from original plan/context authority; changed
schemas/IDs, stale state and concurrent mutations fail without retry or rebase.

## Types, values and missing choices

Native configuration includes semantic choices: a user saying “when values differ”
can justify the registered `notEquals` enum without spelling that identifier.
This differs from extracting a verbatim API literal. Values still follow the
implementation's actual types. No type coercion, data transformation, copied
default, guessed field mapping or business-data invention is performed by code.
Exact current-message quotations are required; they prove source membership, not
that the model understood the user's meaning. Review/semantic quality remain gates.

An unclear target returns `needs-clarification`. An unspecified selected value
returns `needs-input` with node/target-scoped code-owned questions and no partly
applicable resolution. Question results are not proof of a valid complete graph.
Explanations are absent from output schemas when disabled and require user-facing
reason/evidence when enabled. Question storage, answer routing and suggestions are
host responsibilities.

New runtime ownership is explicit and is offered only when both
`allowRuntimeParameters: true` and the capability's runtime-independent opt-in are
provided. A `defer` target moves only that field from a literal to a typed runtime
slot. Other literals and existing runtime owners remain unchanged. No value is
generated for a deferred target; a mixed set/defer edit sends only set targets to
the value model. Core derives slot identities and schemas from the actual
registered implementation, never from model output.

An explicit set transfers the selected field back to a literal, while remove can
remove an optional runtime-owned field without inventing a prior literal value.
The target selector receives the actual `runtimeParameters` pointer list, not a
boolean that hides partial ownership. The canonical LangGraph example forwards
the same opt-in across its separately checkpointed target and value stages.

The separate `runtime-parameters` decision still yields a `native-runtime`
resolution for whole-object ownership. A wholly runtime-owned object needs an
explicit whole-object set with complete actual values. An edit inside an unknown
runtime-owned parent needs that parent's complete value; missing siblings are not
fabricated. New draft-native additions use their separate ownership/value stages;
independent mixed ownership uses the separate role/value APIs documented in
[native runtime inputs](native-runtime-inputs.md), not hidden calls in the compact planner.

## Deterministic validation

Core preserves original parameter containers and orders sets before descending
original-index removals. The same ordering function is used by API literal edits.
Missing parents/sparse arrays are rejected, not created from guessed containers.
Numeric/dotted keys, zero, false, null, array siblings and unchanged values retain
their actual JSON meaning.

Field deferral may remove a literal array suffix, preserving the original runtime
indices. It cannot create holes in a JSON literal array or silently shift another
runtime owner's index. Such edits require an explicit suffix/whole-array change;
the library neither inserts nulls nor widens the user's selected field. The same
native-specific application function handles planning validation and assembly,
preventing assembly from dropping unselected ownership metadata.

Selected fields use original schema assertions, including static recursive refs.
Literal-only results additionally pass the original Zod schema. A mixed result
retains its declared partial schema; after actual inputs arrive the complete
object passes the original schema. Executable refinements that cannot be
serialized are not offered as runtime-input contracts. Zod defaults,
coercions and transformations cannot change the submitted object. Actual output
and port contracts are derived by code. Response/native references must resolve
to available actual source kinds and declared pointers; self/unknown/unresolved
sources are not repaired or substituted.

Parameter-stage `ready` is not graph readiness. Changing Merge input count or a
reference can require explicit [connection deltas](workflow-draft-connection-edits.md)
and consumer repairs before [atomic assembly](workflow-draft-edit-assembly.md)
accepts a full candidate and invalidates affected approvals. The existing consumer
repair model has a [separate bounded API](workflow-draft-native-reference-repairs.md).
Material-dependent registry refresh, new native-instance
generation stages and complete conversational LangGraph integration remain work.

## Model schema transport

The native/API edit value schemas compile reachable original static references
into direct named `$defs` components. Original runtime resources remain unchanged.
Only schema-valued positions are processed; `$ref`/`$id` strings inside literal
const/enum/default/example data stay verbatim. Names/links are code-owned, not LLM
fields. Static recursive references retain cycles between components. Resolution
annotations are replaced by canonical links; validation assertions are retained.
Dynamic/recursive-dialect scope is explicitly rejected by this static transport
compiler rather than weakened or silently reinterpreted. This does not change OAS
intake or existing runtime validators.

Wire serialization uses the shared plain-JSON boundary, and the original response
Zod schema still validates output. Schema/semantic failures preserve actual output
and cause; model transport failures are surfaced unchanged. The library does not
switch dialects, drop assertions or retry a rejected provider schema automatically.

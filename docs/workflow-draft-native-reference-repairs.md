# Native consumer reference repairs

These are unreleased source APIs, not features in npm 0.2.0. They repair an
existing native consumer after a producer contract changes. They do not replace
the node's settings, select an operation, change data or automatically rewire edges.

## Ownership and flow

1. The host supplies explicit primary results to `stageWorkflowDraftEdit`.
2. Core detects changed producers using actual operation/output/control contracts
   and emits pending consumer tasks from declared dependencies.
3. `describeWorkflowDraftNativeReferenceRepair` resolves one actual native task.
   The capability's `parameterReferenceBindings` callback owns the exact config
   locations containing producer IDs and optional configurable value pointers.
4. `planWorkflowDraftNativeReferenceRepair` makes one bounded model call. Each
   code-owned reference key requires `bind`, `keep` or `needs-clarification`.
5. Core checks source membership/kind, actual OAS/native pointer declarations,
   selected evidence IDs, snapshot freshness, shared assignments and full original parameters.
   It constructs only the necessary scalar `set` patches and the actual task ID.
6. The host supplies the returned repair to atomic assembly. Other repairs and
   required connection deltas remain explicit; a repair result is not graph readiness.

```ts
import { planWorkflowDraftNativeReferenceRepair } from '@openapi-flow/langchain';
import { assembleWorkflowDraftEdit } from '@openapi-flow/core';

const result = await planWorkflowDraftNativeReferenceRepair({
  draft, context, plan, requestMessageIds,
  resolutions, repairs, taskId, model,
});
if (result.status === 'ready') {
  const candidate = assembleWorkflowDraftEdit({
    draft, context, plan, requestMessageIds,
    resolutions, repairs: [...repairs, result.repair], connections,
  });
  // Review/adopt the candidate; the original draft is unchanged.
}
```

For structured host decisions no model is needed. Use the description's fingerprint
and fixed binding keys with `resolveWorkflowDraftNativeReferenceRepair`.
`createWorkflowDraftNativeReferenceRepairSchema` describes the same proposal shape.
The model never returns patches, fingerprints, revisions, task IDs, parameter
schemas, whole settings or binding IDs as values.

## Implementation-owned locations

`WorkflowNativeReferenceBinding` declares `nodeIdPointer`, optional `valuePointer`
and the actual `reference`. Omitting `valuePointer` means the implementation owns
a fixed data pointer, so no `sourcePointer` field is offered to the model. Control
references use `source: 'exclusive-output'` and no data pointer; only actual stable
exclusive producers are candidates. Shared physical settings must receive identical
assignments. No field-name or value-matching search discovers these locations.

All eleven built-in capability families declare their locations (including empty
lists for reference-free families). IF/assertions expose only response operands;
array/collection implementations expose their source/pointer pair; item join owns
its API/root and scope references; exclusive rejoin owns its branch producer.
Core checks declarations against actual reference callbacks and literal settings.
A custom capability must declare this callback to use bounded model repairs.
Legacy manual custom repair behavior is unchanged; it does not receive invented
location metadata.

## Validation, questions and unchanged values

`keep` acknowledges a task only when the exact reference remains valid against
the new source contract. A question cannot conceal another invalid explicit keep
or bind. Questions have code-owned identities and return no partially applicable
repair. A repair may contain no patches when a valid explicit keep is sufficient.
Unknown/missing/extra reference keys, unavailable evidence IDs, invalid pointers, stale
materials and conflicting shared settings fail without correction or retry.

Native consumers awaiting repair are excluded from available native output sources
in both native and API binding stages. An API whose inputs await revision can
still expose its known OAS response contract; this is not a claim that its request
is executable. Self/unresolved/blocked sources are not silently substituted.

Operators, comparison literals, messages, capability identity and unrelated settings
remain unchanged. The full original Zod schema and actual output/reference contracts
still apply. Atomic assembly checks the complete DAG and affected approvals.
Schema/semantic failures preserve model output and cause; transport failures surface
unchanged. Optional explanations require concise user-facing reason/evidence only
when enabled.

The model selects `sourceMessageIds`, not message text. Explanation evidence selects
`{kind: 'message', messageId}` or `{kind: 'source', nodeId}` from actual supplied
IDs. Core attaches unchanged current message text, original OAS identity/root
locations or native capability names. Distinct instances can cite the same original
contract; canonical contract facts are unique while the original proposal retains
every selected instance. Returned `decisions` contain this resolved evidence,
separately from the unchanged model `proposal`. No generated quotation is corrected,
trimmed or accepted as an alias. Valid source membership is not proof of semantic
entailment or reliable model quality.

## Remaining boundaries

The current deterministic end-to-end proof also covers cascading API-array,
native-array, collection and item-join contract revisions. Core independently
resolves original/candidate materials, withholds unfinished outputs and discovers
downstream repairs after explicit upstream decisions. The n8n adapter binds actual
SDK source names to those current contracts. The same definitions work across a
same-pointer string-to-number change and a renamed field without mutating the old
draft. The real-model proof still covers IF/assertion/API references, not the whole
new material-dependent cascade. See [material snapshots](native-material-snapshots.md).
No fallback to old schemas, guessed sources or relaxed validation is provided.

New native-instance composition, operation replacement planning, host-owned question
answers/suggestions and the official completed-plan LangGraph edit/resume flow
remain separate goal requirements. See the [implementation ledger](conversational-oss-implementation.md),
[native settings edits](workflow-draft-native-parameter-edits.md) and
[atomic assembly](workflow-draft-edit-assembly.md).

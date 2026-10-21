# Scoped API input edits

The basic APIs were published in npm 0.3.2. Same-plan operation-replacement support
and the explicit human-answer boundary below are included in 0.3.3 release source.
See the [release record](releases/0.3.3.md) for actual publication status.
They implement the literal-input stage of an existing `revise-api-inputs` decision.
They do not reselect APIs, regenerate the request, choose new bindings, repair
dependencies or design graph connections. See the [assembly contract](workflow-draft-edit-assembly.md)
and the [full implementation ledger](conversational-oss-implementation.md).

## Separate host-controlled stages

```ts
import { assembleWorkflowDraftEdit } from '@openapi-flow/core';
import type { WorkflowDraftEditResolution } from '@openapi-flow/core';
import {
  selectWorkflowDraftApiInputEditTargets,
  generateWorkflowDraftApiInputEdits,
} from '@openapi-flow/langchain';

// draft/context/requestMessageIds/plan come from the validated semantic edit stage.
// stepId identifies the specific revise-api-inputs decision, not every plan step.
// Keep the same completed-material snapshot for selection and value resolution.
const resolutions: WorkflowDraftEditResolution[] = [];
const targetContract = await selectWorkflowDraftApiInputEditTargets({
  draft,
  context,
  requestMessageIds,
  plan,
  stepId,
  resolutions,
  model,
});
// The host may stop for review here; the contract is serializable.
const result = await generateWorkflowDraftApiInputEdits({
  draft,
  context,
  requestMessageIds,
  plan,
  stepId,
  resolutions,
  contract: targetContract,
  model,
});
if (result.status === 'ready') {
  const candidate = assembleWorkflowDraftEdit({
    draft,
    context,
    requestMessageIds,
    plan,
    resolutions: [...resolutions, result.resolution],
  });
  // The host decides whether to review/adopt candidate. This example has one
  // literal-edit step; other plan steps require their own explicit results.
}
// needs-input has pendingTargets and validated supplied values, but no resolution
// that could silently apply only part of this requested edit.
```

Field selection makes one call for `set`/`remove` pointers and exact current-request
evidence. It never asks for values, schemas, revisions or generated IDs. Code
derives the selected original OAS schemas and contract identity. Value generation
then makes one call containing only selected set-targets and current messages.
Its output cannot name new targets or supply unrelated request values. A removals-only
contract needs **zero value-generation calls**. Hosts with explicit structured
targets use core's `createWorkflowDraftApiInputEditContract` without the first call;
hosts with actual typed values use `resolveWorkflowDraftApiInputEdits` without any
model invocation, using the separate human-answer boundary below when the original
proposal left those values pending. Host-owned graph composition remains optional
and external.

## Explicit typed human answers

The original model proposal is not a container for later human answers. Keep its
`values` and exact-source metadata unchanged. When it returns `needs-input`, the
host can render fields from `pendingTargets` and send actual JSON-typed answers
through the new core boundary:

```ts
import {
  createWorkflowDraftApiInputEditAnswersSchema,
  resolveWorkflowDraftApiInputEdits,
} from '@openapi-flow/core';
import type { WorkflowDraftApiInputEditAnswers } from '@openapi-flow/core';

// editInput is the same draft/context/plan/stepId/completed-material snapshot
// with its original validated target contract. pending is the original result
// from generateWorkflowDraftApiInputEdits, not an edited model response.
if (pending.status === 'needs-input') {
  const answerSchema = createWorkflowDraftApiInputEditAnswersSchema({
    ...editInput,
    output: pending.values,
  });
  const confirmedAnswers: WorkflowDraftApiInputEditAnswers =
    answerSchema.parse(submittedPacket);
  const result = resolveWorkflowDraftApiInputEdits({
    ...editInput,
    output: pending.values,
    confirmedAnswers,
  });
  // Only ready has a complete resolution for normal assembly/review/adoption.
  // needs-input retains the typed receipt and remaining targets, not a partial edit.
}
```

For a pending integer target, the submitted packet is:

```json
{
  "contractId": "api-input-edit:<the exact current contract hash>",
  "answers": [{ "targetId": "value-1", "value": 4 }]
}
```

The schema derives allowable target IDs and value assertions from the original
contract and unchanged proposal. It rejects stale contract IDs, unknown/duplicate
targets, targets already provided by the model, removals, additional metadata and
wrong OAS types. Strings such as `"0007"`, `0`, `false`, `null`, arrays and objects
are not coerced. Original OAS resource references and tuple assertions use the
same validator as the model-value schema. A packet has no model explanation or
source-text fields: the caller owns its authenticated user/review association.
Bind the packet to the current review token/revision and retain the original
proposal on the server; `contractId` is not an authentication credential.

The resolver returns `confirmedAnswers` separately from the original `values`.
It never inserts synthetic user messages or turns human data into model evidence.
Partial replies validate supplied fields and keep the canonical draft unchanged;
the host must explicitly accumulate the returned receipt with later answers and
resubmit that cumulative packet against the same original proposal. There is no
implicit checkpoint store, merge, model call, automatic retry or stale-contract
rebase. Per-field validation does not prove whole-request conditional constraints:
these are checked after every selected target is answered, before returning a
complete resolution. Final assembly and human approval remain separate stages.

The public `workflowDraftApiInputEditAnswersSchema` owns the JSON transport shape
and its inferred packet types. Hosts can compose it into their response envelope
without copying Core fields. It is not the current-contract authority: the
contextual factory/resolver must still check the actual OAS, pending targets and
unchanged proposal.

An omitted `confirmedAnswers` preserves existing result shapes. A provided or
removals-only proposal permits only an empty answer list; its wire schema uses an
empty bounded homogeneous array, not an empty tuple with `prefixItems: []`.
Hosts must keep the typed receipt private because it contains actual input data.
The source reference conversation example now exposes `api-input-edit` questions
and applies `answer-api-input-edits` directly through Core. Its private submission
history is separate from model messages. See the [host response contract](workflow-draft-conversation-host.md#typed-existing-api-input-edits).
Hosts must upgrade their public packages and connect their own forms separately;
package publication alone does not implement a consuming product's UI.

## Actual typed values, not JSON encoded as a string

For a selected integer `/body/config/count`, the generated schema has an integer
value assertion derived from OAS, not `valueJson: string`. The model responds:

```json
{
  "values": {
    "value-1": {
      "status": "provided",
      "value": 4,
      "source": {
        "messageId": "edit-1",
        "sourceFormat": "json",
        "sourceText": "4"
      }
    }
  }
}
```

Code derives `value-1`; it is scoped to the validated target contract. Each selected
set-target is either `provided` or `needs-input`. A provided string must equal its
exact text source, or a complete JSON source literal must parse to the identical
value. Numbers/booleans/null/arrays/objects preserve their JSON types. Source text
must actually occur in a current request message, never an old accepted value,
OAS example/default or fabricated evidence. Objects are not synthesized from an
incomplete phrase by this extraction stage; absent complete values remain pending.
This strict extraction is not a replacement for every existing generation API.

Optional explanations follow `plan.options.includeExplanations`. When disabled,
they are absent from target and value output schemas; when enabled, a short
user-facing reason and actual current-message evidence are required. Exact-source
checks establish occurrence/type, not that the model chose the semantically
correct field. Real-model evaluation and human review still matter.

Semantic-edit, target and value prompts and their optional reason descriptions
now explicitly request the current user's language. This instruction applies only
to the display reason; identifiers, actual values and source quotations stay
unchanged. It is not a runtime language classifier, translation pass or retry.
The [implementation ledger](conversational-oss-implementation.md#live-source-validation-typed-edits-and-display-language)
records bounded before/after real-model and isolated n8n observations, not a
general language-quality guarantee.

## Deterministic preservation and validation

Targets use RFC 6901 pointers. Dynamic object keys are allowed when the original
OAS permits them; there is no hardcoded field-name whitelist. Undeclared closed
fields, malformed/overlapping pointers and changes overlapping binding ownership
fail before value generation. A producer reference belongs to a binding-edit
stage, not to this literal stage. Removal requires an existing literal, but may
remove a field from an explicitly replaced old body format.

Targets address the original value. Code sets values first and deletes higher
array indices before lower ones, so multiple removals do not retarget later
original indices. It preserves unpatched values and does not infer missing
containers from property names. Original OAS-aware assignment owns container
construction where permitted. Required-value removal can derive an execution
input slot through normal draft readiness. `needs-input` does not implicitly
remove or reuse a value; a host must gather actual values or arrange an explicit
deferral decision, without presenting the incomplete edit as applied.

The selected body media type is preserved unless the host explicitly supplies a
different declared `requestMediaType`. Code derives the input contract from
`stageWorkflowDraftEdit`, including explicitly completed `resolutions` and `repairs`.
Omitting `resolutions` means that no materials in this plan have been completed.
It never means that the old operation can stand in for an unresolved replacement.
An input edit blocked by an unresolved contract or requirement fails before a
model call. The host must wait for the replacement material or its actual input
answer, then pass that completed result to the later detail-edit stage. Both edits
remain in the same atomic plan; canonical adoption is still a separate action.

The contract ID also binds the staged fingerprint. Changing completed values,
bindings or other staged material invalidates the old contract even when the OAS
schema stays the same. Selection and value generation use the same source snapshot;
an already supplied input-edit result is not silently removed or regenerated.
Persisted target contracts made by the earlier implementation must be re-derived
under the upgraded implementation; their old opaque IDs are not compatibility
aliases for the new staged contract.
The reference LangGraph scheduler waits for blocked API contracts before assigning
input-target or binding-edit work. This source behavior is covered by deterministic
tests, not by a completed real-model run against a newly published package.

The contract is re-derived before parsing/resolution and after an awaited model
call. Modified field IDs/schemas, stale drafts/messages/plans and input changes
during a call fail without rebase or retry. Errors retain the original cause and
stage/output for host-owned diagnostics/privacy. Cross-field constraints are
checked after all explicit edits; final assembly still validates the complete
OAS/native contracts and DAG before returning a candidate revision.

## Schema resource and transport ownership

The persisted edit contract retains one original normalized request resource;
host validation independently compiles its original assertions. Wire schemas use
reachable named `$defs` components, each referenced directly rather than through
a generated remote URI or a deep path into a large copied resource. Only the
projection-owned duplicate type metadata is omitted from reference wrappers after
proving it equals the actual referenced declaration. Types/descriptions remain on
that definition. Original assertion siblings and actual data are not weakened or
changed. See the shared [transport boundary](workflow-draft-native-parameter-edits.md#model-schema-transport).

Value schemas preserve Draft 2020-12, including tuple `prefixItems`; target/evidence
schemas use Draft-7. The adapter serializes the official Zod result to plain JSON
data before passing JSON Schema to LangChain. Installed Zod attaches a non-enumerable
`~standard` hook even to `toJSONSchema` output, and installed LangChain recognizes
that hook and re-serializes using Draft-7. Passing JSON data preserves the explicitly
chosen dialect/inline settings. The original Zod schema still parses every response.
This is one normal transport conversion, not a dialect fallback or rejection retry.

Local HTTP tests inspect actual ChatOpenAI requests, validate each wire schema in
its declared dialect and reject forged IDs/fields and wrong typed values. Scripted
responses do not establish real-model natural-language editing quality.

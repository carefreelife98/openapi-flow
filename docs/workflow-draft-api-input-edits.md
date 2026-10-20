# Scoped API input edits

These APIs are unreleased source additions, not features published in npm 0.2.0.
They implement the literal-input stage of an existing `revise-api-inputs` decision.
They do not reselect APIs, regenerate the request, choose new bindings, repair
dependencies or design graph connections. See the [assembly contract](workflow-draft-edit-assembly.md)
and the [full implementation ledger](conversational-oss-implementation.md).

## Separate host-controlled stages

```ts
import { assembleWorkflowDraftEdit } from '@openapi-flow/core';
import {
  selectWorkflowDraftApiInputEditTargets,
  generateWorkflowDraftApiInputEdits,
} from '@openapi-flow/langchain';

// draft/context/requestMessageIds/plan come from the validated semantic edit stage.
// stepId identifies the specific revise-api-inputs decision, not every plan step.
const targetContract = await selectWorkflowDraftApiInputEditTargets({
  draft,
  context,
  requestMessageIds,
  plan,
  stepId,
  model,
});
// The host may stop for review here; the contract is serializable.
const result = await generateWorkflowDraftApiInputEdits({
  draft,
  context,
  requestMessageIds,
  plan,
  stepId,
  contract: targetContract,
  model,
});
if (result.status === 'ready') {
  const candidate = assembleWorkflowDraftEdit({
    draft,
    context,
    requestMessageIds,
    plan,
    resolutions: [result.resolution],
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
model invocation. Host-owned graph composition remains optional and external.

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
different declared `requestMediaType`. This function consumes the current canonical
operation; a same-plan operation replacement must be resolved through its own
new-operation material stage, not validated against the old operation here. The
full dependency-aware composition of those stages remains unfinished.

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

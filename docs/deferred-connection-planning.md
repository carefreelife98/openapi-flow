# Explicit input deferral during connection planning

Status: verified source change prepared for 0.3.1; not in the published 0.3.0 packages.

## Ownership and boundaries

The fixed-material connection planner previously rejected every missing request
literal before planning edges. Canonical drafts and the n8n template compiler
already represented these missing values as typed runtime input slots. That
readiness mismatch prevented a host from offering an explicit “enter later” action
while still planning the complete API/native DAG.

`deferredApiInputIds` is an optional, caller-owned permission on connection planning
and reviewable graph validation. Obtain its IDs from `collectDeferredApiInputSlots`
using the original operations, current literal values, bindings and requested input
pointers. Include only slots the user explicitly deferred. There is no permission
inferred from missing data, scenario wording, a default value or an OAS example.

```ts
const slots = collectDeferredApiInputSlots({
  materials: materials.map((material) => ({
    operation: material.operation,
    ...material.arguments,
  })),
});

const plan = await planWorkflowConnections({
  scenario,
  model,
  materials,
  capabilities,
  nativeNodes,
  deferredApiInputIds: explicitlyDeferredSlotIds,
});
```

Here `materials` are contract-available API materials, with `status: 'ready'` and
their original `unresolvedInputs`. This status does not certify execution readiness
when explicit input deferral is present. The host must match a user's decision to
the current `slots`; it must not automatically approve every discovered slot.

Code validates the permission against the complete current slot inventory. Unknown,
duplicate and stale IDs fail. Missing values without explicit deferral still fail.
Supplied values remain subject to the original OAS type and presence checks;
deferral cannot turn an invalid provided value into an absent value. Bindings own
their request targets, so those targets do not become duplicate literal slots.

The model receives code-derived `deferredApiInputs` metadata and chooses only
connections. It cannot generate a replacement value, schema, API node or native
configuration. Connection records capture the slots and original materials;
revalidation detects changed contracts, values, slot IDs or evidence. Actual ports,
producer ancestry, cycles and joins retain their existing deterministic checks.

## Export and execution

Use the validated edges to construct a canonical `WorkflowDraft`, then call
`compileN8nWorkflowTemplate`. The compiler derives the slots again, emits the Korean
guide and central input editor, and validates runtime values before business roots.
An empty input editor is not a valid API value or a promise of successful execution.
URL/credential configuration and final review remain separate concerns.

The older `compileReviewableN8nWorkflow` executable-fragment boundary does not accept
this permission: it cannot install the canonical template input/preflight nodes.
Passing an extra deferral property does not bypass its required-input check. The
general executable graph planner is unchanged. This is not webhook/callback work,
new native plan-time deferral, an automatic retry or an API capability-gap marker.

## Verification

- `test/deferred-connection-planning.test.mjs`: five API instances plus a Merge,
  source-preserving model context/receipt, explicit slot ownership, wrong values,
  stale/partial/duplicate permissions, invalid markers, invalid DAGs/bindings and
  the legacy executable boundary. Its model is scripted, not a live quality test.
- `integration/real-oas.mjs`: local original service contracts without API calls
  or fabricated request values. Private source documents remain outside Git.
- `integration/requested-api-inputs-local-n8n.mjs`: connection planning before
  canonical template compilation; real n8n outcomes for missing/invalid/valid
  runtime values and producer-bound inputs. Only local contract endpoints are used.

Do not infer host UI integration, a published patch version or real-model quality
from these source regressions. Those are separate delivery steps.

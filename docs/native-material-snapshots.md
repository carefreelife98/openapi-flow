# Native material snapshots

These APIs are unreleased source additions, not features of npm 0.2.0. They
reconstruct native contracts from the actual API/native producers for one content
revision. The original capability definitions and draft are not mutated.

## Ownership and flow

Core's `resolveNativeMaterialSnapshot` receives actual `apiMaterials`, external
`nativeOutputs`, planned `nativeNodes`, capability definitions and explicit
`deferredNodeIds`. The draft-facing `resolveWorkflowDraftNativeSnapshot` looks up
the draft's exact operation keys and has explicit `unavailableApiNodeIds` instead
of accepting replacement contracts from a different source.

1. Inspect implementation-declared reference locations without requiring unresolved
   producers to have output schemas.
2. Resolve available producer contracts in dependency order. This is schema
   dependency order, not an inferred workflow execution order.
3. Invoke a material-dependent capability's pure `bindMaterialContracts` with those
   actual contracts. The bound definition declares matching `materialSources`
   receipts. Static implementations retain their explicit definitions.
4. Check full parameters, reference callbacks, output schemas and the actual source
   receipts. A complete registry must keep the same output contracts when unrelated
   producers become available.
5. Return `ready` with the bound registry, or `pending` with only actual resolved
   bindings/outputs and named unfinished dependencies. A pending snapshot has no
   `capabilities` property and supplies no old schema for an unfinished node.

```ts
import { resolveWorkflowDraftNativeSnapshot } from '@openapi-flow/core';

const snapshot = resolveWorkflowDraftNativeSnapshot({
  content: candidateContent,
  context,
  deferredNodeIds: unfinishedNativeNodeIds,
  unavailableApiNodeIds: unfinishedApiNodeIds,
});
if (snapshot.status === 'pending') {
  // Keep unresolved decisions visible; do not compile the old output contracts.
  return snapshot.pending;
}
// snapshot.capabilities and snapshot.outputs belong to candidateContent.
```

This result proves available contract resolution, not a valid connected DAG,
correct model intent, runtime values, credentials or user approval. Full draft,
binding, topology and compiler validation still apply. Strict canonical/export
paths reject pending materials with `NativeMaterialResolutionError`, retaining
structured `pending` details.

## Original and candidate revisions

Edit staging independently resolves original and candidate contracts from the same
definitions. A changed source first creates a consumer repair task. That consumer's
output is withheld until its explicit repair is accepted. Once its actual new
output is known, downstream tasks can appear. Independent known contracts remain
available. The host repeats staging after each explicit decision; the library does
not guess renamed fields, acknowledge consumers or retry a rejected model call.

For example, `/rows: string[]` can become `/rows: number[]`, or move to `/entries`.
The host/model must explicitly keep or change the reference. The new element
schema then comes from the new OAS, not a model-generated schema or a mutated old
factory. Array splitting, native array splitting, collection and item-join use this
binding protocol. Settings, comparison values, API roles and edges remain explicit.

## n8n runtime names and item execution

Core snapshots contain no n8n runtime names. The n8n compiler resolves native
fragments in producer dependency order and obtains reader names from the actual
SDK producer exits. It still uses the supplied graph edges for execution. Existing
compiled-source guards compare those producers against the current OAS/native
contracts before export.

`createN8nNativeOutputSources` now requires `apiResponseContracts` for referenced
APIs. A partial native subset can supply explicit `externalNativeOutputSources`;
these cannot replace a node present in that subset. Missing contracts or runtime
names are errors, not a reason to read a captured previous revision.

Direct calls to a factory with explicitly provided runtime sources retain that
immutable binding. Workflow compilation creates a new material binding in a
separate, explicit compiled-source mode. A caller extending a dynamic capability's
compiler must also provide a coherent `bindMaterialContracts` extension, so binding
does not silently discard the caller's implementation. Inconsistent spread-object
overrides or source-receipt mutations are rejected.

Request execution mode is separate from schema reconstruction. For item streams,
set `itemMode: 'linked'` on the array factories and the template compilation input:

```ts
const template = compileN8nWorkflowTemplate({
  draft, context, name, deployments, itemMode: 'linked',
});
```

That explicit mode uses n8n ancestry per input item, never positional zip or value
matching. Omitting it retains single-item readers; ambiguous streams fail instead
of silently selecting one item. This option is not inferred from a pointer or OAS
field name. Independent graph branches do not promise wall-clock concurrency in
n8n's executor.

## Verification

`test/native-material-snapshot.test.mjs` covers same-path type changes, renamed
fields, cascading public repairs, original-definition preservation, missing/pending
outputs and invalid final source receipts. Existing malicious-compiler regressions
retain their original producer-name/schema guard assertions through an explicit
coherent compiler extension.

`npm run test:native-material-revision-local-n8n` imports three templates into an
isolated n8n 2.37.10 with synthetic contract endpoints. Original strings and both
numeric revisions each execute seven requests: one source and two distinct API
roles for three unchanged items. It checks duplicate values, exact types, item
ancestry join, collection, actual SDK mappings and preserved graph edges. No model
or business service is called. Workflow JSON, repair stages, actual executions and
request observations are saved under `.local-artifacts/native-material-revision/`.

This deterministic proof does not establish real-model repair quality or complete
the conversational LangGraph host, new-instance planning or remaining goal gates.
See the [implementation ledger](conversational-oss-implementation.md) and
[reference repair contract](workflow-draft-native-reference-repairs.md).

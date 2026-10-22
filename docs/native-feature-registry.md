# Registered n8n feature selection

`resolveN8nNativePlanningFeatures` exposes stable definitions before producer
instances exist, while retaining missing context separately. The canonical host
opts in with `nativeFeatures`; see [planning and prerequisites](native-feature-planning.md).

This table describes 0.3.8 source. `ComposeApiResponses` is not in npm 0.3.7;
see the [release status](releases/0.3.8.md) for publication verification. The other
families retain their existing published contracts.

`N8nNativeFeature` is the enum-like, immutable list of OSS-supported feature
families. `resolveN8nNativeFeatures` connects them to the existing capability
schemas, provenance declarations, ports and SDK compilers. It makes no model
call and does not discover services, construct source contracts or generate
parameter values.

```ts
import {
  N8nNativeFeature,
  resolveN8nNativeFeatures,
} from '@openapi-flow/n8n';

const registry = resolveN8nNativeFeatures({
  features: [
    N8nNativeFeature.If,
    N8nNativeFeature.MergeAppend,
    N8nNativeFeature.AssertResponses,
    N8nNativeFeature.PassThrough,
  ],
});

// Existing planners and compilers consume the same authoritative implementations.
const capabilities = registry.capabilities;
```

An omitted `features` list inventories all registered families. An explicit
empty list selects none. An explicit non-empty list preserves the supplied
order and rejects unknown or duplicate features. It also fails with a named
missing-context error if a requested factory cannot be constructed. There is
no fallback selection, automatically broadened list or exception-triggered
retry. Supplied invalid context fails even if an unrelated feature was selected.

## Available implementations and additional context

| Enum member | Capability | Additional source context |
| --- | --- | --- |
| `If` | `if` | None; planning later restricts response references to actual API instances |
| `MergeAppend` | `merge-append` | None |
| `AssertResponses` | `assert-responses` | None; planning later restricts response references to actual API instances |
| `StopAndError` | `stop-and-error` | None |
| `PassThrough` | `pass-through` | None |
| `RejoinExclusiveBranches` | `rejoin-exclusive-branches` | None; final graph still requires the declared IF alternatives |
| `JsonOutput` | Host-supplied producer name | `jsonOutput`: explicit name, description and original Zod input schema |
| `SplitApiResponseArray` | `split-api-response-array` | Non-empty `apiMaterials` from resolved OAS contracts |
| `CollectApiResponses` | `collect-api-responses` | Non-empty `apiMaterials` from resolved OAS contracts |
| `ComposeApiResponses` | `compose-api-responses` | Non-empty `apiMaterials`; one response per selected API, with OAS-derived named output fields and code-derived join inputs |
| `SplitNativeOutputArray` | `split-native-output-array` | Non-empty `nativeOutputSources` with schemas and actual compiled names |
| `JoinApiItems` | `join-api-items` | At least two distinct `apiMaterials` and non-empty `nativeOutputSources` |

Without context, the all-features inventory contains six `ready` registrations
and six `requires-context` registrations. The latter retain their feature and
`missingContext` list; they do not contain a dummy capability. The returned
`capabilities` array contains only ready registrations plus explicitly supplied
extensions. Hosts must retain and surface pending registrations when relevant,
not report that every family was ready. Re-resolve with actual contracts at the
appropriate host planning stage; no library-owned recursive planning loop is
introduced.

Each missing-context entry is structured data: `field` names `apiMaterials`,
`nativeOutputSources` or `jsonOutput`; array requirements also contain
`minimumItems`. A UI does not need to parse an English message to identify the
missing declaration. Returned requirements are copied, so editing the inventory
does not alter later registrations.

```ts
const inventory = resolveN8nNativeFeatures();
const pending = inventory.registrations.filter(
  (entry) => entry.status === 'requires-context',
);

// apiMaterials must already contain real callId + resolved operation contracts.
const responseFeatures = resolveN8nNativeFeatures({
  features: [
    N8nNativeFeature.SplitApiResponseArray,
    N8nNativeFeature.CollectApiResponses,
  ],
  apiMaterials,
  itemMode: 'linked',
});
```

`ready` only means the implementation can be constructed from the provided
declarations. It does not prove that a selected response pointer is an array,
that a branch dependency is reachable, that source declarations match compiled
producers or that n8n credentials are accessible. Existing parameter, source,
topology, request and runtime response validators still own those checks.

`JsonOutput` deliberately requires a host-owned typed producer contract. Its
feature key is a family identity, not a new fixed capability name. The registry
does not replace an unknown schema with arbitrary JSON. `itemMode` remains an
explicit host execution contract: only the already-supported `linked` mode or
omission is accepted. Neither a batch scope nor item ancestry is guessed.

Manual Trigger is not a selectable native instance. The n8n compiler owns the
start node; pass `describeN8nManualTrigger()` separately to requirement planning.

## Extensions, instances and compatibility

`extensions` accepts complete explicit `N8nNativeCapability` implementations.
Their original objects and functions are retained. Duplicate capability names
are errors; registered implementations are never overwritten. Separate native
instances can use the same capability with distinct node IDs and parameters.
The registry does not allocate or deduplicate workflow instances.

The published `createN8nNativeCapabilities` API still returns its original four
capabilities in the original order. It now delegates to this registration map
with that explicit list. It does not silently expand existing consumers to all
twelve source families. New compositions can adopt the explicit enum boundary.

Add a new built-in family to `types/native-feature-registry.ts` and its factory
to `nodes/native/registry/native-feature-definitions.ts`. The exhaustive keyed
TypeScript map makes a missing registration a compile error. Keep the original
implementation's schemas, ports, provenance and SDK behavior, and add planning,
compilation and runtime regressions. An n8n node's presence in an upstream list
alone does not supply those contracts. This API does not claim support for every
n8n built-in node, arbitrary code generation or unfinished host edit flows.

`test/native-feature-registry.test.mjs` checks the inventory, strict selection,
all twelve SDK factories, actual source enums, extension collisions, unchanged
four-feature compatibility and a scripted-model native-only compilation. Private
OAS integration checks preserve resolved operations without copying private
contracts into packages. Independent tarball consumers check the public enum,
types and material-dependent factory exports with strict TypeScript.

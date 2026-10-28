# Registered n8n feature selection

The current working tree adds `EvaluateResponses` (`evaluate-responses`) after
published 0.4.4. It produces explicit per-check results and counts without stopping
on a valid adverse observation. It shares the existing comparison and source
validation runtime, compiles to an official SDK Code node, and introduces no
health threshold defaults. See [response evaluation](#response-evaluation).
This addition is not yet published or installed in Qoopilot. Current inventory:
18 families, seven constructible without source context and eleven requiring
context. Default planning excludes explicit-only `ComposeApiResponses`, exposing
17 registrations and 16 planning definitions without a host literal producer.
The older inventories below describe their stated historical source versions.

Local unreleased source adds `CollectNativeOutputValues`
(`collect-native-output-values`). It requires actual native output contracts and
reuses official Aggregate through the same compiler as `CollectApiResponses`.
The model selects only the producer and pointer. See the
[collection contract](native-feature-planning.md). Source inventory is 17 families:
six ready and eleven context-dependent without supplied materials. Default planning
excludes explicit-only `ComposeApiResponses`, so it exposes sixteen registrations;
fifteen have planning definitions when no host literal producer was supplied.
These counts describe the working tree, not the installed public 0.3.18.

Unreleased `ProjectNativeOutput` also supports explicitly requested derived string
UTF-16 length and array item counts through official Edit Fields expressions.
Original values remain available as unchanged copy fields. This does not add a
family, infer a counting policy, or provide arbitrary transformations. The detailed
[measurement contract](native-feature-planning.md) separates synthetic/live-model
verification from original-scenario quality and the still-published 0.3.18 install.

Unreleased IF/assertion changes do not add a feature family. Both implementations
now declare API-response and native-JSON parameter references. The supplied
completed native output contracts specialize the value schema; selected future
roles are not treated as already configured data. See the
[native comparison contract](native-feature-planning.md).
The historical published-version inventory below is not a claim that this change
is present in 0.3.18.

`resolveN8nNativePlanningFeatures` exposes stable definitions before producer
instances exist, while retaining missing context separately. The canonical host
opts in with `nativeFeatures`; see [planning and prerequisites](native-feature-planning.md).

This table includes the 0.3.14 `GatherApiResponses` family. The other
families retain their published contracts. The new family is not available in
0.3.13; see the [release record](releases/0.3.14.md) for publication and host status.

`N8nNativeFeature` is the enum-like, immutable list of OSS-supported feature
families. `resolveN8nNativeFeatures` connects them to the existing capability
schemas, provenance declarations, ports and SDK compilers. It makes no model
call and does not discover services, construct source contracts or generate
parameter values.

```ts
import { N8nNativeFeature, resolveN8nNativeFeatures } from '@openapi-flow/n8n';

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

An omitted `features` list in `resolveN8nNativeFeatures` inventories all registered families.
Default `resolveN8nNativePlanningFeatures` excludes definitions marked
`planningExposure: 'explicit-only'`: the legacy `ComposeApiResponses` family.
Explicit selection still returns its unchanged implementation, while new default
plans use `GatherApiResponses` for consolidated complete API results. An explicit
empty list selects none. An explicit non-empty list preserves the supplied
order and rejects unknown or duplicate features. It also fails with a named
missing-context error if a requested factory cannot be constructed. There is
no fallback selection, automatically broadened list or exception-triggered
retry. Supplied invalid context fails even if an unrelated feature was selected.

## Available implementations and additional context

| Enum member               | Capability                  | Additional source context                                                                                                  |
| ------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `If`                      | `if`                        | None; planning later restricts response references to actual API instances                                                 |
| `MergeAppend`             | `merge-append`              | None                                                                                                                       |
| `AssertResponses`         | `assert-responses`          | None; planning later restricts response references to actual API instances                                                 |
| `EvaluateResponses`       | `evaluate-responses`        | Factory accepts explicit API/native source arrays; configured rules require their actual source contracts                  |
| `StopAndError`            | `stop-and-error`            | None                                                                                                                       |
| `PassThrough`             | `pass-through`              | None                                                                                                                       |
| `RejoinExclusiveBranches` | `rejoin-exclusive-branches` | None; final graph still requires the declared IF alternatives                                                              |
| `JsonOutput`              | Host-supplied producer name | `jsonOutput`: explicit name, description and original Zod input schema                                                     |
| `SplitApiResponseArray`   | `split-api-response-array`  | Non-empty `apiMaterials` from resolved OAS contracts                                                                       |
| `CollectApiResponses`     | `collect-api-responses`     | Non-empty `apiMaterials` from resolved OAS contracts                                                                       |
| `ComposeApiResponses`     | `compose-api-responses`     | Non-empty `apiMaterials`; one response per selected API, with OAS-derived named output fields and code-derived join inputs |
| `GatherApiResponses`      | `gather-api-responses`      | Non-empty `apiMaterials`; fixed provenance-bearing results list of complete bodies, one response item per selected call    |
| `SplitNativeOutputArray`  | `split-native-output-array` | Non-empty `nativeOutputSources` with schemas and actual compiled names                                                     |
| `JoinApiItems`            | `join-api-items`            | At least two distinct `apiMaterials` and non-empty `nativeOutputSources`                                                   |

Without context, the all-features inventory contains six `ready` registrations
and seven `requires-context` registrations. The latter retain their feature and
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

## Response evaluation

`assert-responses` throws when a comparison is false. `evaluate-responses` instead
returns `checks` and `summary` data. Each rule explicitly selects an original API
response or native output, a JSON pointer, a scope and its scenario-owned policy.
Ordered strict scalar comparisons map to `normal`, `warning`, `abnormal` or
`undetermined`; the first match wins. `otherwise` is required. The library does
not interpret arbitrary monitoring objects or infer environment/health rules.

`scope` is `value`, `array-items` or `object-values`. The latter two report each
original entry with its escaped absolute source pointer. Missing optional fields
and empty iterated collections produce an `undetermined` result, not an invented
zero or vacuous success. `measurement: 'array-length'` preserves the array as
`actualValue` and emits its separate `measuredValue`. `kind: 'unassessed'` records
an observation for which no supported business decision rule exists.

`createResponseEvaluationCapability({ sources: { apiMaterials, nativeOutputs } })`
requires both source arrays explicitly. Its parameter, result and policy types are
public exports from `@openapi-flow/n8n`. The registry can expose the definition
before producers exist; actual source identities/contracts are bound when rules
are configured. Planning restricts reference IDs to supplied API/native producers.
The compiler checks their unchanged contracts and reachable execution sources.

The official SDK Code node reuses the IF/assertion source reader and strict
comparison functions. Independent branches must first join through Merge;
evaluation is not an implicit join. Default execution reports one combined result
with all contributing input links. Explicit `itemMode: 'linked'` reports one result
per input item and preserves its pairing. Invalid OAS/native data, unknown source
identities, invalid pointers and invalid numeric comparisons remain technical
errors. A valid adverse outcome continues to the next node.

Run `node integration/response-evaluation-local-n8n.mjs` after building. The
disposable n8n 2.37.10 container uses `--network none` and a loopback contract
server. Four valid cases complete and echo unchanged reports to a subsequent API;
one invalid-OAS case fails before that API. Import JSON and a compact report are
written under `.local-artifacts/response-evaluation/`. These synthetic engine
checks are separate from real-model and whole-scenario quality evaluation.

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
all thirteen SDK factories, actual source enums, extension collisions, unchanged
four-feature compatibility and a scripted-model native-only compilation. Private
OAS integration checks preserve resolved operations without copying private
contracts into packages. Independent tarball consumers check the public enum,
types and material-dependent factory exports with strict TypeScript.

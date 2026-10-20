# Native reference structure inspection

This is an unreleased core boundary for unresolved material revisions, not a new
npm 0.2.0 feature. It is one stage of [actual material snapshot resolution](native-material-snapshots.md),
not execution readiness by itself.

`inspectNativeReferenceStructure({ node, capability })` reads the implementation's
explicit `referenceStructureSchema` and `parameterReferenceBindings`. It checks
the capability identity, original parameter shape without defaults/coercion or
transformation, valid RFC 6901 locations, actual stored reference strings and
distinct location declarations. It does not look up producer schemas or create
output contracts. The returned references may intentionally identify removed or
not-yet-resolved producers.

The four material-dependent array/collection/item-join families now declare their
existing base parameter shapes for this purpose. Their full `parametersSchema`,
source lookup, output schema and runtime compilation still enforce actual supplied
identities/contracts. Missing structural opt-in fails explicitly; no schema is
inferred from field names or substituted from another stage. Runtime-owned
parameter objects are not literal structural settings for this API.

This is separate from `describeNativeReferenceBindings`, which retains its full
registered-parameter and actual reference-callback checks. Both share physical
location validation. Existing canonical/output/model/SDK validation has not been
replaced with structural inspection.

## Why the stages differ

The original public-API reproduction changed `/rows` from string items to number
items. Staging/repair/assembly retained the original native output schema from a
captured factory. The n8n adapter correctly rejected compilation with
`binding source source does not match its original OAS response contract`.
No incorrect workflow was exported or executed in this reproduction.

Renaming the result field to `/entries` cannot be repaired with the old factory;
replacing the shared factory first instead invalidates the original draft's
`/rows` validation. This requires separate original/candidate material snapshots
and explicit pending reference/output states, not a weaker export guard.

The current source implementation wires structural inspection into consumer task
discovery and separates original/candidate snapshots. Output contracts are rebuilt
only after actual source contracts and explicit reference decisions exist; readers
use matching actual SDK producers. Pending consumers expose no old output schema.
The three isolated n8n material-revision cases check original strings, same-path
number items and a renamed field with explicit repairs. No old-schema fallback or
automatic pointer mapping has been added. See the snapshot guide for the runtime
scope and remaining completion gates.

See [native reference repairs](workflow-draft-native-reference-repairs.md) and the
[full implementation ledger](conversational-oss-implementation.md).

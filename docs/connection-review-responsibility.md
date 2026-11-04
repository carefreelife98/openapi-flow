# Contract-scoped review and partial delivery

Connection planning uses supplied OpenAPI/native contracts as its planning boundary. Checking which operations are configured does not audit the remote implementation. A newly invented claim about hidden server behavior is not an additional obligation of an ordinary operation-exclusion requirement. Observed runtime contract violations remain real defects and must be reported separately.

## Normalize once, inspect current configuration

A host explicitly selects `reviewBoundary: 'declared-contract'` on the source. This flag is validated and bound to the source fingerprint. In this mode, both Core admission and the model wire schema reject free `semantic` goals; final completion checks cannot reopen an accepted typed obligation as an unrelated semantic veto. Omitting the flag retains the separate legacy semantic-review contract. It does not infer a new policy for existing callers.

The declared verification target is generated workflow configuration, using supplied operation contracts and registered native implementations. It does not claim to predict future response values or inspect remote handlers. The initial independent review still checks original-requirement coverage against normalized goals; it may reject missing or misinterpreted goals before connection planning. Available native capability descriptions are supplied independently of prepared nodes, without copying their full material sources.

Core owns four additional goal kinds. Their `factIds` must reference original requirements. The model interprets the requirement into these goals; that interpretation is not a formal proof of arbitrary natural-language meaning.

- `operation-set`: `nodeIds` is the complete permitted set of supplied API call instance IDs. Core compares the current inventory without depending on order. Repeated operation calls retain distinct IDs. Native nodes, duplicate IDs and invented calls are rejected. This goal makes no hidden implementation guarantee.
- `material-value`: `nodeId`, `materialKind` and an RFC 6901 `pointer` identify current operation, API-argument or native-material evidence. Core compares `expected` using type-strict scalar equality, including null. Only current declared scalar paths are admitted; unavailable fields are explicit boundary errors and never become null or an invented proof obligation. This is useful for exact required configuration values. It does not establish that the model chose the correct expected value from the requirement.
- `material-shape`: admits an actual array/object path and checks its container kind and exact size. Combine this with scalar checks for an exact finite list; scalar equality alone does not exclude additional elements.
- `unsupported`: preserves an explicit unmet requirement, its classified `limitation` (`implementation`, `material`, or `verification`), grounds in `reason`, and every affected node in `nodeIds`. A whole-workflow guarantee must include all affected nodes. Do not use this for an unrequested condition invented during review.

In legacy mode, completion assessments may address only semantic goals. They cannot reclassify an operation-set or material-value result. Structural and typed material checks remain code-owned. Other meaning checks retain the distinction between unreviewed, satisfied, violated and insufficient evidence. Negative semantic reviews are not silently approved.

When a structurally settled session has unsupported goals, `assertWorkflowConnectionReviewCanContinue` raises `WorkflowConnectionUnsupportedRequirementsError` instead of requesting another identical completion review. The host can inspect that exact accepted session for partial delivery. The exception alone is not an executable artifact or a semantic approval.

## Value responsibility belongs to each capability

`WorkflowCapability.parameterValuePolicy` declares `businessInputPaths` and `generatedTextPaths`. These are paths into the capability's parameter value, not paths into its JSON Schema. `*` matches one array index. An empty business path declares the entire typed business object; the typed JSON-output producer uses this contract because its parameters are the actual business output, not producer references.

The value stage may author concise text at generated text paths when exact wording is not requested. Explicit wording remains user data and must be preserved. This permission never supplies a missing price, identifier, comparison threshold, producer reference or output contract.

A `needs-clarification` decision requires `fieldPointers`. Each field must exist in the actual remaining literal schema, belong to a declared business path, and not be generated text. Missing policy declarations do not authorize questions. Overlapping business/generated declarations and duplicate policy paths are rejected at capability intake. Capability authors must declare the value responsibility before introducing a business question; no field-name heuristic or legacy assumption supplies it.

`needs-materials` names a missing system-owned contract or reference. Core raises `NativeParameterMaterialUnavailableError` with the target node and supplied limitation. This does not create a user interrupt, fabricate the contract, or trigger an automatic retry. Initial configuration and existing-node material repair use the same value/question contract. The adapter sends the policy to the model, while Core checks the returned fields independently.

## Preserve checked components and blocked drafts

`inspectWorkflowConnectionDelivery` replays the original accepted connection receipts against the current source fingerprint. It partitions the actual graph using execution edges, data references, declared producer dependencies, exclusive rejoin dependencies, and goals that require shared execution. It does not infer independence from the selection array or remove edges to manufacture it.

An executable component needs explicit accepted roots, closed input/output boundaries, complete required predecessors, no applicable unmet or unreviewed goal, no unresolved gap, and no missing runtime input. Core then validates its projected graph again and checks that its roots equal the accepted roots. Missing control paths and failure handling remain blockers. Unreviewed semantic scope is conservatively retained rather than guessed to affect only an unrelated branch.

The result is `complete`, `partial` or `draft`. Components without a checked `plan` preserve their actual native parameters, prepared API request values/bindings/operation keys, blocked call identities, accepted edges, diagnostic gaps and blockers. Drafts do not embed entire operation/OAS objects. `unmetGoals` retains the original requirement references and limitations; `unmetAssessments` preserves actual negative or insufficient semantic assessments for a host to project separately. A checked component is configuration evidence, not proof of actual service execution, credential access, or fulfillment of the complete request.

The n8n adapter exposes:

- `createWorkflowConnectionDeliveryApiNodes`: obtains API and native SDK source identities through their owning compilers and preserves original request bindings. Missing deployment/credential contracts are compilation errors, not inferred replacements.
- `compileWorkflowConnectionDelivery`: compiles only checked components, using explicitly supplied API fragments. The `runnable` artifacts have scoped node IDs; `drafts` are preserved design data and are not executable n8n JSON.

Hosts must keep the exact child checkpoint when planning stops. They must not substitute the last rejected proposal, rebuild a source from an unrelated checkpoint, or expose the private inspection, OAS documents or raw diagnostics as browser events. A browser summary should select only deliverable counts, availability and concise unmet-requirement explanations. Company integration and deployment remain separate from this library contract.

## Compatibility and verification

This changes the planning wire contract and requires new connection sessions and native question receipts. Existing persisted questions without field ownership cannot be automatically converted. `declared-contract` is an explicit source contract change: do not silently change it on an existing receipt or replay a receipt against a different boundary. Custom capability owners must declare questionable business fields; runtime functions remain outside checkpoint state. Existing strict compilation boundaries are unchanged.

Synthetic regressions cover extra calls, material mismatches, source drift, absent fields, invalid question targets, exact independent component preservation, dependency blocking and typed native-to-API bindings. The local n8n integration executes an independent component, proves that the unsupported component did not run, and checks the exact error message from a configured StopAndError node. These checks do not establish universal natural-language interpretation or the success of a product browser regeneration.

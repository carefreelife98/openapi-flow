# Binding candidate planning (0.5.1)

The per-call binding planner now selects a code-generated source/target candidate. It no longer asks the model to reproduce declared property paths. Existing returned `ApiCallBindingPlan` and `ApiBindingPlan` data retain their format.

## Ownership

- Core: `describeApiBindingCandidates` derives pointer templates from the selected OAS request and original response/native contracts. `resolveApiBindingCandidates` copies the selected identities and properties, resolves explicit dynamic selectors and validates the resulting original binding contract.
- LangChain: `planApiCallBindings` sends a schema containing candidate IDs and typed selector slots. Identical selector shapes share an enum branch. The prompt sends each field template once. No extra judge/model call is introduced for ordinary planning.
- Connection planning: `requiredPrecedence` describes confirmed value/dependency ordering, including input-port scope. It does not create direct edges, assume API inventory order or invent business dependencies. Existing route-availability, join and DAG checks remain authoritative.
- Host: checkpoint validated calls, schedule model work, reserve its own budget and decide when to repair. `createApiCallBindingRejection` supplies private feedback only for the same call/source/contract snapshot. Provider/network errors are not candidate-repair feedback.

## Dynamic paths

Declared properties are copied by code. Array indices and dictionary keys are explicit selector slots; the library does not pick item zero, map equal field names, cast values or flatten an array into a scalar. Recursive/open schemas retain explicit descendant selectors. Every concrete path still passes the original resolver and validator. Keys handled by declared properties or patterns cannot bypass their contracts using an additional-property selector.

A candidate's possible JSON types are a structural prerequisite, not a proof of business meaning, runtime presence or complete JSON Schema subsumption. Numeric/string/enum/range/object constraints still belong to original OAS validation. No valid OAS document is rejected merely because its data paths cannot be exhaustively enumerated.

## Bounded repair example

`examples/langgraph-workflow/src/graph/bindings/plan-api-binding-call-with-repair.ts` composes the public planner and rejection helper. The host supplies `maxRejectedProposals`, can reserve work in `beforeAttempt`, and receives safe rejection counts. A failure outside this exact candidate-planning boundary is rethrown. Rejection feedback is separate from the unchanged scenario; it is not a source of user values.

This example is not installed automatically in Qoopilot. Qoopilot's current public dependency remains 0.5.0. Its local checkpoint changes use already-public source/field/assembly functions. Installing the new candidate and rejection APIs, then connecting bounded automatic correction, is part of the authorized 0.5.1 release and local adoption work; publication and host installation are recorded separately. No local package substitution is used.

## Verification and limits

- Focused checks cover candidate selection, typed selectors, original constraints, stale snapshots, native references, source/target coupling, failure feedback, bounded correction, cancellation and 170-call scheduling.
- Actual provider transport accepted the strict output schema without `allOf`, lookaround patterns or empty tuples.
- A private real OAS probe passed schema/type validation but selected a different same-type business field than the evaluation expected. The original result is retained as a semantic-selection mismatch, not reported as end-to-end success.
- Isolated n8n checks execute incremental connections only with `--incremental-only`. Their fixed binding inputs do not establish full natural-language generation quality.
- The previously documented Ajv special-key limitation remains. Company deployment is not included. The release record distinguishes publication, local adoption and workflow quality.

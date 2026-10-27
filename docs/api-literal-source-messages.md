# Explicit literal-value sources

Unreleased after 0.4.0. This is a library data contract, not a host checkpoint or
automatic recovery executor.

`generateApiArguments` accepts optional `literalSourceMessages` using the existing
public Core `WorkflowSourceMessage` type. Keep `scenario` as planning context and
pass the actual original user text separately when that context is a formatted
JSON envelope. The library never guesses how to unwrap an envelope or decode an
original user JSON string.

```ts
import type { ApiLiteralSourceContext } from '@openapi-flow/core';

const literalContext: ApiLiteralSourceContext = {
  scenario: JSON.stringify({ requests: ['Look up item "0007".'] }),
  literalSourceMessages: [
    { id: 'original-request', text: 'Look up item "0007".' },
  ],
};
```

Compose this data with the selected operation, call ID, bindings, request media
type and model when calling `generateApiArguments`. The host owns these messages
and must preserve actual message and answer provenance. Passing model summaries,
repair explanations or fabricated text does not establish user authorization.

## Deterministic ownership

- With no explicit message list, the existing scenario-only source contract and
  output shape are retained. A JSON envelope remains protected JSON data.
- A supplied list must be nonempty, contain unique nonblank IDs and string text.
  Empty original text remains empty; code never substitutes scenario text.
- Explicit messages enable source/request tracking. One message has a code-owned
  ID, absent from model output. Multiple messages require each model citation to
  select one of the supplied IDs. Unknown IDs and missing IDs are rejected.
- Code verifies complete exact quotations against the selected original message,
  original JSON types, target pointers and coverage. It does not coerce values,
  fill OAS defaults or remove absent required inputs.
- Source messages are snapshotted, included in rejection fingerprints and optional
  literal-generation evidence. Mutation during a model call fails. Historical
  evidence must be validated with its original source snapshot.
- Fully bound/confirmed input still uses no literal model call. Message metadata
  is not executable HTTP node configuration.

The same original messages now reach semantic OAS-enum intent interpretation.
Core derives the actual pending enum contracts and copies the selected OAS value;
the model selects only a per-question candidate ID and an original-message intent
span. `scenario` remains separate call context, not an additional quotation source.
Without explicit messages, the existing scenario/reply-only behavior is unchanged.

Standalone `analyzeApiInputAnswers` / `extractApiInputAnswers` accept optional
`sourceMessages` through Core's public `ApiInputAnswerContext`. Each message has
its own source catalog and original UTF-16 offsets. With one message, source IDs
are code-owned; with multiple messages, each literal/intent selection names a
supplied message ID. Resolved evidence always retains that ID. Questions, record
validation and enum replay preserve these sources rather than joining strings.
No enum value, quotation or source offset is model-generated.

An empty explicit message list is invalid. A valid list of empty original texts
returns `empty-reply` without a model call, even if the separate context mentions
an intent. Conversely, nonempty originals can be used with empty reply context.
Generation rechecks original messages and recovery identity after both the literal
and enum decisions; changing the original source during the second call cannot
adopt stale arguments. Scope changes and ambiguous intent still require the host's
existing decision policy; exact provenance does not prove semantic correctness.

## Originating-stage recovery

`WorkflowConnectionApiRepairContext.literalContext` explicitly carries the same
original `ApiLiteralSourceContext` for API argument recovery. A connection intent
can differ from the initial literal-generation scenario; do not concatenate repair
reasons into either original text.

Core checks the explicit context against the actual argument-planning input while
retaining the original authorized call, operation, role, request media type and
validated binding work. The entire context participates in the repair fingerprint
and post-invocation validation. The field is rejected for binding-planning stages
and cannot override OAS, call identities or input ownership. Without the field,
the existing connection-scenario contract is unchanged.

This is source identity validation, not proof that host-supplied text came from a
human. The host must store and replay the original context rather than synthesize
it from repair feedback. Adoption, budgets, checkpoints, UI and execution remain
separate host work.

The reference API-argument LangGraph stores the checked repair description and
fingerprint, not the executable source contracts, in checkpoint state. It passes
the matching runtime repair context to generation and rejection construction.
Source/policy checks remain active before and after invocation and on resume.
Recovery after an observer failure preserves the completed arguments without
another model call. This example integration is not Qoopilot integration.

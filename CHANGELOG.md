# Changelog

## Unreleased

- Accept explicit, current OAS input slot IDs in fixed-material connection planning and reviewable graph validation. Code derives slot contracts, validates supplied values and retains DAG/source checks; missing values without permission, stale/duplicate IDs and invalid bindings still fail.
- Keep canonical template preflight responsible for runtime input materialization. The legacy executable-fragment compiler cannot inherit deferral through extra caller properties. No host UI integration or new npm version is implied by these source changes.

## 0.3.0 — 2026-10-20

### Conversational library contracts

- Add structured requirement clarification, typed partial answers, bounded optional explanations and review suggestions, without making a server or LangGraph agent mandatory.
- Add serializable canonical drafts, revision-checked atomic edits, scoped readiness, approval invalidation, source-grounded input/binding/native/connection changes and explicit capability gaps.
- Add an extensible eleven-family native feature registry, separate planning definitions and actual material binding, runtime input slots and SDK workflow templates with Korean guides.
- Expose public types and code-owned source/evidence records for independent host composition. The private LangGraph example remains source-only and is not an npm dependency.

### Compatibility and known limits

- Share Zod `^4.6.5` as a peer across all three libraries, with a separate development pin. A separately pinned 4.6.5 copy conflicted with the host's 4.6.7 public schema types; the installed-consumer check now uses the actual Qoopilot TypeScript/LangChain/Node-types/Zod versions and verifies one shared peer resolution, without overrides, casts or skipped declarations.
- Keep all three packages and adapter core dependencies at 0.3.0. Do not mix 0.2.x adapters with 0.3.x core; review the [release and migration notes](docs/releases/0.3.0.md).
- The owner explicitly accepted the known Ajv 8.20.0 `properties.__proto__` limitation for this release. The original regression remains enabled and failing; it is not counted as a pass. OAS documents and values are not renamed or rewritten. See the release note before using that property in generated validation.
- Model-quality limits, incomplete advanced batch/authentication/body mappings, and host-owned review/session/UI responsibilities remain explicit. No numeric quality threshold or universal workflow reliability is claimed.

### Earlier conversational foundation

- Add OAS-derived input requirements, typed answer validation and snapshot/call-scoped confirmed inputs. Confirmed fields are excluded from model generation and applied without overwrites or coercion.
- Add independent API-selection clarification and verbatim-source-checked answer extraction. Existing one-shot selection and generation contracts remain available.
- Add a host-owned checkpointed LangGraph conversation example with API choice, required input questions, invalid-answer correction, cancellation and isolated threads. Interactive literals come from confirmed answers, not speculative scenario generation. These changes are not included in published 0.2.0 and are not automatically published.

## 0.2.0 — 2026-10-16

### Package/API changes

- Split the library into `@openapi-flow/core`, `@openapi-flow/langchain` and `@openapi-flow/n8n`, all versioned 0.2.0. This is not a drop-in API replacement for published core 0.1.0.
- Separate multi-document catalogs, operation contract lookup, model decisions and deterministic request/workflow compilation. The host supplies LangChain models and owns LangGraph, review, retry policy and execution.
- Preserve complete OAS contracts and derive typed literal schemas without asking the model to generate schemas or n8n JSON. Bound fields cannot re-enter literal generation; missing required values fail for clarification.
- Add API/native output bindings, explicit DAG/port validation, library-generated conditions/assertions and reviewable gap regions with detached Manual Trigger connections.
- Add explicit array/item execution, ancestry-based joins, collection and finite batch scopes. These require the documented host-owned execution contracts; automatic batch/scope discovery is not implemented.
- Decode raw HTTP responses in library-owned code so JSON value types remain unchanged. Validate original source responses before binding, splitting and native checks.

### Installation and maintenance

- Include dependencies needed by the pinned n8n SDK's public TypeScript declarations. Verify an independent installed consumer with strict checking and `skipLibCheck: false`.
- Update Scalar parser to 0.29.13 and n8n SDK to 0.36.4, resolving the recorded dependency audit findings without overrides. Dependency licenses remain separate from our MIT license.
- Add release package checks and a repeatable technical release-candidate command. Publication and model-quality approval remain explicit owner decisions.

### Deliberate limits

- Focus: host-reviewed Manual Trigger / outgoing REST workflows. No HTTP server, embedded agent loop, automatic execution or mandatory MCP connection.
- Further webhook/callback work, additional body/authentication mappings and advanced batch cases remain deferred. Unsupported selected-node mappings fail separately from OAS document intake.
- Model-generated gaps, API choices and conditions require review. Known-contract fixture results do not prove unseen-service or production business correctness.
- See the [release](docs/releases/0.2.0.md), [publication verification](docs/releases/0.2.0-publication.md), [criteria](docs/releases/0.2.0-criteria.md) and [migration](docs/migration-0.2.0.md).

## 0.1.0

Earlier published core API. Its usage must not be inferred from the 0.2.0 examples. Legacy behavior retained in this source is explicitly separated under the documented legacy entrypoints.

# Changelog

## Unreleased

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

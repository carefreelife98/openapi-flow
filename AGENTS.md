# Repository conventions

- `packages/core`, `packages/langchain`, and `packages/n8n` are importable libraries. Core must not import LangChain or n8n; the two adapters depend only on core. Host-owned compositions live in `examples/`. Do not add a server unless requested.
- Put TypeScript type aliases and interfaces in their owning package's `src/types/`. Do not declare anonymous object types or local type/interface definitions in logic files.
- Keep OAS/catalog/argument contracts in core, model invocation contracts in langchain, and SDK node/workflow contracts in n8n. Legacy types are explicitly named or nested under `types/legacy/`.
- Put structured-output schema definitions in the owning package's `src/schemas/` and model instructions in langchain's `src/prompts/`.
- Keep OpenAPI parsing, AI planning, and n8n compilation in their named domain directories. Place only domain-neutral helpers in `src/utils/`; put domain-specific validation and mapping in their owning directory.
- Core's `openapi/common`, `openapi/catalog`, `openapi/request` and `openapi/inbound` own OAS intake and source contracts. N8n's `nodes/request` and `workflow` own node creation and graph assembly. Prior workflow implementations live under n8n's `legacy/workflow/`; prior planning under langchain's `legacy/planning/`. Add source-specific behavior only when it differs. Never infer execution order from the selection array.
- Use descriptive file names. `src/public-api.ts` is the package export boundary; do not introduce an ambiguous `index.ts` or `index.tsx` entrypoint.
- Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` from the repository root after changes.

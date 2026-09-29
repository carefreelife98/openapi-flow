# Repository conventions

- `packages/core` is the importable library. Keep the repository root as the private npm workspace; do not add a server unless requested.
- Put TypeScript type aliases and interfaces in `packages/core/src/types/`. Do not declare anonymous object types or local type/interface definitions in logic files.
- Keep shared OAS types in `types/openapi.ts`; request, request-node, request-workflow, sequence-workflow, and planning contracts in their named files; inbound contracts in `types/inbound.ts` and `types/inbound-workflow.ts`.
- Put structured-output schema definitions in `packages/core/src/schemas/`.
- Keep OpenAPI parsing, AI planning, and n8n compilation in their named domain directories. Place only domain-neutral helpers in `src/utils/`; put domain-specific validation and mapping in their owning directory.
- Distinguish OAS operation sources from n8n node types: `openapi/common` and `workflow/common` hold shared behavior; `openapi/request` owns outgoing OAS parsing and serialization; `openapi/inbound` owns Webhook/Callback extraction; `workflow/request` owns outgoing compilation; `workflow/inbound` owns shared inbound compilation. Add source-specific compiler files only when their behavior differs.
- Use descriptive file names. `src/public-api.ts` is the package export boundary; do not introduce an ambiguous `index.ts` or `index.tsx` entrypoint.
- Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` from the repository root after changes.

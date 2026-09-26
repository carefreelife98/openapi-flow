# Repository conventions

- `packages/core` is the importable library. Keep the repository root as the private npm workspace; do not add a server unless requested.
- Put TypeScript type aliases and interfaces in `packages/core/src/types/`. Do not declare anonymous object types or local type/interface definitions in logic files.
- Put structured-output schema definitions in `packages/core/src/schemas/`.
- Keep OpenAPI parsing, AI planning, and n8n compilation in their named domain directories. Place reusable validation and other shared helpers in `src/utils/`; keep domain-specific helpers in clearly named sibling files.
- Use descriptive file names. `src/public-api.ts` is the package export boundary; do not introduce an ambiguous `index.ts` or `index.tsx` entrypoint.
- Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm test` from the repository root after changes.

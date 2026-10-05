# Legacy host compositions

Private workspace examples preserving the earlier `generateWorkflow` and `generateCatalogScenario` orchestration. They demonstrate a host combining core intake, LangChain planning and n8n compilation. They are not exported by the new packages and are not a fourth published library.

The existing functions and user comments were moved intact except for imports and the package-owned request type boundary. `npm run build` compiles these examples after the three packages; regression tests import their generated JavaScript. New applications should use independent public functions so retries and human review can be placed between stages.

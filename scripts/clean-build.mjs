import { rmSync } from 'node:fs';

// These paths contain compiler-generated artifacts only.
for (const target of [
  new URL('../packages/core/dist/', import.meta.url),
  new URL('../packages/langchain/dist/', import.meta.url),
  new URL('../packages/n8n/dist/', import.meta.url),
  new URL('../examples/legacy-generation/dist/', import.meta.url),
]) {
  rmSync(target, { recursive: true, force: true });
}

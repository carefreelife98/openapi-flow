import { readFileSync } from 'node:fs';
import type {
  CreateResponseCheckReaderInput,
  CompiledResponseCheckReader,
} from '../../../types/response-check-compilation.js';
import type { N8nApiResponseSource } from '../../../types/output-binding-source.js';
import { responseReferences } from '../common/response-references.js';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';

/** Reuse full OAS response validation before native comparisons, without changing data. */
export function createResponseCheckReader({
  nodeId,
  checks,
  apiNodeNames,
  apiResponseContracts,
  linked,
}: CreateResponseCheckReaderInput): CompiledResponseCheckReader {
  const ids = [...new Set(responseReferences(checks).map((ref) => ref.nodeId))];
  const bindingSources: N8nApiResponseSource[] = ids.map((id) => {
    const operation = apiResponseContracts?.[id];
    if (!operation)
      throw new Error(
        `native node ${nodeId}: apiResponseContracts is missing ${id}`,
      );
    const nodeName = apiNodeNames[id];
    if (typeof nodeName !== 'string' || !nodeName.trim())
      throw new Error(`native node ${nodeId}: apiNodeNames is missing ${id}`);
    return { kind: 'api-response', nodeId: id, nodeName, operation };
  });
  if (!bindingSources.length)
    return { code: 'const responses=Object.create(null);', bindingSources };
  const runtime = readFileSync(
    new URL('../../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  return {
    code: `${runtime}\n${createOutputReaderCode(bindingSources, linked)}`,
    bindingSources,
  };
}

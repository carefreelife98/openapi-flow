import { readFileSync } from 'node:fs';
import type {
  CreateComparisonInputReaderInput,
  CompiledComparisonInputReader,
} from '../../../types/comparison-input-compilation.js';
import type { N8nOutputBindingSource } from '../../../types/output-binding-source.js';
import { comparisonValueReferences } from '../common/comparison-value-references.js';
import {
  validateNativeOutputContracts,
  createNativeValueSchema,
} from '@openapi-flow/core';
import { createOutputReaderCode } from '../../request/bindings/create-output-reader-code.js';
import { createComparisonEvaluationCode } from './create-comparison-evaluation-code.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** Reuse full OAS or native output validation before comparisons, without changing data. */
export function createComparisonInputReader({
  nodeId,
  checks,
  apiNodeNames,
  apiResponseContracts,
  singletonApiResponseIds,
  nativeOutputSources,
  linked,
}: CreateComparisonInputReaderInput): CompiledComparisonInputReader {
  const references = comparisonValueReferences(checks);
  const ids = [...new Set(references.map((ref) => ref.nodeId))];
  const bindingSources: N8nOutputBindingSource[] = ids.map((id) => {
    const kinds = new Set(
      references.filter((ref) => ref.nodeId === id).map((ref) => ref.source),
    );
    if (kinds.size !== 1)
      throw new Error(
        `native node ${nodeId}: comparison source ${id} cannot be both an API and native producer`,
      );
    if (kinds.has('node-output')) {
      if (!Array.isArray(nativeOutputSources))
        throw new Error(
          `native node ${nodeId}: nativeOutputSources is required for ${id}`,
        );
      const matches = nativeOutputSources.filter(
        (source) => source.nodeId === id,
      );
      if (matches.length !== 1 || !matches[0].nodeName?.trim())
        throw new Error(
          `native node ${nodeId}: nativeOutputSources requires exactly one actual name/schema for ${id}`,
        );
      validateNativeOutputContracts(matches);
      for (const reference of references.filter(
        (reference) => reference.nodeId === id,
      ))
        createNativeValueSchema(matches[0], reference.pointer);
      return { ...matches[0], kind: 'native-json' };
    }
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
    // IF expression errors are not a reliable failure boundary in n8n. Validate each
    // selected pointer and operator type in Code; a valid false result is not an error.
    code: `${runtime}\n${createOutputReaderCode(bindingSources, linked, singletonApiResponseIds)}\n(()=>{${createComparisonEvaluationCode('')}\nconst checks=${javascriptJsonLiteral(checks)};for(const check of checks)compare(check);})();`,
    bindingSources,
  };
}

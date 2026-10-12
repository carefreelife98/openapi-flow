import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { createApiCatalog, listApiOperations } from '@openapi-flow/core';
import type { ApiSource } from '@openapi-flow/core';
import type {
  PreparedSelectionEvaluation,
  EvaluationDocument,
} from '../../types/api-selection-evaluation.js';
import { apiSelectionEvaluationDatasetSchema } from '../../schemas/api-selection-evaluation-schema.js';
import { evaluationOperationIdentity } from './score-api-selection.js';

/** Freeze file bytes and validate every answer before any model request. */
export async function prepareApiSelectionEvaluation(
  datasetPath: string,
): Promise<PreparedSelectionEvaluation> {
  const bytes = await readFile(datasetPath);
  const dataset = apiSelectionEvaluationDatasetSchema.parse(
    JSON.parse(bytes.toString('utf8')),
  );
  const sourceIds = new Set<string>();
  const sources: ApiSource[] = [];
  const documents: EvaluationDocument[] = [];
  for (const source of dataset.sources) {
    if (sourceIds.has(source.id))
      throw new Error(`dataset.sources has duplicate id ${source.id}`);
    sourceIds.add(source.id);
    const specBytes = await readFile(
      resolve(dirname(datasetPath), source.specFile),
    );
    const actual = createHash('sha256').update(specBytes).digest('hex');
    if (actual !== source.sha256)
      throw new Error(
        `dataset.sources[${source.id}].sha256 does not match specFile`,
      );
    sources.push({
      id: source.id,
      spec: JSON.parse(specBytes.toString('utf8')),
    });
    documents.push({ id: source.id, sha256: actual, operations: 0 });
  }
  const operations = listApiOperations(await createApiCatalog(sources));
  for (const document of documents)
    document.operations = operations.filter(
      (op) => op.key.documentId === document.id,
    ).length;
  const available = new Set(
    operations.map((op) => evaluationOperationIdentity(op.key)),
  );
  const caseIds = new Set<string>();
  for (const entry of dataset.cases) {
    if (caseIds.has(entry.id))
      throw new Error(`dataset.cases has duplicate id ${entry.id}`);
    caseIds.add(entry.id);
    if (!entry.scenario.trim())
      throw new Error(`dataset.cases[${entry.id}].scenario must be non-empty`);
    if (entry.expectedOperations.length === 0 && !entry.expectedGap)
      throw new Error(
        `dataset.cases[${entry.id}] must expect operations or an API gap`,
      );
    for (const operation of entry.expectedOperations) {
      if (!available.has(evaluationOperationIdentity(operation)))
        throw new Error(
          `dataset.cases[${entry.id}] references an unknown expectedOperation`,
        );
    }
  }
  return {
    dataset,
    operations,
    documents,
    datasetSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

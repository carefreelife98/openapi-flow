import type {
  Operation,
  OperationCandidate,
  OperationSource,
  ParsedDocument,
} from '../types/openapi.js';
import { mapOperationForWorkflow } from './operation-mapping.js';
import { operationMetadata } from './operation-metadata.js';
import { operationEntries, operationReference } from './operation-reference.js';
import { dereferencedObject, object } from './parse-spec-utils.js';
import { validatedDocument } from './validate-spec.js';

export function operationsFromDocument({
  paths,
}: ParsedDocument): OperationCandidate[] {
  const operations: OperationCandidate[] = [];
  for (const [path, pathValue] of Object.entries(paths)) {
    const pathItem = dereferencedObject(pathValue, `spec.paths[${path}]`);
    for (const { method, key, value } of operationEntries(pathItem)) {
      const operation = object(value, `spec.paths[${path}].${key}`);
      operations.push({
        operationRef: operationReference(path, key),
        ...operationMetadata(operation, `spec.paths[${path}].${key}`),
        method,
        path,
      });
    }
  }
  const ids = operations.flatMap(({ operationId }) =>
    operationId === undefined ? [] : [operationId],
  );
  if (new Set(ids).size !== ids.length)
    throw new Error('spec.paths has duplicate operationId values');
  return operations;
}

export async function operationsFromSpec(
  input: unknown,
): Promise<OperationCandidate[]> {
  return operationsFromDocument(await validatedDocument(input));
}

export async function operationFromSpec(
  input: unknown,
  operationRef: string,
): Promise<Operation> {
  return operationFromDocument(await validatedDocument(input), operationRef);
}

function selectedOperationSource(
  parsed: ParsedDocument,
  operationRef: string,
): OperationSource {
  const candidates = operationsFromDocument(parsed);
  const matches = candidates.filter(
    (item) =>
      item.operationRef === operationRef || item.operationId === operationRef,
  );
  if (matches.length > 1)
    throw new Error(
      'plan.operationRef identifies multiple operations: ' + operationRef,
    );
  const candidate = matches[0];
  if (!candidate)
    throw new Error('plan.operationRef is not in spec.paths: ' + operationRef);
  const pathItem = dereferencedObject(
    parsed.paths[candidate.path],
    `spec.paths[${candidate.path}]`,
  );
  const operationEntry = operationEntries(pathItem).find(
    ({ key }) =>
      operationReference(candidate.path, key) === candidate.operationRef,
  );
  if (!operationEntry)
    throw new Error(
      'spec.paths is missing operation: ' + candidate.operationRef,
    );
  return { candidate, pathItem, entry: operationEntry };
}

export function operationFromDocument(
  parsed: ParsedDocument,
  operationRef: string,
): Operation {
  const { candidate, pathItem, entry } = selectedOperationSource(
    parsed,
    operationRef,
  );
  return mapOperationForWorkflow(
    parsed.spec,
    candidate.path,
    candidate.method,
    candidate.operationRef,
    pathItem,
    entry.value,
  );
}

import { createHash } from 'node:crypto';
import type { ApiCatalog, ApiOperationKey } from '../types/api-catalog.js';
import type {
  ApiOperationContract,
  ApiOperationObject,
  ApiParameterObject,
  ApiPathItemObject,
  ApiSecurityRequirement,
  ApiServerObject,
} from '../types/api-operation.js';
import type { JsonObject, ParsedDocument } from '../types/openapi.js';
import { object } from './common/parse-spec-utils.js';
import { validateAndResolveOpenApiDocument } from './common/validate-spec.js';
import { selectedOperationSource } from './request/parse-request-operations.js';

export async function resolveApiOperations(
  catalog: ApiCatalog,
  keys: ApiOperationKey[],
): Promise<ApiOperationContract[]> {
  if (!Array.isArray(keys)) throw new Error('operation keys must be an array');
  const documents = new Map<string, ParsedDocument>();
  const contracts: ApiOperationContract[] = [];
  for (const key of keys) {
    if (
      !key ||
      typeof key.documentId !== 'string' ||
      !key.documentId.trim() ||
      typeof key.snapshotId !== 'string' ||
      !key.snapshotId ||
      typeof key.operationRef !== 'string' ||
      !key.operationRef
    )
      throw new Error(
        'operation keys require documentId, snapshotId and operationRef',
      );
    const source = catalog.documents.find((item) => item.id === key.documentId);
    if (!source)
      throw new Error(
        `operation.documentId ${key.documentId} is not in catalog`,
      );
    if (source.snapshotId !== key.snapshotId)
      throw new Error(
        `operation.snapshotId does not match sources[${source.id}]`,
      );
    if (
      createHash('sha256').update(JSON.stringify(source.spec)).digest('hex') !==
      source.snapshotId
    )
      throw new Error(
        `sources[${source.id}].spec changed after catalog creation`,
      );
    if (
      !catalog.operations.some(
        (item) =>
          item.key.documentId === key.documentId &&
          item.operationRef === key.operationRef,
      )
    )
      throw new Error(
        `sources[${source.id}] has no operationRef ${key.operationRef}`,
      );
    let document = documents.get(source.id);
    if (!document) {
      document = await validateAndResolveOpenApiDocument(source.spec);
      documents.set(source.id, document);
    }
    const { candidate, pathItem, entry } = selectedOperationSource(
      document,
      key.operationRef,
    );
    const operation = object(
      entry.value,
      `sources[${source.id}].${key.operationRef}`,
    );
    const parameters = new Map<string, ApiParameterObject>();
    for (const level of [pathItem, operation]) {
      if (level.parameters === undefined) continue;
      if (!Array.isArray(level.parameters))
        throw new Error(
          `sources[${source.id}].${key.operationRef}.parameters must be an array`,
        );
      for (const raw of level.parameters) {
        const parameter = object(raw, `${key.operationRef}.parameters`);
        parameters.set(
          JSON.stringify([parameter.in, parameter.name]),
          parameter as unknown as ApiParameterObject,
        );
      }
    }
    const security =
      operation.security === undefined
        ? document.spec.security
        : operation.security;
    const servers =
      operation.servers === undefined
        ? pathItem.servers === undefined
          ? document.spec.servers
          : pathItem.servers
        : operation.servers;
    const components =
      document.spec.components === undefined
        ? undefined
        : object(document.spec.components, 'spec.components');
    if (typeof document.spec.openapi !== 'string')
      throw new Error(`sources[${source.id}].spec.openapi is missing`);
    contracts.push({
      key: { ...key },
      openapiVersion: document.spec.openapi,
      source: 'paths',
      method: candidate.method,
      path: candidate.path,
      operation: structuredClone(operation) as unknown as ApiOperationObject,
      pathItem: structuredClone(pathItem) as unknown as ApiPathItemObject,
      effective: {
        parameters: [...parameters.values()],
        security:
          security === undefined
            ? []
            : (structuredClone(security) as ApiSecurityRequirement[]),
        securitySchemes:
          components?.securitySchemes === undefined
            ? {}
            : (object(
                components.securitySchemes,
                'spec.components.securitySchemes',
              ) as JsonObject),
        ...(servers === undefined
          ? {}
          : { servers: structuredClone(servers) as ApiServerObject[] }),
      },
    });
  }
  return contracts;
}

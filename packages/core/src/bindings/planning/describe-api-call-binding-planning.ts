import { createHash } from 'node:crypto';
import type {
  ApiBindingSourceCandidate,
  ApiCallBindingPlanningDescription,
  ApiCallBindingPlanningInput,
} from '../../types/api-call-binding-planning.js';
import { describeApiBindingPlanning } from './describe-api-binding-planning.js';
import { createApiRequestSchema } from '../../schemas/create-api-request-schema.js';
import { apiCallBindingOptionsSchema } from '../../schemas/api-call-binding-planning-schema.js';

/** All source identities remain discoverable; only selected sources are hydrated later. */
export function describeApiCallBindingPlanning(
  input: ApiCallBindingPlanningInput,
): ApiCallBindingPlanningDescription {
  const options = apiCallBindingOptionsSchema.parse(input);
  const description = describeApiBindingPlanning(input);
  const target = description.input.materials.find(
    (item) => item.callId === options.callId,
  );
  if (!target)
    throw new Error(`binding target callId ${options.callId} is absent`);
  const candidates: ApiBindingSourceCandidate[] =
    description.context.materials.map(
      ({ callId, operation, purpose, responsePointerCatalog }) => ({
        kind: 'api',
        nodeId: callId,
        key: operation.key,
        method: operation.method,
        path: operation.path,
        ...(purpose === undefined ? {} : { purpose }),
        ...(operation.operation.summary === undefined
          ? {}
          : { summary: operation.operation.summary }),
        ...(operation.operation.description === undefined
          ? {}
          : { description: operation.operation.description }),
        ...(operation.operation.operationId === undefined
          ? {}
          : { operationId: operation.operation.operationId }),
        ...(operation.operation.tags === undefined
          ? {}
          : { tags: operation.operation.tags }),
        outputPointers: [
          ...new Set(
            responsePointerCatalog.flatMap((response) =>
              response.declaredPointers.map((entry) => entry.pointer),
            ),
          ),
        ],
      }),
    );
  for (const output of description.input.nativeOutputs ?? [])
    candidates.push({
      kind: 'native',
      nodeId: output.nodeId,
      // Native schemas are not flattened into invented field declarations.
      outputPointers: [],
      schema: structuredClone(output.schema),
    });
  const snapshot: ApiCallBindingPlanningInput = {
    ...description.input,
    ...options,
  };
  return {
    fingerprint: createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex'),
    input: snapshot,
    target: candidates.find((candidate) => candidate.nodeId === target.callId)!,
    requestSchema: createApiRequestSchema(target),
    sourceCandidates: candidates.filter(
      (candidate) => candidate.nodeId !== target.callId,
    ),
  };
}

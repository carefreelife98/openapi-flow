import { createSchemaResourceContext } from '../resources/create-schema-resource-context.js';
import { createHash } from 'node:crypto';
import type {
  ApiBindingCandidateCatalog,
  DescribeApiBindingCandidatesInput,
} from '../../types/api-binding-candidates.js';
import { describeApiCallBindingPlanning } from '../planning/describe-api-call-binding-planning.js';
import { resolveApiBindingSourceSelection } from '../planning/resolve-api-binding-source-selection.js';
import { jsonValuesEqual } from '../../utils/json-values-equal.js';
import { responseBindingSchemas } from '../response-binding-schema.js';
import { listBindingPointerTemplates } from './list-binding-pointer-templates.js';

export function describeApiBindingCandidates(
  input: DescribeApiBindingCandidatesInput,
): ApiBindingCandidateCatalog {
  const description = describeApiCallBindingPlanning(input);
  const sources = resolveApiBindingSourceSelection({
    ...description.input,
    proposal: {
      sourceNodeIds: input.sources.sourceNodeIds,
      ...(input.sources.keySelections === undefined
        ? {}
        : { keySelections: input.sources.keySelections }),
      gaps: input.sources.gaps,
      ...(input.sources.reason === undefined
        ? {}
        : { reason: input.sources.reason }),
    },
  });
  if (!jsonValuesEqual(sources, input.sources))
    throw new Error(
      'Binding candidate sources do not match the current planning snapshot',
    );
  const targets = listBindingPointerTemplates(description.requestSchema).filter(
    ({ segments }) => {
      const root = segments[0];
      return (
        root?.kind === 'property' &&
        (root.value === 'body' ||
          (segments.length >= 2 && segments[1].kind === 'property'))
      );
    },
  );
  const catalog: ApiBindingCandidateCatalog = {
    fingerprint: description.fingerprint,
    candidates: [],
  };
  const ids = new Set<string>();
  for (const sourceNodeId of sources.sourceNodeIds) {
    const api = description.input.materials.find(
      (material) => material.callId === sourceNodeId,
    );
    const native = description.input.nativeOutputs?.find(
      (output) => output.nodeId === sourceNodeId,
    );
    if (!api && !native)
      throw new Error(`Unknown binding candidate source ${sourceNodeId}`);
    const resources =
      native === undefined
        ? undefined
        : createSchemaResourceContext(native.schema);
    const schemas = api
      ? responseBindingSchemas(api.operation, '')
      : [resources!.root];
    for (const schema of schemas)
      for (const source of listBindingPointerTemplates(schema, resources))
        for (const target of targets) {
          if (!source.types.some((type) => target.types.includes(type)))
            continue;
          const id =
            'binding-' +
            createHash('sha256')
              .update(
                JSON.stringify([
                  description.fingerprint,
                  sourceNodeId,
                  source,
                  target,
                ]),
              )
              .digest('hex')
              .slice(0, 24);
          if (ids.has(id)) continue;
          ids.add(id);
          catalog.candidates.push({ id, sourceNodeId, source, target });
        }
  }
  return catalog;
}

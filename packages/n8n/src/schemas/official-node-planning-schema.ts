import { z } from 'zod';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import type { N8nOfficialNodePlanningCatalog } from '../types/official-node-planning.js';

export const n8nOfficialNodeSelectionSchema = z.strictObject({
  nodeType: z.string().refine((value) => value.trim().length > 0, {
    message: 'nodeType must name an official node definition',
  }),
  version: z.number(),
});

export const n8nOfficialNodeSelectionsSchema = z.array(
  n8nOfficialNodeSelectionSchema,
);

/** Choose an existing definition; the model must not regenerate its name, version or options. */
export function createN8nOfficialNodeChoiceSchema(
  catalog: N8nOfficialNodePlanningCatalog,
) {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'createN8nOfficialNodeChoiceSchema',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      if (!Array.isArray(catalog?.materials))
        throw new Error('official node catalog materials must be an array');
      const ids = catalog.materials.map((material, index) => {
        if (
          typeof material?.definitionId !== 'string' ||
          !material.definitionId.trim()
        )
          throw new Error(
            `official node catalog materials[${index}].definitionId is missing`,
          );
        return material.definitionId;
      });
      if (new Set(ids).size !== ids.length)
        throw new Error(
          'official node catalog definitionId values must be unique',
        );
      return ids.length === 0
        ? z.never()
        : z
            .enum(ids)
            .describe('ID of one supplied official n8n node definition');
    },
  );
}

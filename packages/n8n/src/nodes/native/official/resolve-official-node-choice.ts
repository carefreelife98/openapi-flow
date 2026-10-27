import { runOpenApiFlowOperation } from '@openapi-flow/core';
import { createN8nOfficialNodeChoiceSchema } from '../../../schemas/official-node-planning-schema.js';
import type {
  N8nOfficialNodePlanningCatalog,
  N8nOfficialNodePlanningMaterial,
} from '../../../types/official-node-planning.js';

export function resolveN8nOfficialNodeChoice(
  catalog: N8nOfficialNodePlanningCatalog,
  definitionId: string,
): N8nOfficialNodePlanningMaterial {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'resolveN8nOfficialNodeChoice',
      stage: 'contract-validation',
      code: 'NATIVE_NODE_PLANNING_FAILED',
    },
    () => {
      const parsed =
        createN8nOfficialNodeChoiceSchema(catalog).safeParse(definitionId);
      if (!parsed.success)
        throw new Error(
          `official node choice is not a supplied definitionId: ${definitionId}`,
        );
      const matches = catalog.materials.filter(
        (material) => material.definitionId === parsed.data,
      );
      if (matches.length !== 1)
        throw new Error(
          `official node choice requires exactly one material: ${definitionId}`,
        );
      return structuredClone(matches[0]);
    },
  );
}

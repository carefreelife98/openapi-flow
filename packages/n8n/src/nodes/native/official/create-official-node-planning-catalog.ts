import { filterPropertiesForVersion } from '@n8n/workflow-sdk';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import { n8nOfficialNodeSelectionsSchema } from '../../../schemas/official-node-planning-schema.js';
import type {
  CreateN8nOfficialNodePlanningCatalogInput,
  N8nOfficialNodePlanningCatalog,
} from '../../../types/official-node-planning.js';
import { describeOfficialNodePorts } from './describe-official-node-ports.js';

export function createN8nOfficialNodePlanningCatalog(
  input: CreateN8nOfficialNodePlanningCatalogInput,
): N8nOfficialNodePlanningCatalog {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'createN8nOfficialNodePlanningCatalog',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      if (!Array.isArray(input?.definitions))
        throw new Error(
          'official node definitions must be an SDK definition array',
        );
      const parsed = n8nOfficialNodeSelectionsSchema.safeParse(
        input.selections,
      );
      if (!parsed.success)
        throw new Error(
          `official node selections is invalid: ${parsed.error.message}`,
        );
      const definitions = structuredClone(input.definitions);
      const ids = new Set<string>();
      const materials = parsed.data.map((selection) => {
        const definitionId = `${selection.nodeType}@${selection.version}`;
        if (ids.has(definitionId))
          throw new Error(`official node selections repeats ${definitionId}`);
        ids.add(definitionId);
        const matches = definitions.filter(
          (definition) =>
            definition?.name === selection.nodeType &&
            (Array.isArray(definition.version)
              ? definition.version.includes(selection.version)
              : definition.version === selection.version),
        );
        if (matches.length !== 1)
          throw new Error(
            `official node definitions requires exactly one ${definitionId}; found ${matches.length}`,
          );
        const definition = structuredClone(matches[0]);
        if (!Array.isArray(definition.properties))
          throw new Error(
            `${definitionId}.properties must be an SDK property array`,
          );
        if (
          typeof definition.displayName !== 'string' ||
          !definition.displayName.trim()
        )
          throw new Error(`${definitionId}.displayName is missing`);
        return {
          definitionId,
          selection,
          definition,
          versionProperties: structuredClone(
            filterPropertiesForVersion(
              definition.properties,
              selection.version,
            ),
          ),
          inputs: describeOfficialNodePorts(
            definition.inputs,
            `${definitionId}.inputs`,
          ),
          outputs: describeOfficialNodePorts(
            definition.outputs,
            `${definitionId}.outputs`,
          ),
        };
      });
      return { materials };
    },
  );
}

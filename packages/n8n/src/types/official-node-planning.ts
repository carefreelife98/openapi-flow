import type { NodeProperty, NodeTypeDescription } from '@n8n/workflow-sdk';
import type { z } from 'zod';
import type { n8nOfficialNodeSelectionSchema } from '../schemas/official-node-planning-schema.js';

export type N8nOfficialNodeSelection = z.infer<
  typeof n8nOfficialNodeSelectionSchema
>;

export type N8nOfficialNodePortDefinition =
  | {
      status: 'declared';
      ports: Exclude<NodeTypeDescription['inputs'], string>;
    }
  | { status: 'dynamic-expression'; expression: string };

/** Metadata for planning, not an executable WorkflowCapability or an OAS output contract. */
export interface N8nOfficialNodePlanningMaterial {
  definitionId: string;
  selection: N8nOfficialNodeSelection;
  definition: NodeTypeDescription;
  versionProperties: NodeProperty[];
  inputs: N8nOfficialNodePortDefinition;
  outputs: N8nOfficialNodePortDefinition;
}

export interface N8nOfficialNodePlanningCatalog {
  materials: N8nOfficialNodePlanningMaterial[];
}

export interface CreateN8nOfficialNodePlanningCatalogInput {
  definitions: NodeTypeDescription[];
  selections: N8nOfficialNodeSelection[];
}

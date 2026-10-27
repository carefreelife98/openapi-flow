import type { NodeConfig } from '@n8n/workflow-sdk';
import type { JsonValueObject } from '@openapi-flow/core';
import type { N8nOfficialNodePlanningCatalog } from './official-node-planning.js';

export type N8nOfficialNodeConfiguration = NodeConfig<JsonValueObject> &
  Required<
    Pick<NodeConfig<JsonValueObject>, 'id' | 'name' | 'position' | 'parameters'>
  >;

export interface ValidateN8nOfficialNodeConfigurationInput {
  catalog: N8nOfficialNodePlanningCatalog;
  definitionId: string;
  /** Explicit trusted SDK-generated schema roots; no SDK-global default discovery. */
  schemaDirectories: string[];
  configuration: Pick<N8nOfficialNodeConfiguration, 'parameters' | 'subnodes'>;
}

export interface CreateN8nOfficialNodeInput extends Omit<
  ValidateN8nOfficialNodeConfigurationInput,
  'configuration'
> {
  configuration: N8nOfficialNodeConfiguration;
}

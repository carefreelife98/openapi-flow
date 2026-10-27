import { node } from '@n8n/workflow-sdk';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import { n8nOfficialNodeIdentitySchema } from '../../../schemas/official-node-configuration-schema.js';
import type { CreateN8nOfficialNodeInput } from '../../../types/official-node-configuration.js';
import type { N8nSdkNode } from '../../../types/node-fragment.js';
import { resolveN8nOfficialNodeChoice } from './resolve-official-node-choice.js';
import { validateN8nOfficialNodeConfiguration } from './validate-official-node-configuration.js';

/** Construct an official SDK node, not a fragment with inferred OAS or execution-flow contracts. */
export function createN8nOfficialNode(
  input: CreateN8nOfficialNodeInput,
): N8nSdkNode {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'createN8nOfficialNode',
      stage: 'compilation',
      code: 'N8N_COMPILATION_FAILED',
    },
    () => {
      const identity = n8nOfficialNodeIdentitySchema.safeParse(
        input?.configuration,
      );
      if (!identity.success)
        throw new Error(
          `official node configuration identity is invalid: ${identity.error.message}`,
        );
      const material = resolveN8nOfficialNodeChoice(
        input.catalog,
        input.definitionId,
      );
      const validation = validateN8nOfficialNodeConfiguration(input);
      if (!validation.valid)
        throw new Error(
          `official node ${material.definitionId} configuration failed SDK validation: ${JSON.stringify(validation.errors)}`,
        );
      return node({
        type: material.selection.nodeType,
        version: material.selection.version,
        config: {
          ...input.configuration,
          position: [...input.configuration.position],
          parameters: structuredClone(input.configuration.parameters),
        },
      });
    },
  );
}

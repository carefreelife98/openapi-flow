import {
  getSchemaBaseDirs,
  setSchemaBaseDirs,
  validateNodeConfig,
} from '@n8n/workflow-sdk';
import type { SchemaValidationResult } from '@n8n/workflow-sdk';
import { runOpenApiFlowOperation } from '@openapi-flow/core';
import {
  n8nOfficialNodeParametersSchema,
  n8nOfficialSchemaDirectoriesSchema,
} from '../../../schemas/official-node-configuration-schema.js';
import type { ValidateN8nOfficialNodeConfigurationInput } from '../../../types/official-node-configuration.js';
import { resolveN8nOfficialNodeChoice } from './resolve-official-node-choice.js';

export function validateN8nOfficialNodeConfiguration(
  input: ValidateN8nOfficialNodeConfigurationInput,
): SchemaValidationResult {
  return runOpenApiFlowOperation(
    {
      owner: 'n8n',
      operation: 'validateN8nOfficialNodeConfiguration',
      stage: 'contract-validation',
      code: 'NATIVE_NODE_PLANNING_FAILED',
    },
    () => {
      if (!input)
        throw new Error(
          'official node configuration validation input is required',
        );
      const material = resolveN8nOfficialNodeChoice(
        input.catalog,
        input.definitionId,
      );
      const directories = n8nOfficialSchemaDirectoriesSchema.safeParse(
        input.schemaDirectories,
      );
      if (!directories.success)
        throw new Error(
          `official node schemaDirectories is invalid: ${directories.error.message}`,
        );
      const parameters = n8nOfficialNodeParametersSchema.safeParse(
        input.configuration?.parameters,
      );
      if (!parameters.success)
        throw new Error(
          `official node ${material.definitionId} configuration.parameters must be a JSON object: ${parameters.error.message}`,
        );
      const previousDirectories = [...getSchemaBaseDirs()];
      try {
        setSchemaBaseDirs([...directories.data]);
        const { nodeType, version } = material.selection;
        // Every official generated envelope requires object parameters. Without a loaded
        // schema the SDK accepts even this negative control: never count that as validation.
        const readiness = validateNodeConfig(nodeType, version, {
          parameters: 17,
        });
        if (readiness.valid)
          throw new Error(
            `official node ${material.definitionId} configuration schema is not verified as loaded: SDK accepted the non-object readiness control from the supplied schemaDirectories`,
          );
        return validateNodeConfig(nodeType, version, {
          ...input.configuration,
          parameters: structuredClone(input.configuration.parameters),
        });
      } finally {
        // This entire scope is synchronous. No global schema path survives the call or an error.
        setSchemaBaseDirs(previousDirectories);
      }
    },
  );
}

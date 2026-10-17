import { createHash } from 'node:crypto';
import type {
  InspectApiArgumentRequirementsInput,
  ApiArgumentRequirements,
} from '../../types/api-clarification.js';
import { validateApiArguments } from '../validate-api-arguments.js';
import { requestBindingSchemas } from '../../bindings/request-binding-schema.js';
import { unionBindingSchemas } from '../../bindings/combine-binding-schemas.js';
import { pointerTokens } from '../../bindings/json-pointer.js';

export function inspectApiArgumentRequirements(
  input: InspectApiArgumentRequirementsInput,
): ApiArgumentRequirements {
  if (!input.callId?.trim())
    throw new Error('input requirements require callId');
  const validation = validateApiArguments(input);
  return {
    status: validation.valid ? 'ready' : 'needs-input',
    requirements: validation.missingInputs.map((targetPointer) => {
      const schemas = requestBindingSchemas(input, targetPointer);
      if (!schemas.length)
        throw new Error(
          `Missing input ${targetPointer} has no OAS request schema`,
        );
      const schema = unionBindingSchemas(schemas);
      const [location, name] = pointerTokens(targetPointer);
      const parameter = input.operation.effective.parameters.find(
        (item) => item.in === location && item.name === name,
      );
      return {
        kind: 'missing-input',
        id: createHash('sha256')
          .update(
            JSON.stringify([
              input.callId,
              input.operation.key,
              targetPointer,
              schema,
            ]),
          )
          .digest('hex'),
        callId: input.callId,
        operation: structuredClone(input.operation.key),
        targetPointer,
        schema: structuredClone(schema),
        openapiVersion: input.operation.openapiVersion,
        ...(typeof input.operation.operation.summary === 'string'
          ? { operationSummary: input.operation.operation.summary }
          : {}),
        ...(typeof parameter?.description === 'string'
          ? { parameterDescription: parameter.description }
          : {}),
        message: `Provide required request value ${targetPointer} for ${input.operation.method} ${input.operation.path}.`,
      };
    }),
  };
}

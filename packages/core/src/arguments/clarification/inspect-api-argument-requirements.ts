import { createHash } from 'node:crypto';
import type {
  InspectApiArgumentRequirementsInput,
  ApiArgumentRequirements,
} from '../../types/api-clarification.js';
import { validateApiArguments } from '../validate-api-arguments.js';
import { requestBindingSchemas } from '../../bindings/request-binding-schema.js';
import { unionBindingSchemas } from '../../bindings/combine-binding-schemas.js';
import { hasPointer, pointerTokens } from '../../bindings/json-pointer.js';
import { listMissingRequestedApiInputs } from './list-missing-requested-api-inputs.js';

export function inspectApiArgumentRequirements(
  input: InspectApiArgumentRequirementsInput,
): ApiArgumentRequirements {
  if (!input.callId?.trim())
    throw new Error('input requirements require callId');
  const validation = validateApiArguments(input);
  const requestedMissing = listMissingRequestedApiInputs({
    source: `Request ${input.callId}`,
    rootPointer: '',
    value: input.values,
    requestedInputs: input.requestedInputs,
  });
  for (const pointer of input.requestedInputs === undefined
    ? []
    : input.requestedInputs)
    if (!requestBindingSchemas(input, pointer).length)
      throw new Error(
        `Request ${input.callId}.requestedInputs ${pointer} is not declared by its OAS`,
      );
  const requestedTargets = requestedMissing
    .filter(
      (pointer) =>
        !input.bindings.some(
          (binding) =>
            binding.targetPointer === pointer ||
            binding.targetPointer.startsWith(pointer + '/') ||
            pointer.startsWith(binding.targetPointer + '/'),
        ),
    )
    .map((pointer) => {
      const tokens = pointerTokens(pointer);
      const rootLength = tokens[0] === 'body' ? 1 : 2;
      for (let length = rootLength; length <= tokens.length; length++) {
        const prefix =
          '/' +
          tokens
            .slice(0, length)
            .map((token) => token.replaceAll('~', '~0').replaceAll('/', '~1'))
            .join('/');
        if (
          !hasPointer(input.values, prefix) &&
          !input.bindings.some((binding) =>
            binding.targetPointer.startsWith(prefix + '/'),
          )
        )
          return prefix;
      }
      return pointer;
    });
  const missing = [
    ...new Set([...validation.missingInputs, ...requestedTargets]),
  ].filter(
    (pointer, _, pointers) =>
      !pointers.some(
        (parent) => parent !== pointer && pointer.startsWith(parent + '/'),
      ),
  );
  const requirements = missing.map(
    (targetPointer): ApiArgumentRequirements['requirements'][number] => {
      const schemas = requestBindingSchemas(input, targetPointer);
      if (!schemas.length)
        throw new Error(
          `Missing input ${targetPointer} has no OAS request schema`,
        );
      const schema = unionBindingSchemas(schemas);
      const [location, name] = pointerTokens(targetPointer);
      const requestedInputs = input.requestedInputs?.filter(
        (pointer) =>
          pointer === targetPointer || pointer.startsWith(targetPointer + '/'),
      );
      const requested =
        requestedInputs !== undefined && requestedInputs.length > 0;
      const kind = validation.missingInputs.includes(targetPointer)
        ? 'missing-input'
        : 'requested-input';
      const parameter = input.operation.effective.parameters.find(
        (item) => item.in === location && item.name === name,
      );
      return {
        kind,
        id: createHash('sha256')
          .update(
            JSON.stringify([
              input.callId,
              input.operation.key,
              targetPointer,
              schema,
              ...(requested ? [kind, requestedInputs] : []),
            ]),
          )
          .digest('hex'),
        callId: input.callId,
        operation: structuredClone(input.operation.key),
        targetPointer,
        schema: structuredClone(schema),
        openapiVersion: input.operation.openapiVersion,
        ...(requested ? { requestedInputs } : {}),
        ...(typeof input.operation.operation.summary === 'string'
          ? { operationSummary: input.operation.operation.summary }
          : {}),
        ...(typeof parameter?.description === 'string'
          ? { parameterDescription: parameter.description }
          : {}),
        message: `Provide ${kind === 'missing-input' ? 'required request' : 'scenario-requested'} value ${targetPointer} for ${input.operation.method} ${input.operation.path}.${requested ? ' Include requested paths: ' + requestedInputs.join(', ') + '.' : ''}`,
      };
    },
  );
  return {
    status: requirements.length ? 'needs-input' : 'ready',
    requirements,
  };
}

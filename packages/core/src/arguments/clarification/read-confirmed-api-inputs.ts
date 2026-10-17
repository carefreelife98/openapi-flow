import type {
  ApiArgumentGenerationInput,
  ConfirmedApiInput,
} from '../../types/api-clarification.js';
import { confirmedApiInputsSchema } from '../../schemas/confirmed-api-input-schema.js';
import { apiOperationKeyEquals } from '../../openapi/catalog/api-operation-key-equals.js';
import { requestBindingSchemas } from '../../bindings/request-binding-schema.js';
import { unionBindingSchemas } from '../../bindings/combine-binding-schemas.js';
import { checkOasValue } from '../../openapi/common/check-oas-value.js';
import { pointerTokens } from '../../bindings/json-pointer.js';

export function readConfirmedApiInputs(
  input: ApiArgumentGenerationInput,
): ConfirmedApiInput[] {
  if (input.confirmedInputs === undefined) return [];
  const confirmed = confirmedApiInputsSchema.parse(input.confirmedInputs);
  if (confirmed.length && (!input.callId || !input.callId.trim()))
    throw new Error('confirmedInputs require callId');
  const targets = input.bindings.map((binding) => binding.targetPointer);
  for (const item of confirmed) {
    if (
      item.callId !== input.callId ||
      !apiOperationKeyEquals(item.operation, input.operation.key)
    )
      throw new Error(
        `confirmedInputs ${item.callId}${item.targetPointer} does not match callId and current OAS snapshot`,
      );
    const tokens = pointerTokens(item.targetPointer);
    if (
      tokens[0] === 'header' &&
      ['authorization', 'content-type', 'accept'].includes(
        tokens[1]?.toLowerCase(),
      )
    )
      throw new Error(
        `confirmedInputs ${item.targetPointer} is transport/security configuration, not a request value`,
      );
    if (
      targets.some(
        (target) =>
          target === item.targetPointer ||
          target.startsWith(item.targetPointer + '/') ||
          item.targetPointer.startsWith(target + '/'),
      )
    )
      throw new Error(`confirmedInputs overlap at ${item.targetPointer}`);
    const schemas = requestBindingSchemas(
      { ...input, callId: item.callId },
      item.targetPointer,
    );
    if (!schemas.length)
      throw new Error(
        `confirmedInputs ${item.targetPointer} is not allowed by the OAS`,
      );
    checkOasValue(
      item.value,
      unionBindingSchemas(schemas),
      input.operation.openapiVersion.startsWith('3.0.')
        ? 'openapi-3.0'
        : 'draft-2020-12',
      `confirmedInputs ${item.callId}${item.targetPointer}`,
    );
    targets.push(item.targetPointer);
  }
  return confirmed;
}

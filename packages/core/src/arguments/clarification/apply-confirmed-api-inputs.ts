import type { ApplyConfirmedApiInputsInput } from '../../types/api-clarification.js';
import type { ApiArgumentValues } from '../../types/api-arguments.js';
import { readConfirmedApiInputs } from './read-confirmed-api-inputs.js';
import { assignApiInputValue } from './assign-api-input-value.js';
import { validateApiArguments } from '../validate-api-arguments.js';

export function applyConfirmedApiInputs(
  input: ApplyConfirmedApiInputsInput,
): ApiArgumentValues {
  validateApiArguments(input);
  const confirmed = readConfirmedApiInputs(input);
  const values = structuredClone(input.values);
  for (const item of confirmed)
    assignApiInputValue(values, item.targetPointer, item.value, {
      operation: input.operation,
      callId: item.callId,
      requestMediaType: input.requestMediaType,
    });
  validateApiArguments({ ...input, values });
  return values;
}

import type { ApiCallArguments } from '../types/api-arguments.js';
import type { InspectDeferredApiInputsInput } from '../types/deferred-api-inputs.js';
import { inspectDeferredApiInputs } from './inspect-deferred-api-inputs.js';
import { DeferredApiInputError } from './deferred-api-input-error.js';

/** Execution boundary: no missing slot can become an outbound request value. */
export function materializeDeferredApiInputs(
  input: InspectDeferredApiInputsInput,
): ApiCallArguments[] {
  const checked = inspectDeferredApiInputs(input);
  if (checked.status !== 'ready')
    throw new DeferredApiInputError(checked.issues);
  return checked.arguments;
}

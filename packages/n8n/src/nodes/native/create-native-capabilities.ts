import { createIfCapability } from './if-capability.js';
import { createMergeAppendCapability } from './merge-append-capability.js';
import { createResponseAssertionCapability } from './response-assertion-capability.js';
import { createStopAndErrorCapability } from './stop-and-error-capability.js';
import type {
  N8nNativeCapability,
  NativeItemExecutionOptions,
} from '../../types/native-capability.js';

export function createN8nNativeCapabilities(
  input: NativeItemExecutionOptions = {},
): N8nNativeCapability[] {
  if (input.itemMode !== undefined && input.itemMode !== 'linked')
    throw new Error('native itemMode must be linked or omitted');
  return [
    createIfCapability(input),
    createMergeAppendCapability(),
    createResponseAssertionCapability(input),
    createStopAndErrorCapability(),
  ];
}

import { createIfCapability } from './if-capability.js';
import { createMergeAppendCapability } from './merge-append-capability.js';
import { createResponseAssertionCapability } from './response-assertion-capability.js';
import { createStopAndErrorCapability } from './stop-and-error-capability.js';
import type { N8nNativeCapability } from '../../types/native-capability.js';

export function createN8nNativeCapabilities(): N8nNativeCapability[] {
  return [
    createIfCapability(),
    createMergeAppendCapability(),
    createResponseAssertionCapability(),
    createStopAndErrorCapability(),
  ];
}

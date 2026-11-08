import type { WorkflowProgramControls } from '@openapi-flow/core';
import type { N8nNativeCapability } from './native-capability.js';

export interface N8nWorkflowProgramControls extends WorkflowProgramControls {
  capabilities: N8nNativeCapability[];
}

import { trigger } from '@n8n/workflow-sdk';
import type { WorkflowEntryPointContract } from '@openapi-flow/core';

const nodeType = 'n8n-nodes-base.manualTrigger';

/** The same compiler-owned start is described to planning and built by the SDK. */
export function describeN8nManualTrigger(): WorkflowEntryPointContract {
  return {
    kind: nodeType,
    description:
      'The n8n compiler supplies one Manual Trigger start. Users run the workflow manually; this entrypoint is not a selectable native capability and requires no extra planned trigger instance.',
  };
}

export function createN8nManualTrigger() {
  return trigger({
    type: nodeType,
    version: 1,
    config: { id: 'openapi-flow-start', name: 'Start', position: [0, 0] },
  });
}

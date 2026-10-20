import type { PendingNativeMaterialNode } from '../types/native-material-snapshot.js';

export class NativeMaterialResolutionError extends Error {
  readonly pending: PendingNativeMaterialNode[];
  constructor(pending: PendingNativeMaterialNode[]) {
    super(
      `Native material contracts are not resolved: ${pending.map((node) => `${node.nodeId} [${node.capability}] (${node.kind}: ${node.sourceNodeIds.join(', ')})`).join('; ')}`,
    );
    this.name = 'NativeMaterialResolutionError';
    this.pending = structuredClone(pending);
  }
}

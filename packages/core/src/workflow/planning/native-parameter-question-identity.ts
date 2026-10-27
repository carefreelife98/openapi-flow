import { createHash } from 'node:crypto';
import type { NativeNodeParameterProposal } from '../../types/native-node-planning.js';

export function nativeParameterQuestionIdentity(
  fingerprint: string,
  nodeId: string,
  proposal: NativeNodeParameterProposal,
): string {
  return (
    'native-question:' +
    createHash('sha256')
      .update(JSON.stringify({ fingerprint, nodeId, proposal }))
      .digest('hex')
  );
}

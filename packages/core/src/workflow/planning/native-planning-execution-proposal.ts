import type {
  NativeInstanceSelectionProposal,
  NativeNodeParameterProposal,
} from '../../types/native-node-planning.js';
import type { NativeInstanceDependencyProposal } from '../../types/native-instance-dependencies.js';

/** Remove only declared display fields; ownership, references and all settings remain intact. */
export function nativeInstanceSelectionExecutionProposal(
  proposal: NativeInstanceSelectionProposal,
): NativeInstanceSelectionProposal {
  const execution = {
    ...proposal,
    instances: proposal.instances.map((choice) => {
      const instance = { ...choice };
      delete instance.reason;
      return instance;
    }),
  };
  delete execution.reason;
  return execution;
}

export function nativeNodeParameterExecutionProposal(
  proposal: NativeNodeParameterProposal,
): NativeNodeParameterProposal {
  const decision = { ...proposal.decision };
  delete decision.reason;
  return { decision };
}

export function nativeDependencyExecutionProposal(
  proposal: NativeInstanceDependencyProposal,
): NativeInstanceDependencyProposal {
  return {
    sourcesByNodeId: Object.fromEntries(
      Object.entries(proposal.sourcesByNodeId).map(([id, source]) => [
        id,
        { sourceNodeIds: source.sourceNodeIds },
      ]),
    ),
  };
}

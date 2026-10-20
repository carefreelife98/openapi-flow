import type {
  NativeNodePlanningOutput,
  ResolvedNativeNodePlanningOutput,
} from '../types/native-node-planning.js';
import { resolveNativeNodeParameterSource } from './resolve-native-node-parameter-source.js';

/** Structural projection only: no values, identities or unmet requirements are repaired. */
export function resolveNativeNodePlanningOutput(
  output: NativeNodePlanningOutput,
): ResolvedNativeNodePlanningOutput {
  if (!('decision' in output))
    return {
      proposal: {
        nativeNodes: output.nativeNodes.map(resolveNativeNodeParameterSource),
        gaps: output.gaps,
      },
    };
  const { decision } = output;
  if ('additions' in decision)
    return {
      proposal: {
        nativeNodes: decision.additions.map((item) =>
          resolveNativeNodeParameterSource(item.node),
        ),
        gaps: decision.gaps,
      },
      assessment: {
        kind: 'additions',
        nodes: decision.additions.map(({ node, reason }) => ({
          nodeId: node.id,
          reason,
        })),
      },
    };
  return {
    proposal: { nativeNodes: [], gaps: decision.gaps },
    assessment: {
      kind: 'no-additions',
      reason: decision.noAdditionalNodesReason,
    },
  };
}

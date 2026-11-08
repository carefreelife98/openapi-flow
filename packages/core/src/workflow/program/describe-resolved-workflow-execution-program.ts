import type {
  DescribeResolvedWorkflowExecutionProgramInput,
  WorkflowExecutionProgramProjection,
} from '../../types/workflow-execution-program.js';
import { describeWorkflowExecutionProgram } from './describe-workflow-execution-program.js';
import { validateWorkflowExecutionProgram } from './resolve-workflow-execution-program.js';
import { createPreparedNativeNodeMaterials } from '../planning/create-prepared-native-node-materials.js';
import { createWorkflowNodeContracts } from '../create-workflow-node-contracts.js';
import { listWorkflowRequiredPrecedence } from '../connections/list-workflow-required-precedence.js';

/** Derived ports, node identities and edges for a checked program; not another planning authority. */
export function describeResolvedWorkflowExecutionProgram(
  input: DescribeResolvedWorkflowExecutionProgramInput,
): WorkflowExecutionProgramProjection {
  const result = validateWorkflowExecutionProgram(input);
  const base = describeWorkflowExecutionProgram(input);
  const capabilities = [
    ...input.capabilities!,
    ...(input.controls?.capabilities ?? []),
  ];
  const generated = result.plan.nativeNodes.filter((node) =>
    result.generatedNodeIds.includes(node.id),
  );
  const nodes = [
    ...base.context.nodes,
    ...createWorkflowNodeContracts({
      materials: [],
      nativeNodes: generated,
      capabilities,
    }),
  ];

  return {
    ...base,
    context: {
      ...base.context,
      nodes,
      edges: result.plan.edges,
      nativeNodes: createPreparedNativeNodeMaterials(
        result.plan.nativeNodes,
        capabilities,
      ),
      requiredPrecedence: listWorkflowRequiredPrecedence(nodes),
    },
    sources: base.sources,
    result,
  };
}

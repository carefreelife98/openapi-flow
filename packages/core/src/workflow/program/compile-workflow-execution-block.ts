import type {
  WorkflowProgramCompilerInput,
  WorkflowProgramCompilerState,
  WorkflowProgramFlow,
  WorkflowProgramEndpoint,
} from '../../types/internal/workflow-execution-program.js';
import { createWorkflowNodeContracts } from '../create-workflow-node-contracts.js';
import { connectionValueFingerprint } from '../connections/incremental/connection-graph-identity.js';
import type {
  WorkflowExecutionBlock,
  WorkflowProgramControlRequest,
} from '../../types/workflow-execution-program.js';
import type { WorkflowPlanNodeContract } from '../../types/workflow-plan.js';

/** Structured control determines wiring. Models select business operations, not edge deltas. */
export function compileWorkflowExecutionBlock(
  input: WorkflowProgramCompilerInput,
): WorkflowProgramCompilerState {
  const state: WorkflowProgramCompilerState = {
    contracts: new Map(input.description.context.nodes.map((n) => [n.id, n])),
    visited: new Set(),
    roots: [],
    edges: [],
    generated: [],
  };
  let count = 0;
  function fail(path: string, message: string): never {
    throw new Error(`Execution program ${path}: ${message}`);
  }
  function contract(id: string, path: string): WorkflowPlanNodeContract {
    const value = state.contracts.get(id);
    if (!value) fail(path, `unknown node ${id}`);
    return value;
  }
  function adopt(id: string, path: string): WorkflowPlanNodeContract {
    const value = contract(id, path);
    if (state.visited.has(id))
      fail(
        path,
        `node ${id} is executed more than once; refer to its output in the consuming material`,
      );
    state.visited.add(id);
    return value;
  }
  function connect(
    from: WorkflowProgramEndpoint,
    to: string,
    port: string,
  ): void {
    state.edges.push({
      from: from.nodeId,
      output: from.output,
      to,
      input: port,
    });
  }
  function generated(
    kind: WorkflowProgramControlRequest['kind'],
    size: number,
    path: string,
  ): WorkflowPlanNodeContract {
    if (!input.source.controls)
      fail(path, `controls.create is required for ${kind}`);
    const id = `execution-control:${connectionValueFingerprint({ source: input.description.sourceFingerprint, path, kind })}`;
    const node = input.source.controls.create({ id, kind, inputCount: size });
    if (node.id !== id || state.contracts.has(node.id))
      fail(
        path,
        'control factory changed or duplicated its code-owned identity',
      );
    const [value] = createWorkflowNodeContracts({
      materials: [],
      nativeNodes: [node],
      capabilities: input.source.controls.capabilities,
    });
    if (
      value.inputs.length !== size ||
      value.outputs.length !== 1 ||
      value.exclusiveOutputPorts ||
      value.waitsForAllInputs !== (kind === 'parallel-barrier') ||
      value.references.length ||
      value.dependencyNodeIds.length
    )
      fail(path, `invalid declared ${kind} implementation`);
    state.generated.push(node);
    state.contracts.set(id, value);
    state.visited.add(id);
    return value;
  }
  function singleExit(
    flow: WorkflowProgramFlow,
    path: string,
  ): WorkflowProgramEndpoint {
    if (!flow.reachable || !flow.exits.length)
      fail(path, 'a parallel branch terminates without a completion route');
    if (flow.exits.length === 1) return flow.exits[0];
    const join = generated('alternative-rejoin', 1, path);
    for (const endpoint of flow.exits)
      connect(endpoint, join.id, join.inputs[0]);
    return { nodeId: join.id, output: join.outputs[0] };
  }
  function visit(
    block: WorkflowExecutionBlock,
    flow: WorkflowProgramFlow,
    depth: number,
    path: string,
  ): WorkflowProgramFlow {
    if (++count > input.description.limits.maxBlocks)
      fail(path, 'exceeds maxBlocks');
    if (depth > input.description.limits.maxDepth)
      fail(path, 'exceeds maxDepth');
    if (!flow.reachable)
      fail(path, 'unreachable work follows an unconditional terminal');
    if (block.kind === 'empty') return flow;
    if (block.kind === 'sequence') {
      let current = flow;
      for (const [index, step] of block.steps.entries())
        current = visit(step, current, depth + 1, `${path}.steps[${index}]`);
      return current;
    }
    if (block.kind === 'parallel') {
      const branches = block.branches.map((branch, index) =>
        visit(branch, { ...flow }, depth + 1, `${path}.branches[${index}]`),
      );
      if (block.join.kind === 'none') return { reachable: false, exits: [] };
      const exits = branches.map((branch, index) =>
        singleExit(branch, `${path}.branches[${index}].completion`),
      );
      const join =
        block.join.kind === 'barrier'
          ? generated('parallel-barrier', branches.length, `${path}.join`)
          : adopt(block.join.nodeId, `${path}.join`);
      if (
        !join.waitsForAllInputs ||
        join.exclusiveOutputPorts ||
        join.inputs.length !== exits.length ||
        join.outputs.length !== 1
      )
        fail(
          path,
          `parallel completion requires an all-input join with ${exits.length} inputs and one output; selected ${join.id} declares ${join.inputs.length} inputs and ${join.outputs.length} outputs`,
        );
      exits.forEach((endpoint, index) =>
        connect(endpoint, join.id, join.inputs[index]),
      );
      return {
        reachable: true,
        exits: [{ nodeId: join.id, output: join.outputs[0] }],
      };
    }
    const node = adopt(block.nodeId, path);
    if (
      node.waitsForAllInputs ||
      node.rejoinsExclusiveOutputs !== undefined ||
      node.inputs.length > 1
    )
      fail(
        path,
        `node ${node.id} requires an explicit parallel completion block`,
      );
    if (flow.exits.length) {
      if (node.inputs.length !== 1)
        fail(path, `node ${node.id} has no control input`);
      for (const endpoint of flow.exits)
        connect(endpoint, node.id, node.inputs[0]);
    } else state.roots.push(node.id);
    if (block.kind === 'node') {
      if (node.exclusiveOutputPorts || node.outputs.length > 1)
        fail(path, `node ${node.id} requires a branch block`);
      return {
        reachable: node.outputs.length > 0,
        exits: node.outputs.map((output) => ({ nodeId: node.id, output })),
      };
    }
    if (
      !node.exclusiveOutputPorts ||
      node.outputs.length < 2 ||
      block.paths.length !== node.outputs.length ||
      new Set(block.paths.map((p) => p.output)).size !== block.paths.length ||
      block.paths.some((p) => !node.outputs.includes(p.output))
    )
      fail(
        path,
        `branch ${node.id} must cover each declared exclusive output once`,
      );
    const paths = block.paths.map((branch, index) =>
      visit(
        branch.body,
        {
          reachable: true,
          exits: [{ nodeId: node.id, output: branch.output }],
        },
        depth + 1,
        `${path}.paths[${index}].body`,
      ),
    );
    const live = paths.filter((p) => p.reachable);
    return {
      reachable: live.length > 0,
      exits: live.flatMap((p) => p.exits),
    };
  }
  visit(input.body, { exits: [], reachable: true }, 1, 'body');
  const omitted = [...input.description.context.nodes].filter(
    (n) => !state.visited.has(n.id),
  );
  if (omitted.length)
    fail(
      'body',
      `program omitted prepared nodes: ${omitted.map((n) => n.id).join(', ')}`,
    );
  return state;
}

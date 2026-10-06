import type {
  ValidateWorkflowGraphPlanInput,
  WorkflowPlanNodeContract,
  WorkflowRouteState,
} from '../types/workflow-plan.js';
import { validateApiBindingPlan } from '../bindings/validate-api-binding-plan.js';

function combineRoutes(
  left: WorkflowRouteState,
  right: WorkflowRouteState,
): WorkflowRouteState | undefined {
  for (const [id, branch] of left.branches)
    if (right.branches.has(id) && right.branches.get(id) !== branch)
      return undefined;
  return {
    branches: new Map([...left.branches, ...right.branches]),
    completed: new Set([...left.completed, ...right.completed]),
  };
}

/** Reject invalid graph proposals; never repair or infer edges. */
export function validateWorkflowGraphPlan({
  plan,
  materials,
  capabilities,
}: ValidateWorkflowGraphPlanInput): void {
  validateApiBindingPlan({
    materials: materials.map((item) => ({
      callId: item.arguments.callId,
      operation: item.operation,
      requestMediaType: item.arguments.requestMediaType,
    })),
    plan: {
      calls: materials.map((item) => ({
        callId: item.arguments.callId,
        bindings: item.arguments.bindings,
      })),
      gaps: [],
    },
  });
  const registry = new Map(capabilities.map((item) => [item.name, item]));
  if (registry.size !== capabilities.length)
    throw new Error('capabilities contains duplicate names');
  const apiIds = new Set(materials.map((item) => item.arguments.callId));
  if (!materials.length || apiIds.size !== materials.length)
    throw new Error('materials requires unique API callIds');
  const contracts: WorkflowPlanNodeContract[] = materials.map((item) => ({
    id: item.arguments.callId,
    inputs: ['main'],
    outputs: ['main'],
    references: item.arguments.bindings.map((binding) => ({
      source: 'response',
      nodeId: binding.sourceNodeId,
      pointer: binding.sourcePointer,
    })),
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
  }));
  for (const native of plan.nativeNodes) {
    const capability = registry.get(native.capability);
    if (!capability)
      throw new Error(
        `node ${native.id}: unknown capability ${native.capability}`,
      );
    const parameters = capability.parametersSchema.parse(native.parameters);
    contracts.push({
      id: native.id,
      inputs: capability.inputPorts(parameters),
      outputs: capability.outputPorts(parameters),
      references: capability.responseReferences(parameters),
      waitsForAllInputs: capability.waitsForAllInputs,
      exclusiveOutputPorts: capability.exclusiveOutputPorts,
    });
  }
  const nodes = new Map(contracts.map((item) => [item.id, item]));
  if (
    nodes.size !== contracts.length ||
    contracts.some((item) => !item.id.trim())
  )
    throw new Error('plan node IDs must be unique and non-empty');
  const edgeKeys = new Set<string>();
  for (const edge of plan.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new Error('plan edge references a missing node');
    if (!from.outputs.includes(edge.output) || !to.inputs.includes(edge.input))
      throw new Error(
        `plan edge ${edge.from} -> ${edge.to} has an unknown port`,
      );
    const key = JSON.stringify([edge.from, edge.output, edge.to, edge.input]);
    if (edgeKeys.has(key)) throw new Error('plan has duplicate edges');
    edgeKeys.add(key);
  }
  const incoming = new Map(
    contracts.map((item) => [
      item.id,
      plan.edges.filter((edge) => edge.to === item.id),
    ]),
  );
  const roots = contracts
    .filter((item) => !incoming.get(item.id)!.length)
    .map((item) => item.id);
  if (!roots.length) throw new Error('plan DAG has no root: contains a cycle');
  if (
    new Set(plan.starts).size !== plan.starts.length ||
    roots.some((id) => !plan.starts.includes(id)) ||
    plan.starts.some((id) => !roots.includes(id))
  )
    throw new Error(
      `plan.starts must name every root exactly once: expected ${JSON.stringify(roots)}, received ${JSON.stringify(plan.starts)}`,
    );
  const routes = new Map<string, WorkflowRouteState[]>();
  const pending = [...contracts];
  while (pending.length) {
    const index = pending.findIndex((item) =>
      incoming.get(item.id)!.every((edge) => routes.has(edge.from)),
    );
    if (index === -1) throw new Error('plan DAG has a cycle');
    const current = pending.splice(index, 1)[0];
    const edges = incoming.get(current.id)!;
    const inputs = edges.map((edge) =>
      routes.get(edge.from)!.map((route) => {
        const source = nodes.get(edge.from)!;
        return {
          branches: new Map([
            ...route.branches,
            ...(source.exclusiveOutputPorts
              ? [[source.id, edge.output] as const]
              : []),
          ]),
          completed: new Set(route.completed),
        };
      }),
    );
    let states: WorkflowRouteState[];
    if (current.waitsForAllInputs) {
      if (
        current.inputs.some(
          (port) => edges.filter((edge) => edge.input === port).length !== 1,
        )
      )
        throw new Error(
          `node ${current.id}: each join input requires exactly one source`,
        );
      states = [{ branches: new Map(), completed: new Set() }];
      for (const alternatives of inputs)
        states = states.flatMap((left) =>
          alternatives.flatMap((right) => {
            const combined = combineRoutes(left, right);
            return combined ? [combined] : [];
          }),
        );
      if (
        !states.length ||
        inputs.some((alternatives) =>
          alternatives.some(
            (route) => !states.some((state) => combineRoutes(route, state)),
          ),
        )
      )
        throw new Error(
          `node ${current.id}: join inputs include mutually exclusive or unmatched branches`,
        );
    } else {
      states = inputs.length
        ? inputs.flat()
        : [{ branches: new Map(), completed: new Set() }];
    }
    for (const ref of current.references) {
      if (!apiIds.has(ref.nodeId))
        throw new Error(
          `node ${current.id}: response reference requires an API node ${ref.nodeId}`,
        );
      if (
        ref.pointer !== '' &&
        (!ref.pointer.startsWith('/') || /~(?:[^01]|$)/.test(ref.pointer))
      )
        throw new Error(
          `node ${current.id}: invalid response JSON pointer ${ref.pointer}`,
        );
      if (states.some((state) => !state.completed.has(ref.nodeId)))
        throw new Error(
          `node ${current.id}: response ${ref.nodeId} is not available on every incoming route`,
        );
    }
    routes.set(
      current.id,
      states.map((state) => ({
        ...state,
        completed: new Set([...state.completed, current.id]),
      })),
    );
  }
}

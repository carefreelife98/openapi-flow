import type {
  ValidateWorkflowTopologyInput,
  WorkflowRouteState,
} from '../types/workflow-plan.js';
import { validateWorkflowEdges } from './validate-workflow-edges.js';

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

export function validateWorkflowTopology({
  contracts,
  apiIds,
  edges,
  starts,
}: ValidateWorkflowTopologyInput): void {
  const nodes = new Map(contracts.map((item) => [item.id, item]));
  validateWorkflowEdges({ contracts, edges });
  const incoming = new Map(
    contracts.map((item) => [
      item.id,
      edges.filter((edge) => edge.to === item.id),
    ]),
  );
  const roots = contracts
    .filter((item) => !incoming.get(item.id)!.length)
    .map((item) => item.id);
  if (!roots.length) throw new Error('plan DAG has no root: contains a cycle');
  if (
    new Set(starts).size !== starts.length ||
    roots.some((id) => !starts.includes(id)) ||
    starts.some((id) => !roots.includes(id))
  )
    throw new Error(
      `starts must name every root exactly once: expected ${JSON.stringify(roots)}, received ${JSON.stringify(starts)}`,
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
    for (const dependency of current.dependencyNodeIds)
      if (
        !nodes.has(dependency) ||
        states.some((state) => !state.completed.has(dependency))
      )
        throw new Error(
          `node ${current.id}: planned dependency ${dependency} is not available on every incoming route`,
        );
    const referenceGroups = [
      { references: current.references, routeStates: states },
      ...Object.entries(current.inputReferences ?? {}).map(
        ([port, references]) => {
          if (!current.inputs.includes(port))
            throw new Error(
              `node ${current.id}: input references name unknown port ${port}`,
            );
          const routeStates = edges.flatMap((edge, index) =>
            edge.input === port ? inputs[index] : [],
          );
          if (!routeStates.length)
            throw new Error(
              `node ${current.id}: input ${port} has no dependency route`,
            );
          return { references, routeStates };
        },
      ),
    ];
    for (const group of referenceGroups)
      for (const ref of group.references) {
        if (
          ref.source === 'response'
            ? !apiIds.has(ref.nodeId)
            : !nodes.has(ref.nodeId) || apiIds.has(ref.nodeId)
        )
          throw new Error(
            `node ${current.id}: ${ref.source} reference requires ${ref.source === 'response' ? 'an API' : 'a declared native'} node ${ref.nodeId}`,
          );
        if (
          ref.pointer !== '' &&
          (!ref.pointer.startsWith('/') || /~(?:[^01]|$)/.test(ref.pointer))
        )
          throw new Error(
            `node ${current.id}: invalid response JSON pointer ${ref.pointer}`,
          );
        if (group.routeStates.some((state) => !state.completed.has(ref.nodeId)))
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

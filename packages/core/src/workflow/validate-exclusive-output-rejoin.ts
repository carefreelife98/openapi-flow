import type {
  WorkflowPlanNodeContract,
  WorkflowRouteState,
} from '../types/workflow-plan.js';

/** Each input represents a distinct alternative, with the same enclosing route set. */
export function validateExclusiveOutputRejoin(
  current: WorkflowPlanNodeContract,
  source: WorkflowPlanNodeContract | undefined,
  inputs: WorkflowRouteState[][],
): void {
  if (
    !source?.exclusiveOutputPorts ||
    current.waitsForAllInputs ||
    inputs.length !== source.outputs.length
  )
    throw new Error(
      `node ${current.id}: rejoin requires a declared exclusive producer and every output alternative`,
    );
  const ports = new Set<string>();
  let enclosing: string[] | undefined;
  for (const routes of inputs) {
    const alternatives = new Set(
      routes.map((route) => route.branches.get(source.id)),
    );
    const port = alternatives.values().next().value;
    if (
      alternatives.size !== 1 ||
      port === undefined ||
      !source.outputs.includes(port) ||
      ports.has(port)
    )
      throw new Error(
        `node ${current.id}: rejoin inputs must cover distinct outputs of ${source.id}`,
      );
    ports.add(port);
    const contexts = routes
      .map((route) =>
        JSON.stringify(
          [...route.branches].filter(([id]) => id !== source.id).sort(),
        ),
      )
      .sort();
    if (
      enclosing !== undefined &&
      JSON.stringify(contexts) !== JSON.stringify(enclosing)
    )
      throw new Error(
        `node ${current.id}: rejoin alternatives have unmatched enclosing routes`,
      );
    enclosing = contexts;
  }
}

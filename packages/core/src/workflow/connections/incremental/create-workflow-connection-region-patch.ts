import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { workflowConnectionStepExpectationSchema } from '../../../schemas/workflow-connection-session-schema.js';
import { workflowConnectionRegionSchema } from '../../../schemas/workflow-connection-region-schema.js';
import { describeWorkflowConnectionStep } from './describe-workflow-connection-step.js';
import { workflowConnectionEdgeId } from './connection-graph-identity.js';
import type {
  CreateWorkflowConnectionRegionPatchInput,
  DeriveWorkflowConnectionRegionPatchInput,
} from '../../../types/workflow-connection-region.js';
import type { WorkflowConnectionPatch } from '../../../types/workflow-connection-session.js';

/** Derive a delta from explicit desired state. Omitted nodes remain outside this transaction. */
export function createWorkflowConnectionRegionPatch(
  input: CreateWorkflowConnectionRegionPatchInput,
): WorkflowConnectionPatch {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'createWorkflowConnectionRegionPatch',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const parsedExpected = workflowConnectionStepExpectationSchema.safeParse(
        input.expected,
      );
      if (!parsedExpected.success)
        throw new Error(
          'Connection region.expected requires current sessionId, sourceFingerprint and revision',
          { cause: parsedExpected.error },
        );
      const description = describeWorkflowConnectionStep(input);
      if (
        input.expected.sessionId !== description.expected.sessionId ||
        input.expected.sourceFingerprint !==
          description.expected.sourceFingerprint ||
        input.expected.revision !== description.expected.revision
      )
        throw new Error(
          'Connection region expected session/source/revision must match the current session',
        );
      return deriveWorkflowConnectionRegionPatch({
        description,
        region: input.region,
      });
    },
  );
}

/** Pure unadopted proposal construction; application/revision still validates the original source. */
export function deriveWorkflowConnectionRegionPatch(
  input: DeriveWorkflowConnectionRegionPatchInput,
): WorkflowConnectionPatch {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'deriveWorkflowConnectionRegionPatch',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => deriveRegion(input),
  );
}
function deriveRegion(
  input: DeriveWorkflowConnectionRegionPatchInput,
): WorkflowConnectionPatch {
  const { description } = input;
  if (
    !description ||
    !Array.isArray(description.context?.nodes) ||
    !Array.isArray(description.edgeCatalog) ||
    !Array.isArray(description.requirements) ||
    !Array.isArray(description.rootNodeIds) ||
    !Array.isArray(description.terminals)
  )
    throw new Error(
      'Connection region.description requires context.nodes, edgeCatalog, requirements, rootNodeIds and terminals',
    );
  const region = workflowConnectionRegionSchema.parse(input.region);
  const ids = region.nodes.map((node) => node.nodeId);
  if (new Set(ids).size !== ids.length)
    throw new Error('Connection region.nodes contains duplicate nodeId');
  const scope = new Set(ids);
  const known = new Map(
    description.context.nodes.map((node) => [node.id, node]),
  );
  const retired = new Set(description.retiredNodes?.map((node) => node.id));
  if (
    retired.size !== (description.retiredNodes?.length ?? 0) ||
    [...retired].some((id) => known.has(id))
  )
    throw new Error(
      'Connection region.description.retiredNodes must name distinct nodes absent from the current context',
    );
  const facts = new Set(description.requirements.map((fact) => fact.id));
  if (
    new Set(region.factIds).size !== region.factIds.length ||
    region.factIds.some((id) => !facts.has(id))
  )
    throw new Error(
      'Connection region.factIds must name distinct current requirement facts',
    );
  for (const node of region.nodes) {
    if (retired.has(node.nodeId)) {
      if (node.incoming.length || node.root || node.terminalOutputs.length)
        throw new Error(
          `Connection region retired node ${node.nodeId} requires empty incoming, root=false and empty terminalOutputs`,
        );
      continue;
    }
    const contract = known.get(node.nodeId);
    if (!contract)
      throw new Error(
        `Connection region.nodes names unknown nodeId ${node.nodeId}`,
      );
    if (
      new Set(node.terminalOutputs).size !== node.terminalOutputs.length ||
      node.terminalOutputs.some((port) => !contract.outputs.includes(port))
    )
      throw new Error(
        `Connection region.nodes[${node.nodeId}].terminalOutputs must name distinct declared outputs`,
      );
    for (const edge of node.incoming) {
      if (
        !known.get(edge.from)?.outputs.includes(edge.output) ||
        !contract.inputs.includes(edge.input)
      )
        throw new Error(
          `Connection region.nodes[${node.nodeId}].incoming names an unknown source or port`,
        );
    }
  }
  const desired = region.nodes.flatMap((node) =>
    node.incoming.map((edge) => ({ ...edge, to: node.nodeId })),
  );
  const desiredIds = desired.map(workflowConnectionEdgeId);
  if (new Set(desiredIds).size !== desiredIds.length)
    throw new Error(
      'Connection region.nodes.incoming contains duplicate connections',
    );
  const desiredSet = new Set(desiredIds);
  const current = new Set(description.edgeCatalog.map((edge) => edge.id));
  const removed = description.edgeCatalog.filter(
    (edge) => scope.has(edge.edge.to) && !desiredSet.has(edge.id),
  );
  if (removed.some((edge) => !edge.editable))
    throw new Error(
      'Connection region.nodes.incoming omits a protected original connection',
    );
  const terminals = region.nodes.flatMap((node) =>
    node.terminalOutputs.map((output) => ({ nodeId: node.nodeId, output })),
  );
  return {
    kind: 'patch',
    addEdges: desired.filter(
      (edge) => !current.has(workflowConnectionEdgeId(edge)),
    ),
    removeEdgeIds: removed.map((edge) => edge.id),
    addRootNodeIds: region.nodes
      .filter(
        (node) => node.root && !description.rootNodeIds.includes(node.nodeId),
      )
      .map((node) => node.nodeId),
    removeRootNodeIds: region.nodes
      .filter(
        (node) => !node.root && description.rootNodeIds.includes(node.nodeId),
      )
      .map((node) => node.nodeId),
    addTerminals: terminals.filter(
      (terminal) =>
        !description.terminals.some(
          (current) =>
            current.nodeId === terminal.nodeId &&
            current.output === terminal.output,
        ),
    ),
    removeTerminals: description.terminals.filter(
      (terminal) =>
        scope.has(terminal.nodeId) &&
        !terminals.some(
          (desired) =>
            desired.nodeId === terminal.nodeId &&
            desired.output === terminal.output,
        ),
    ),
    factIds: region.factIds,
    reason: region.reason,
  };
}

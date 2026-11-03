import { WorkflowConnectionRegionValidationError } from './workflow-connection-region-validation-error.js';
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
    throw new WorkflowConnectionRegionValidationError(region, {
      code: 'INVALID_PROPOSAL',
      message: 'Connection region.nodes contains duplicate nodeId',
      details: {
        kind: 'region-selection',
        rule: 'duplicate-node',
        nodeId: ids.find((id, index) => ids.indexOf(id) !== index)!,
      },
    });
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
    throw new WorkflowConnectionRegionValidationError(region, {
      code: 'INVALID_PROPOSAL',
      message:
        'Connection region.factIds must name distinct current requirement facts',
      details: { kind: 'region-selection', rule: 'invalid-facts' },
    });
  for (const node of region.nodes) {
    if (retired.has(node.nodeId)) {
      if (node.incoming.length || node.root || node.terminalOutputs.length)
        throw new WorkflowConnectionRegionValidationError(region, {
          code: 'INVALID_BOUNDARY',
          message: `Connection region retired node ${node.nodeId} requires empty incoming, root=false and empty terminalOutputs`,
          details: {
            kind: 'region-selection',
            rule: 'retired-boundary',
            nodeId: node.nodeId,
          },
        });
      continue;
    }
    const contract = known.get(node.nodeId);
    if (!contract)
      throw new WorkflowConnectionRegionValidationError(region, {
        code: 'INVALID_PROPOSAL',
        message: `Connection region.nodes names unknown nodeId ${node.nodeId}`,
        details: {
          kind: 'region-selection',
          rule: 'unknown-node',
          nodeId: node.nodeId,
        },
      });
    if (
      new Set(node.terminalOutputs).size !== node.terminalOutputs.length ||
      node.terminalOutputs.some((port) => !contract.outputs.includes(port))
    )
      throw new WorkflowConnectionRegionValidationError(region, {
        code: 'INVALID_BOUNDARY',
        message: `Connection region.nodes[${node.nodeId}].terminalOutputs must name distinct declared outputs`,
        details: {
          kind: 'region-selection',
          rule: 'invalid-terminal',
          nodeId: node.nodeId,
        },
      });
    for (const edge of node.incoming) {
      if (
        !known.get(edge.from)?.outputs.includes(edge.output) ||
        !contract.inputs.includes(edge.input)
      )
        throw new WorkflowConnectionRegionValidationError(region, {
          code: 'INVALID_EDGE',
          message: `Connection region.nodes[${node.nodeId}].incoming names an unknown source or port`,
          details: {
            kind: 'region-selection',
            rule: 'unknown-port',
            nodeId: node.nodeId,
            connection: { ...edge, to: node.nodeId },
          },
        });
    }
  }
  const desired = region.nodes.flatMap((node) =>
    node.incoming.map((edge) => ({ ...edge, to: node.nodeId })),
  );
  const desiredIds = desired.map(workflowConnectionEdgeId);
  if (new Set(desiredIds).size !== desiredIds.length) {
    const duplicate = desiredIds.find(
      (id, index) => desiredIds.indexOf(id) !== index,
    )!;
    const indexes = desiredIds.flatMap((id, index) =>
      id === duplicate ? [index] : [],
    );
    const connection = desired[indexes[0]!]!;
    throw new WorkflowConnectionRegionValidationError(region, {
      code: 'INVALID_EDGE',
      message:
        'Connection region.nodes.incoming contains duplicate connections',
      details: {
        kind: 'region-selection',
        rule: 'duplicate-connection',
        nodeId: connection.to,
        connection,
        indexes,
      },
    });
  }
  const desiredSet = new Set(desiredIds);
  const current = new Set(description.edgeCatalog.map((edge) => edge.id));
  const removed = description.edgeCatalog.filter(
    (edge) => scope.has(edge.edge.to) && !desiredSet.has(edge.id),
  );
  if (removed.some((edge) => !edge.editable))
    throw new WorkflowConnectionRegionValidationError(region, {
      code: 'PROTECTED_EDGE',
      message:
        'Connection region.nodes.incoming omits a protected original connection',
      details: {
        kind: 'region-selection',
        rule: 'protected-edge',
        connection: removed.find((edge) => !edge.editable)!.edge,
      },
    });
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

import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import { randomUUID } from 'node:crypto';
import type {
  CreateWorkflowConnectionSessionInput,
  WorkflowConnectionSession,
} from '../../../types/workflow-connection-session.js';
import { describeConnectionSessionSource } from './describe-connection-session-source.js';
import { resolveConnectionGoals } from './resolve-connection-goals.js';
import { inspectConnectionGraph } from './inspect-connection-graph.js';
import { connectionValueFingerprint } from './connection-graph-identity.js';

export function createWorkflowConnectionSession(
  input: CreateWorkflowConnectionSessionInput,
): WorkflowConnectionSession {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'createWorkflowConnectionSession',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const description = describeConnectionSessionSource(input);
      const goals = resolveConnectionGoals(
        input,
        description.source.context.nodes,
        input.goals,
      );
      const session: WorkflowConnectionSession = {
        id: randomUUID(),
        revision: 0,
        sourceFingerprint: description.fingerprint,
        goalFingerprint: connectionValueFingerprint(goals),
        goals,
        edges: structuredClone(description.source.input.edges),
        rootNodeIds: [],
        terminals: [],
        assessments: [],
        history: [],
      };
      const checked = inspectConnectionGraph({
        contracts: description.source.context.nodes,
        graph: session,
        apiIds: new Set(description.source.context.readyCallIds),
      });
      if (checked.violations.length)
        throw new Error('Original connection graph has invalid structure', {
          cause: checked.violations,
        });
      return session;
    },
  );
}

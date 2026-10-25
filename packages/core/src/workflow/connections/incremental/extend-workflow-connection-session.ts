import { runOpenApiFlowOperation } from '../../../errors/run-openapi-flow-operation.js';
import {
  workflowConnectionStepExpectationSchema,
  workflowConnectionNativeMaterialsSchema,
} from '../../../schemas/workflow-connection-session-schema.js';
import type {
  ExtendWorkflowConnectionSessionInput,
  WorkflowConnectionMaterialExtension,
} from '../../../types/workflow-connection-session.js';
import { validateWorkflowConnectionSession } from './validate-workflow-connection-session.js';
import { describeConnectionSessionSource } from './describe-connection-session-source.js';

/** Add validated native material, never replace API contracts, values, goals or prior receipts. */
export function extendWorkflowConnectionSession(
  input: ExtendWorkflowConnectionSessionInput,
): WorkflowConnectionMaterialExtension {
  return runOpenApiFlowOperation(
    {
      owner: 'core',
      operation: 'extendWorkflowConnectionSession',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      const current = validateWorkflowConnectionSession(input);
      const expected = workflowConnectionStepExpectationSchema.parse(
        input.expected,
      );
      if (
        expected.sessionId !== input.session.id ||
        expected.sourceFingerprint !== input.session.sourceFingerprint ||
        expected.revision !== input.session.revision
      )
        throw new Error(
          'Native material extension belongs to a stale connection session',
        );
      const { additionalNativeNodes } =
        workflowConnectionNativeMaterialsSchema.parse({
          additionalNativeNodes: input.additionalNativeNodes,
        });
      const ids = new Set(current.source.context.nodes.map((node) => node.id));
      for (const node of additionalNativeNodes) {
        if (ids.has(node.id))
          throw new Error(
            `Native material extension duplicates node ${node.id}`,
          );
        ids.add(node.id);
      }
      const source = {
        ...input,
        nativeNodes: [
          ...current.source.input.nativeNodes,
          ...additionalNativeNodes,
        ],
      };
      const description = describeConnectionSessionSource(source);
      const session = {
        ...structuredClone(input.session),
        sourceFingerprint: description.fingerprint,
      };
      // Replay every accepted step against the expanded contracts before committing the extension.
      validateWorkflowConnectionSession({ ...source, session });
      return {
        session,
        previous: expected,
        addedNativeNodeIds: additionalNativeNodes.map((node) => node.id),
      };
    },
  );
}

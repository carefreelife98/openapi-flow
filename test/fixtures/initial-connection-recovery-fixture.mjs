import { literalTargetPlan } from './literal-generation-fixture.mjs';
import assert from 'node:assert/strict';
import {
  describeWorkflowConnectionGoals,
  selectWorkflowConnectionArgumentValues,
} from '@openapi-flow/core';
import {
  planWorkflowConnectionGoals,
  createWorkflowConnectionGoalRejection,
} from '@openapi-flow/langchain';
import { incrementalConnectionFixture } from './incremental-connection-fixture.mjs';

export function initialConnectionRecoveryFixture() {
  const { source, goals, plan } = incrementalConnectionFixture();
  const materials = globalThis.structuredClone(source.materials);
  materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments.bindings[0].sourceNodeId = 'detail';
  const broken = { ...source, materials };
  const args = source.materials.find(
    (item) => item.arguments.callId === 'price',
  ).arguments;
  const request = {
    kind: 'replan-materials',
    targets: [{ stage: 'api-bindings', nodeId: 'price' }],
    factIds: ['intent'],
    reason:
      'The confirmed independent reads require the original source, not the detail response.',
  };
  const receipt = {
    kind: 'replan-materials',
    sourceFingerprint:
      describeWorkflowConnectionGoals(broken).sourceFingerprint,
    request,
  };
  const replacement = {
    apiArguments: [
      { callId: args.callId, ...selectWorkflowConnectionArgumentValues(args) },
    ],
    nativeNodes: [],
  };
  return { source, broken, goals, plan, request, receipt, replacement };
}

export function recoveryQueueModel(outputs, inspect = () => {}) {
  const requests = [];
  let outputIndex = 0;
  return {
    requests,
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages, config) {
          const index = requests.length;
          const request = {
            schema,
            options,
            config,
            payload: JSON.parse(messages[1].content),
          };
          requests.push(request);
          await inspect(request, index);
          if (outputIndex >= outputs.length)
            throw new Error('Unexpected additional recovery model invocation');
          const output =
            typeof outputs[outputIndex] === 'function'
              ? await outputs[outputIndex](request)
              : outputs[outputIndex];
          if (output instanceof Error) throw output;
          if (options?.name === 'select_api_literal_targets') {
            const plan = literalTargetPlan(output);
            if (plan === output) outputIndex++;
            return globalThis.structuredClone(plan);
          }
          outputIndex++;
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

export async function initialGoalRejection(source, goals) {
  let failure;
  try {
    await planWorkflowConnectionGoals({
      ...source,
      model: recoveryQueueModel([{ goals }]),
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(
    failure,
    'The original incompatible goal/material pair must be rejected',
  );
  const rejection = createWorkflowConnectionGoalRejection({
    ...source,
    error: failure,
  });
  assert.ok(rejection?.constraints?.conflicts.length);
  return rejection;
}

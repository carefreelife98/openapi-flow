import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrchestratedWorkflowGenerationGraph } from '@openapi-flow/example-langgraph-workflow';
import {
  contextCapability,
  spec,
} from './fixtures/native-output-binding-fixture.mjs';

test('official composition discovers native producer before binding and makes no literal call for fully bound inputs', async () => {
  const calls = [];
  const model = {
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls.push(options.name);
          const input = JSON.parse(messages[1].content);
          if (options.name === 'select_api_operations') {
            const candidate = input.candidates.find(
              (candidate) => candidate.path === '/detail/{id}',
            );
            assert.ok(candidate);
            return {
              operations: [
                {
                  candidateId: candidate.candidateId,
                  purpose: 'Read requested detail',
                },
              ],
              gaps: [],
            };
          }
          if (options.name === 'plan_native_nodes') {
            assert.equal(input.preparedNativeNodes.length, 0);
            assert.equal(input.apiMaterials.length, 1);
            assert.equal(
              input.apiMaterials[0].callId,
              'automatic-context-request-1',
            );
            return {
              nativeNodes: [
                {
                  id: 'context',
                  capability: contextCapability.name,
                  parameters: { id: 'native/42' },
                },
              ],
              gaps: [],
            };
          }
          if (options.name === 'plan_api_bindings') {
            assert.equal(input.nativeOutputs[0].nodeId, 'context');
            assert.equal(
              input.nativeOutputs[0].schema.properties.id.type,
              'string',
            );
            return {
              calls: [
                {
                  callId: input.materials[0].callId,
                  bindings: [
                    {
                      kind: 'node-output',
                      sourceNodeId: 'context',
                      sourcePointer: '/id',
                      targetPointer: '/path/id',
                    },
                  ],
                },
              ],
              gaps: [],
            };
          }
          if (options.name === 'plan_workflow_connections') {
            const consumer = input.nodes.find(
              (node) => node.id === 'automatic-context-request-1',
            );
            assert.deepEqual(consumer.references, [
              { source: 'node-output', nodeId: 'context', pointer: '/id' },
            ]);
            return {
              edges: [
                {
                  from: 'context',
                  output: 'main',
                  to: consumer.id,
                  input: 'main',
                },
              ],
              additionalGaps: [],
              blockedCalls: [],
            };
          }
          throw new Error(`Unexpected model call ${options.name}`);
        },
      };
    },
  };
  const result = await createOrchestratedWorkflowGenerationGraph({
    model,
    capabilities: [contextCapability],
  }).invoke({
    workflowId: 'automatic-context',
    workflowName: 'Automatic native producer',
    scenario:
      'Set id to native/42 in a native context node and use its actual output to read product detail.',
    sources: [{ id: 'products', spec }],
    trace: [],
  });
  assert.deepEqual(calls, [
    'select_api_operations',
    'plan_native_nodes',
    'plan_api_bindings',
    'plan_workflow_connections',
  ]);
  assert.equal(result.status, 'complete');
  assert.equal(
    result.reviewMaterials[0].arguments.bindings[0].sourceNodeId,
    'context',
  );
  assert.deepEqual(result.reviewMaterials[0].arguments.values, {});
  assert.deepEqual(result.reviewPlan.starts, ['context']);
  assert.ok(
    result.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.set'),
  );
  assert.ok(
    result.workflow.nodes.some(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    ),
  );
});

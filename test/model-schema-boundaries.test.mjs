import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { toJsonSchema } from '@langchain/core/utils/json_schema';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { createReviewableWorkflowGraphSchema } from '../packages/langchain/dist/schemas/reviewable-workflow-graph-schema.js';
import { completeReviewableWorkflowGraphProposal } from '../packages/langchain/dist/workflow/complete-reviewable-workflow-graph-proposal.js';
import { createApiSelectionSchema } from '../packages/langchain/dist/schemas/api-selection-schema.js';
import { createApiBindingPlanSchema } from '../packages/langchain/dist/schemas/api-binding-plan-schema.js';
import { createNativeNodePlanningContract } from '../packages/langchain/dist/schemas/native-node-planning-contract.js';
import { materials, bindingPlan } from './fixtures/request-binding-fixture.mjs';

const require = createRequire(
  new URL('../packages/n8n/package.json', import.meta.url),
);
const { Ajv2020 } = require('ajv/dist/2020.js');
const validator = new Ajv2020({ strict: false });

for (const nativeEnabled of [false, true])
  for (const readyEnabled of [false, true]) {
    test(`review schema is valid on the real wire: native=${nativeEnabled}, ready=${readyEnabled}`, () => {
      const schema = createReviewableWorkflowGraphSchema(
        nativeEnabled ? createN8nNativeCapabilities() : [],
        readyEnabled ? ['request-1'] : [],
      );
      const wire = toJsonSchema(schema);
      assert.equal(
        validator.validateSchema(wire),
        true,
        JSON.stringify(validator.errors),
      );
      assert.equal(
        Object.hasOwn(wire.properties, 'additionalNativeNodes'),
        nativeEnabled,
      );
      assert.equal(
        Object.hasOwn(wire.properties, 'blockedCalls'),
        readyEnabled,
      );
      const output = {
        edges: [],
        additionalGaps: [],
        ...(nativeEnabled ? { additionalNativeNodes: [] } : {}),
        ...(readyEnabled ? { blockedCalls: [] } : {}),
      };
      assert.ok(schema.safeParse(output).success);
      assert.deepEqual(
        completeReviewableWorkflowGraphProposal(
          output,
          Number(nativeEnabled),
          Number(readyEnabled),
        ),
        { edges: [], additionalGaps: [], nativeNodes: [], blockedCalls: [] },
      );
      if (!nativeEnabled)
        assert.equal(
          schema.safeParse({ ...output, additionalNativeNodes: [] }).success,
          false,
        );
      if (!readyEnabled)
        assert.equal(
          schema.safeParse({ ...output, blockedCalls: [] }).success,
          false,
        );
    });
  }

test('the compiler-owned fields never replace missing dynamic model fields', () => {
  assert.throws(
    () =>
      completeReviewableWorkflowGraphProposal(
        { edges: [], additionalGaps: [] },
        1,
        0,
      ),
    /additionalNativeNodes is required/,
  );
  assert.throws(
    () =>
      completeReviewableWorkflowGraphProposal(
        { edges: [], additionalGaps: [], additionalNativeNodes: [] },
        1,
        1,
      ),
    /blockedCalls is required/,
  );
});

test('discovery selection cannot decide detailed contract insufficiency', () => {
  const schema = createApiSelectionSchema(['candidate-1']);
  assert.ok(
    schema.safeParse({
      operations: [],
      gaps: [{ description: 'No refund capability supplied' }],
    }).success,
  );
  assert.equal(
    schema.safeParse({
      operations: [],
      gaps: [
        {
          kind: 'insufficient_contract',
          candidateId: 'candidate-1',
          description: 'Input omitted from metadata',
        },
      ],
    }).success,
    false,
  );
});

test('binding wire schema describes dependency failures separately from literal generation', () => {
  const schema = createApiBindingPlanSchema(materials);
  const wire = toJsonSchema(schema);
  assert.equal(validator.validateSchema(wire), true);
  assert.match(wire.properties.gaps.description, /Blocking failures/);
  assert.match(wire.properties.gaps.description, /Return \[\]/);
  assert.match(
    wire.properties.gaps.items.properties.description.description,
    /Never describe a successful no-binding decision/,
  );
  assert.match(
    wire.properties.calls.items.properties.bindings.description,
    /Independent literals, supplied or missing/,
  );
  assert.deepEqual(schema.parse(bindingPlan), bindingPlan);
  const noDependencies = {
    calls: materials.map((item) => ({ callId: item.callId, bindings: [] })),
    gaps: [],
  };
  assert.deepEqual(schema.parse(noDependencies), noDependencies);
  const unsupported = {
    ...noDependencies,
    gaps: [
      {
        callId: materials[1].callId,
        targetPointer: '/path/id',
        description: 'The requested producer does not declare the required ID.',
      },
    ],
  };
  assert.deepEqual(schema.parse(unsupported), unsupported);
});

test('native wire schema excludes later API implementation tasks from gap ownership', () => {
  const { schema } = createNativeNodePlanningContract(
    createN8nNativeCapabilities(),
  );
  const wire = toJsonSchema(schema);
  assert.equal(validator.validateSchema(wire), true);
  assert.match(
    wire.properties.gaps.description,
    /Blocking unmet native behavior/,
  );
  assert.match(
    wire.properties.gaps.description,
    /Selected OAS API calls are implemented separately/,
  );
  assert.match(
    wire.properties.gaps.items.properties.description.description,
    /Never a reminder/,
  );
  assert.deepEqual(schema.parse({ nativeNodes: [], gaps: [] }), {
    nativeNodes: [],
    gaps: [],
  });
  const unsupported = {
    nativeNodes: [],
    gaps: [
      {
        description:
          'The requested native behavior has no supplied implementation.',
      },
    ],
  };
  assert.deepEqual(schema.parse(unsupported), unsupported);
});

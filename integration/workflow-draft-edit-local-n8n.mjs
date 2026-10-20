import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL, URLSearchParams } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  assembleWorkflowDraftEdit,
  createWorkflowDraftEditPlan,
  createWorkflowDraftApiInputEditContract,
  resolveWorkflowDraftApiInputEdits,
  stageWorkflowDraftEdit,
  describeWorkflowDraftApiBindingEdit,
  resolveWorkflowDraftApiBindingEdit,
  describeWorkflowDraftConnectionEdit,
  resolveWorkflowDraftConnectionEdit,
  describeWorkflowDraftNativeParameterEdit,
  resolveWorkflowDraftNativeParameterEditTargets,
  resolveWorkflowDraftNativeParameterEdits,
  describeWorkflowDraftNativeReferenceRepair,
  resolveWorkflowDraftNativeReferenceRepair,
} from '@openapi-flow/core';
import {
  compileN8nWorkflowTemplate,
  resolveN8nNativeFeatures,
  N8nNativeFeature,
} from '@openapi-flow/n8n';
import {
  workflowDraftEditAssemblyFixture,
  assemblyBodyValue,
} from '../test/fixtures/workflow-draft-edit-assembly-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const runId = `${Date.now()}-${process.pid}`;
const directory = new URL(
  `../.local-artifacts/draft-edit/${runId}/`,
  import.meta.url,
);
const volume = `openapi-flow-draft-edit-${runId}`;
const image = 'n8nio/n8n:2.37.10';
const requests = [];
const serverErrors = [];
let expectedCount = 0;
let wrongResponse = false;
let expectedForm = false;
let branchMatches = true;
let replacementMatches = false;
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture.local');
    let raw = '';
    for await (const chunk of request) raw += chunk;
    let body;
    if (raw.length) {
      if (expectedForm) {
        assert.equal(
          request.headers['content-type']?.split(';')[0],
          'application/x-www-form-urlencoded',
        );
        const form = new URLSearchParams(raw);
        assert.deepEqual([...form.keys()], ['sku']);
        body = { sku: form.get('sku') };
      } else {
        assert.equal(
          request.headers['content-type']?.split(';')[0],
          'application/json',
        );
        body = JSON.parse(raw);
      }
    }
    requests.push({
      method: request.method,
      path: url.pathname,
      ...(body === undefined ? {} : { body }),
    });
    if (request.method === 'POST') {
      assert.equal(url.pathname, '/items/original-id');
      if (expectedForm) assert.deepEqual(body, { sku: 'actual/form-value' });
      else {
        const expected = globalThis.structuredClone(assemblyBodyValue);
        expected.config.count = expectedCount;
        assert.deepEqual(body, expected);
      }
    } else
      assert.ok(
        [
          '/lookup/from-source',
          '/lookup/independent-id',
          '/lookup/from-lookup',
          '/lookup/from-replacement',
          '/replacement/replacement-id',
        ].includes(url.pathname),
        url.pathname,
      );
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify(
        url.pathname === '/replacement/replacement-id'
          ? { renamed: replacementMatches ? 'from-source' : 'from-replacement' }
          : {
              value:
                request.method === 'POST'
                  ? wrongResponse
                    ? 7
                    : branchMatches
                      ? 'from-source'
                      : 'branch-blocked'
                  : 'from-lookup',
            },
      ),
    );
  } catch (error) {
    serverErrors.push(error.message);
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: error.message }));
  }
});
let created = false;
const results = [];
try {
  await mkdir(directory, { recursive: true });
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  const input = await workflowDraftEditAssemblyFixture(
    'Change count to 4. Add first extra lookup and second extra lookup from source. Join all dependent lookups and independent.',
  );
  input.context.capabilities.push(
    ...resolveN8nNativeFeatures({ features: [N8nNativeFeature.MergeAppend] })
      .capabilities,
  );
  const decision = (fields, instruction) => ({
    ...fields,
    instruction,
    sources: [{ kind: 'message', messageId: 'edit-1', quote: instruction }],
  });
  const plan = createWorkflowDraftEditPlan({
    ...input,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        decision(
          { kind: 'revise-api-inputs', nodeId: 'source' },
          'Change count to 4',
        ),
        decision(
          { kind: 'add-api-call', operation: input.lookup.key },
          'first extra lookup',
        ),
        decision(
          { kind: 'add-api-call', operation: input.lookup.key },
          'second extra lookup',
        ),
        decision(
          { kind: 'add-native-node', capability: N8nNativeFeature.MergeAppend },
          'Join all dependent lookups and independent',
        ),
      ],
    },
  });
  const [valueStep, first, second, join] = plan.steps;
  const valueEditInput = { ...input, plan, stepId: valueStep.id };
  const valueEditContract = createWorkflowDraftApiInputEditContract({
    ...valueEditInput,
    proposal: {
      targets: [
        {
          kind: 'set',
          pointer: '/body/config/count',
          sources: valueStep.decision.sources,
        },
      ],
    },
  });
  const valueEditResult = resolveWorkflowDraftApiInputEdits({
    ...valueEditInput,
    contract: valueEditContract,
    output: {
      values: {
        'value-1': {
          status: 'provided',
          value: 4,
          source: {
            messageId: 'edit-1',
            sourceFormat: 'json',
            sourceText: '4',
          },
        },
      },
    },
  });
  assert.equal(valueEditResult.status, 'ready');
  const apiResolution = (step) => ({
    stepId: step.id,
    kind: 'api-call',
    values: {},
    bindings: [
      {
        kind: 'node-output',
        sourceNodeId: 'source',
        sourcePointer: '/value',
        targetPointer: '/path/id',
      },
    ],
  });
  const resolutions = [
    valueEditResult.resolution,
    apiResolution(first),
    apiResolution(second),
    {
      stepId: join.id,
      kind: 'native-literal',
      parameters: { numberInputs: 4 },
    },
  ];
  const connections = [
    ...[first, second].map((step) => ({
      kind: 'add-edge',
      stepIds: [step.id],
      edge: {
        from: 'source',
        output: 'main',
        to: step.newNodeId,
        input: 'main',
      },
    })),
    ...['follow', first.newNodeId, second.newNodeId, 'independent'].map(
      (id, index) => ({
        kind: 'add-edge',
        stepIds: [join.id],
        edge: {
          from: id,
          output: 'main',
          to: join.newNodeId,
          input: `input${index + 1}`,
        },
      }),
    ),
  ];
  const edited = assembleWorkflowDraftEdit({
    ...input,
    plan,
    resolutions,
    connections,
  });
  assert.equal(edited.draft.apiCalls.length, 5);
  const deployments = [
    {
      documentId: 'edit-assembly-fixture',
      baseUrl: `http://host.docker.internal:${server.address().port}`,
    },
  ];
  const compile = (draft, suffix, context) => {
    const template = compileN8nWorkflowTemplate({
      draft,
      context,
      name: `Verified draft edit ${suffix}`,
      deployments,
    });
    // Isolated import cases need distinct n8n storage IDs, not changed domain draft identities.
    template.workflow.id = `draft-edit-${runId}-${suffix}`;
    return template;
  };
  const before = compile(input.draft, 'before', input.context);
  const after = compile(edited.draft, 'after', input.context);
  assert.equal(edited.draft.id, input.draft.id);
  const deferInput = {
    ...input,
    draft: edited.draft,
    context: {
      ...input.context,
      messages: [
        ...input.context.messages,
        { id: 'edit-2', text: 'Defer the required name until execution.' },
      ],
    },
    requestMessageIds: ['edit-2'],
  };
  const deferPlan = createWorkflowDraftEditPlan({
    ...deferInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'source',
          instruction: 'Defer the required name',
          sources: [
            {
              kind: 'message',
              messageId: 'edit-2',
              quote: 'Defer the required name',
            },
          ],
        },
      ],
    },
  });
  const deferred = assembleWorkflowDraftEdit({
    ...deferInput,
    plan: deferPlan,
    resolutions: [
      {
        stepId: deferPlan.steps[0].id,
        kind: 'api-inputs',
        edits: [{ kind: 'remove', pointer: '/body/name' }],
      },
    ],
  });
  const missing = compile(deferred.draft, 'missing', deferInput.context);
  assert.equal(missing.inputSlots.length, 1);
  const badResponse = compile(edited.draft, 'bad-response', input.context);
  const formContext = {
    ...input.context,
    messages: [
      ...input.context.messages,
      {
        id: 'edit-3',
        text: 'Use the declared form body with sku actual/form-value.',
      },
    ],
  };
  const formInput = {
    ...input,
    draft: edited.draft,
    context: formContext,
    requestMessageIds: ['edit-3'],
  };
  const formPlan = createWorkflowDraftEditPlan({
    ...formInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-inputs',
          nodeId: 'source',
          instruction: 'Use the declared form body',
          sources: [
            {
              kind: 'message',
              messageId: 'edit-3',
              quote: 'Use the declared form body',
            },
          ],
        },
      ],
    },
  });
  const formEdited = assembleWorkflowDraftEdit({
    ...formInput,
    plan: formPlan,
    resolutions: [
      {
        stepId: formPlan.steps[0].id,
        kind: 'api-inputs',
        requestMediaType: 'application/x-www-form-urlencoded',
        edits: [
          { kind: 'remove', pointer: '/body' },
          { kind: 'set', pointer: '/body/sku', value: 'actual/form-value' },
        ],
      },
    ],
  });
  const formTemplate = compile(formEdited.draft, 'media-switch', formContext);
  const bindingMessage = {
    id: 'edit-binding',
    text: 'Use independent lookup response value for follow id instead of source response.',
  };
  const bindingInput = {
    ...input,
    context: {
      ...input.context,
      messages: [...input.context.messages, bindingMessage],
    },
    requestMessageIds: [bindingMessage.id],
  };
  const bindingSources = [
    {
      kind: 'message',
      messageId: bindingMessage.id,
      quote: bindingMessage.text,
    },
  ];
  const bindingPlan = createWorkflowDraftEditPlan({
    ...bindingInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-api-bindings',
          nodeId: 'follow',
          instruction: bindingMessage.text,
          sources: bindingSources,
        },
      ],
    },
  });
  const bindingStage = {
    ...bindingInput,
    plan: bindingPlan,
    resolutions: [],
    scope: { kind: 'step', stepId: bindingPlan.steps[0].id },
  };
  const bindingResult = resolveWorkflowDraftApiBindingEdit({
    ...bindingStage,
    fingerprint: describeWorkflowDraftApiBindingEdit(bindingStage).fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'bind',
          targetPointer: '/path/id',
          sourceNodeId: 'independent',
          sourcePointer: '/value',
          sources: bindingSources,
        },
      ],
    },
  });
  assert.equal(bindingResult.status, 'ready');
  const bindingConnectionsInput = {
    ...bindingStage,
    resolutions: [bindingResult.resolution],
  };
  const bindingConnectionDescription = describeWorkflowDraftConnectionEdit(
    bindingConnectionsInput,
  );
  const bindingConnectionResult = resolveWorkflowDraftConnectionEdit({
    ...bindingConnectionsInput,
    fingerprint: bindingConnectionDescription.fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'remove',
          edgeId: bindingConnectionDescription.existingEdges[0].id,
          sources: bindingSources,
        },
        {
          kind: 'add',
          source: { nodeId: 'independent', port: 'main' },
          target: { nodeId: 'follow', port: 'main' },
          sources: bindingSources,
        },
      ],
    },
  });
  assert.equal(bindingConnectionResult.status, 'ready');
  const bindingEdited = bindingConnectionResult.candidate;
  assert.deepEqual(bindingEdited.draft.apiCalls[0], input.draft.apiCalls[0]);
  const bindingTemplate = compile(
    bindingEdited.draft,
    'binding-change',
    bindingInput.context,
  );
  const repairMessage = {
    id: 'edit-repair',
    text: 'Replace source with the replacement API and bind its renamed output to follow id.',
  };
  const repairInput = {
    ...input,
    context: {
      ...input.context,
      messages: [...input.context.messages, repairMessage],
    },
    requestMessageIds: [repairMessage.id],
  };
  const repairSources = [
    { kind: 'message', messageId: repairMessage.id, quote: repairMessage.text },
  ];
  const repairPlan = createWorkflowDraftEditPlan({
    ...repairInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'source',
          operation: input.replacement.key,
          instruction: repairMessage.text,
          sources: repairSources,
        },
      ],
    },
  });
  const repairResolutions = [
    {
      stepId: repairPlan.steps[0].id,
      kind: 'api-call',
      values: { path: { id: 'replacement-id' } },
      bindings: [],
    },
  ];
  const repairMaterials = {
    ...repairInput,
    plan: repairPlan,
    resolutions: repairResolutions,
  };
  const task = stageWorkflowDraftEdit(repairMaterials).pendingRepairs.find(
    (task) => task.nodeId === 'follow',
  );
  assert.ok(task);
  const repairStage = {
    ...repairMaterials,
    scope: { kind: 'repair', taskId: task.id },
  };
  const repairResult = resolveWorkflowDraftApiBindingEdit({
    ...repairStage,
    fingerprint: describeWorkflowDraftApiBindingEdit(repairStage).fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'bind',
          targetPointer: '/path/id',
          sourceNodeId: 'source',
          sourcePointer: '/renamed',
          sources: repairSources,
        },
      ],
    },
  });
  assert.equal(repairResult.status, 'ready');
  const repaired = assembleWorkflowDraftEdit({
    ...repairMaterials,
    repairs: [repairResult.repair],
  });
  const repairedTemplate = compile(
    repaired.draft,
    'producer-repair',
    repairInput.context,
  );
  const branchMessage = {
    id: 'edit-connections',
    text: 'After source, check that its value equals from-source. Only on true run follow and independent in parallel, then append both results with Merge. On false stop with an error.',
  };
  const branchContext = {
    ...input.context,
    capabilities: [
      ...input.context.capabilities,
      ...resolveN8nNativeFeatures({
        features: [N8nNativeFeature.If, N8nNativeFeature.StopAndError],
      }).capabilities,
    ],
    messages: [...input.context.messages, branchMessage],
  };
  const branchSources = [
    { kind: 'message', messageId: branchMessage.id, quote: branchMessage.text },
  ];
  const branchInput = {
    ...input,
    context: branchContext,
    requestMessageIds: [branchMessage.id],
  };
  const branchPlan = createWorkflowDraftEditPlan({
    ...branchInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        { kind: 'add-native-node', capability: N8nNativeFeature.If },
        { kind: 'add-native-node', capability: N8nNativeFeature.MergeAppend },
        { kind: 'add-native-node', capability: N8nNativeFeature.StopAndError },
        {
          kind: 'revise-connections',
          nodeIds: ['source', 'follow', 'independent'],
        },
      ].map((decision) => ({
        ...decision,
        instruction: branchMessage.text,
        sources: branchSources,
      })),
    },
  });
  const [branchStep, branchJoin, branchStop] = branchPlan.steps;
  const branchStage = {
    ...branchInput,
    plan: branchPlan,
    resolutions: [
      {
        stepId: branchStep.id,
        kind: 'native-literal',
        parameters: {
          combinator: 'and',
          conditions: [
            {
              left: { source: 'response', nodeId: 'source', pointer: '/value' },
              operator: 'equals',
              right: { source: 'literal', value: 'from-source' },
            },
          ],
        },
      },
      {
        stepId: branchJoin.id,
        kind: 'native-literal',
        parameters: { numberInputs: 2 },
      },
      {
        stepId: branchStop.id,
        kind: 'native-literal',
        parameters: {
          message: 'Source value did not match the explicitly required value.',
        },
      },
    ],
  };
  const branchDescription = describeWorkflowDraftConnectionEdit(branchStage);
  assert.equal(branchDescription.status, 'ready');
  const branchEdge = (from, output, to, input = 'main') => ({
    kind: 'add',
    source: { nodeId: from, port: output },
    target: { nodeId: to, port: input },
    sources: branchSources,
  });
  const branchResult = resolveWorkflowDraftConnectionEdit({
    ...branchStage,
    fingerprint: branchDescription.fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'remove',
          edgeId: branchDescription.existingEdges[0].id,
          sources: branchSources,
        },
        branchEdge('source', 'main', branchStep.newNodeId),
        branchEdge(branchStep.newNodeId, 'true', 'follow'),
        branchEdge(branchStep.newNodeId, 'true', 'independent'),
        branchEdge(branchStep.newNodeId, 'false', branchStop.newNodeId),
        branchEdge('follow', 'main', branchJoin.newNodeId, 'input1'),
        branchEdge('independent', 'main', branchJoin.newNodeId, 'input2'),
      ],
    },
  });
  assert.equal(branchResult.status, 'ready');
  const branchTrue = compile(
    branchResult.candidate.draft,
    'connection-branch-true',
    branchContext,
  );
  const branchFalse = compile(
    branchResult.candidate.draft,
    'connection-branch-false',
    branchContext,
  );
  const nativeMessage = {
    id: 'edit-native-condition',
    text: 'Change only the IF comparison operator so its true branch runs when the source value differs from the expected value. Keep every other setting and connection.',
  };
  const nativeContext = {
    ...branchContext,
    messages: [...branchContext.messages, nativeMessage],
  };
  const nativeInput = {
    draft: branchResult.candidate.draft,
    context: nativeContext,
    requestMessageIds: [nativeMessage.id],
  };
  const nativeSources = [
    { kind: 'message', messageId: nativeMessage.id, quote: nativeMessage.text },
  ];
  const nativePlan = createWorkflowDraftEditPlan({
    ...nativeInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'revise-native-node',
          nodeId: branchStep.newNodeId,
          instruction: nativeMessage.text,
          sources: nativeSources,
        },
      ],
    },
  });
  const nativeStage = {
    ...nativeInput,
    plan: nativePlan,
    resolutions: [],
    stepId: nativePlan.steps[0].id,
  };
  const nativeTargets = resolveWorkflowDraftNativeParameterEditTargets({
    ...nativeStage,
    fingerprint:
      describeWorkflowDraftNativeParameterEdit(nativeStage).fingerprint,
    proposal: {
      decision: {
        status: 'targets',
        targets: [
          {
            kind: 'set',
            pointer: '/conditions/0/operator',
            sources: nativeSources,
          },
        ],
      },
    },
  });
  assert.equal(nativeTargets.status, 'ready');
  const nativeEdit = resolveWorkflowDraftNativeParameterEdits({
    ...nativeStage,
    contract: nativeTargets.contract,
    output: {
      values: {
        'parameter-1': {
          status: 'provided',
          value: 'notEquals',
          sources: nativeSources,
        },
      },
    },
  });
  assert.equal(nativeEdit.status, 'ready');
  const nativeEdited = assembleWorkflowDraftEdit({
    ...nativeStage,
    resolutions: [nativeEdit.resolution],
  });
  assert.deepEqual(
    nativeEdited.draft.edges,
    branchResult.candidate.draft.edges,
  );
  assert.deepEqual(
    nativeEdited.draft.apiCalls,
    branchResult.candidate.draft.apiCalls,
  );
  const nativeTemplate = compile(
    nativeEdited.draft,
    'native-condition-edit',
    nativeContext,
  );
  const referenceMessage = {
    id: 'edit-native-reference',
    text: 'Replace source with the replacement API. Use its renamed response in the existing IF and follow request. Preserve the literal from-source, operator, other parameters and routes.',
  };
  const referenceInput = {
    draft: branchResult.candidate.draft,
    context: {
      ...branchContext,
      messages: [...branchContext.messages, referenceMessage],
    },
    requestMessageIds: [referenceMessage.id],
  };
  const referenceSources = [
    {
      kind: 'message',
      messageId: referenceMessage.id,
      quote: referenceMessage.text,
    },
  ];
  const referencePlan = createWorkflowDraftEditPlan({
    ...referenceInput,
    options: { includeExplanations: false },
    proposal: {
      decisions: [
        {
          kind: 'replace-api-operation',
          nodeId: 'source',
          operation: input.replacement.key,
          instruction: referenceMessage.text,
          sources: referenceSources,
        },
      ],
    },
  });
  const referenceStage = {
    ...referenceInput,
    plan: referencePlan,
    resolutions: [
      {
        stepId: referencePlan.steps[0].id,
        kind: 'api-call',
        values: { path: { id: 'replacement-id' } },
        bindings: [],
      },
    ],
  };
  const referenceTasks = stageWorkflowDraftEdit(referenceStage).pendingRepairs;
  const nativeReferenceInput = {
    ...referenceStage,
    taskId: referenceTasks.find((task) => task.nodeId === branchStep.newNodeId)
      .id,
  };
  const nativeReferenceDescription =
    describeWorkflowDraftNativeReferenceRepair(nativeReferenceInput);
  const nativeReferenceResult = resolveWorkflowDraftNativeReferenceRepair({
    ...nativeReferenceInput,
    fingerprint: nativeReferenceDescription.fingerprint,
    proposal: {
      decisions: Object.fromEntries(
        nativeReferenceDescription.bindings.map((binding) => [
          binding.id,
          {
            kind: 'bind',
            sourceNodeId: 'source',
            sourcePointer: '/renamed',
            sourceMessageIds: [referenceMessage.id],
          },
        ]),
      ),
    },
  });
  assert.equal(nativeReferenceResult.status, 'ready');
  const referenceBindingInput = {
    ...referenceStage,
    scope: {
      kind: 'repair',
      taskId: referenceTasks.find((task) => task.nodeId === 'follow').id,
    },
  };
  const referenceBindingResult = resolveWorkflowDraftApiBindingEdit({
    ...referenceBindingInput,
    fingerprint: describeWorkflowDraftApiBindingEdit(referenceBindingInput)
      .fingerprint,
    proposal: {
      decisions: [
        {
          kind: 'bind',
          targetPointer: '/path/id',
          sourceNodeId: 'source',
          sourcePointer: '/renamed',
          sources: referenceSources,
        },
      ],
    },
  });
  assert.equal(referenceBindingResult.status, 'ready');
  const referenceEdited = assembleWorkflowDraftEdit({
    ...referenceStage,
    repairs: [nativeReferenceResult.repair, referenceBindingResult.repair],
  });
  assert.deepEqual(referenceEdited.draft.edges, referenceInput.draft.edges);
  const expectedGate = globalThis.structuredClone(
    referenceInput.draft.nativeNodes.find(
      (node) => node.id === branchStep.newNodeId,
    ),
  );
  expectedGate.parameters.conditions[0].left.pointer = '/renamed';
  assert.deepEqual(
    referenceEdited.draft.nativeNodes.find(
      (node) => node.id === branchStep.newNodeId,
    ),
    expectedGate,
  );
  const nativeReferenceTrue = compile(
    referenceEdited.draft,
    'native-reference-repair-true',
    referenceInput.context,
  );
  const nativeReferenceFalse = compile(
    referenceEdited.draft,
    'native-reference-repair-false',
    referenceInput.context,
  );
  const cases = [
    {
      name: 'before',
      template: before,
      count: 0,
      status: 'success',
      requests: 3,
    },
    {
      name: 'after',
      template: after,
      count: 4,
      status: 'success',
      requests: 5,
    },
    {
      name: 'missing',
      template: missing,
      count: 4,
      status: 'error',
      requests: 0,
    },
    { name: 'bad-response', template: badResponse, count: 4, status: 'error' },
    {
      name: 'media-switch',
      template: formTemplate,
      count: 4,
      status: 'success',
      requests: 5,
    },
    {
      name: 'binding-change',
      template: bindingTemplate,
      count: 0,
      status: 'success',
      requests: 3,
    },
    {
      name: 'producer-repair',
      template: repairedTemplate,
      count: 0,
      status: 'success',
      requests: 3,
    },
    {
      name: 'connection-branch-true',
      template: branchTrue,
      count: 0,
      status: 'success',
      requests: 3,
    },
    {
      name: 'connection-branch-false',
      template: branchFalse,
      count: 0,
      status: 'error',
      requests: 1,
    },
    {
      name: 'native-condition-edit',
      template: nativeTemplate,
      count: 0,
      status: 'error',
      requests: 1,
    },
    {
      name: 'native-reference-repair-true',
      template: nativeReferenceTrue,
      count: 0,
      status: 'success',
      requests: 3,
    },
    {
      name: 'native-reference-repair-false',
      template: nativeReferenceFalse,
      count: 0,
      status: 'error',
      requests: 1,
    },
  ];
  await writeFile(
    new URL('workflows.json', directory),
    JSON.stringify(
      cases.map((entry) => entry.template.workflow),
      null,
      2,
    ),
  );
  await writeFile(
    new URL('plan-and-change-set.json', directory),
    JSON.stringify(
      {
        plan,
        changeSet: edited.changeSet,
        bindingEdit: {
          plan: bindingPlan,
          result: bindingResult,
          connectionResult: bindingConnectionResult,
          changeSet: bindingEdited.changeSet,
        },
        producerRepair: {
          plan: repairPlan,
          result: repairResult,
          changeSet: repaired.changeSet,
        },
        connectionEdit: { plan: branchPlan, result: branchResult },
        nativeParameterEdit: {
          plan: nativePlan,
          contract: nativeTargets.contract,
          result: nativeEdit,
          changeSet: nativeEdited.changeSet,
        },
        nativeReferenceRepair: {
          plan: referencePlan,
          result: nativeReferenceResult,
          bindingResult: referenceBindingResult,
          changeSet: referenceEdited.changeSet,
        },
      },
      null,
      2,
    ),
  );
  const made = await runDocker(['volume', 'create', volume]);
  assert.equal(made.code, 0, made.stderr);
  created = true;
  const runtime = [
    'run',
    '--rm',
    '-i',
    '--mount',
    `source=${volume},target=/home/node/.n8n`,
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    image,
  ];
  const imported = await runDocker(
    [...runtime, 'import:workflow', '--input=/dev/stdin'],
    JSON.stringify(cases.map((entry) => entry.template.workflow)),
  );
  assert.equal(imported.code, 0, imported.stderr);
  for (const entry of cases) {
    expectedCount = entry.count;
    wrongResponse = entry.name === 'bad-response';
    expectedForm = entry.name === 'media-switch';
    branchMatches = entry.name !== 'connection-branch-false';
    replacementMatches = entry.name === 'native-reference-repair-true';
    const start = requests.length;
    const output = await runDocker([
      ...runtime,
      'execute',
      `--id=${entry.template.workflow.id}`,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(output.stdout);
    const observed = requests.slice(start);
    const data = execution.data.resultData;
    await writeFile(
      new URL(`execution-${entry.name}.json`, directory),
      JSON.stringify(execution, null, 2),
    );
    results.push({
      name: entry.name,
      status: execution.status,
      requestCount: observed.length,
      observedRequests: observed,
      lastNode: data.lastNodeExecuted,
      ...(data.error ? { error: data.error.message } : {}),
    });
    await writeFile(
      new URL('observed-results.json', directory),
      JSON.stringify(results, null, 2),
    );
    assert.equal(execution.status, entry.status, JSON.stringify(data.error));
    if (entry.requests !== undefined)
      assert.equal(observed.length, entry.requests, entry.name);
    if (entry.name === 'after' || entry.name === 'media-switch')
      assert.equal(data.runData[join.newNodeId][0].data.main[0].length, 4);
    if (entry.name === 'missing')
      assert.equal(data.lastNodeExecuted, '입력 사전 검사');
    if (entry.name === 'bad-response') {
      assert.ok(observed.length >= 1 && observed.length <= 2);
      assert.equal(
        observed.some((request) => request.path === '/lookup/from-source'),
        false,
      );
    }
    if (entry.name === 'binding-change') {
      assert.ok(
        observed.some((request) => request.path === '/lookup/from-lookup'),
      );
      assert.equal(
        observed.some((request) => request.path === '/lookup/from-source'),
        false,
      );
    }
    if (entry.name === 'producer-repair') {
      assert.ok(
        observed.some((request) => request.path === '/lookup/from-replacement'),
      );
      assert.equal(
        observed.some((request) => request.method === 'POST'),
        false,
      );
    }
    if (
      entry.name === 'connection-branch-true' ||
      entry.name === 'native-reference-repair-true'
    ) {
      assert.equal(
        data.runData[branchJoin.newNodeId][0].data.main[0].length,
        2,
      );
      assert.equal(data.runData[branchStop.newNodeId], undefined);
      assert.equal(
        observed[0].path,
        entry.name === 'native-reference-repair-true'
          ? '/replacement/replacement-id'
          : '/items/original-id',
      );
    }
    if (
      entry.name === 'connection-branch-false' ||
      entry.name === 'native-condition-edit' ||
      entry.name === 'native-reference-repair-false'
    ) {
      assert.equal(data.lastNodeExecuted, branchStop.newNodeId);
      assert.equal(data.runData.follow, undefined);
      assert.equal(data.runData.independent, undefined);
      assert.equal(data.runData[branchJoin.newNodeId], undefined);
    }
    assert.deepEqual(serverErrors, []);
    console.log(`${entry.name}: PASSED (${observed.length} requests)`);
  }
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(
      {
        image,
        results,
        logicalApiInstances: edited.draft.apiCalls.length,
        distinctApiOperations: 2,
        draftApiInputEditing: 'passed',
        draftApiBindingEditing: 'passed',
        draftConnectionEditing: 'passed',
        draftNativeParameterEditing: 'passed',
        draftNativeReferenceRepair: 'passed',
        distinctApiOperationsAcrossCases: 3,
        modelCalls: 0,
        businessApiCalls: 0,
        scope:
          'Synthetic contract-server regression of actual core edit assembly and SDK JSON, not live-model quality or five-distinct-operation coverage',
      },
      null,
      2,
    ),
  );
  console.log(`draft-edit: PASSED (${directory.pathname})`);
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (created) {
    const removed = await runDocker(['volume', 'rm', volume]);
    assert.equal(removed.code, 0, removed.stderr);
  }
}

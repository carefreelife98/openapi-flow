import assert from 'node:assert/strict';
import {
  compileWorkflowApiValues,
  fingerprintWorkflowApiValueContext,
  validateCompiledWorkflowApiValues,
  describeApiBindingCalls,
  resolveWorkflowApiBindingSources,
  resolveApiValueAnswers,
} from '@openapi-flow/core';
import type {
  WorkflowApiValueContext,
  CompiledWorkflowApiValues,
  WorkflowApiBindingPlanningInput,
} from '@openapi-flow/core';
import {
  generateWorkflowApiValues,
  generateApiValues,
  analyzeApiValueAnswers,
  selectWorkflowApiBindingSources,
} from '@openapi-flow/langchain';
import type { GenerateWorkflowApiValuesInput } from '@openapi-flow/langchain';

const context: WorkflowApiValueContext = {
  scenario: 'Native-only workflow',
  messages: [{ id: 'request', text: 'Native-only workflow' }],
  calls: [],
  interpretSchemaChoices: true,
};
const input: GenerateWorkflowApiValuesInput = context;
const result: CompiledWorkflowApiValues =
  await generateWorkflowApiValues(input);
assert.deepEqual(
  result,
  compileWorkflowApiValues({
    ...context,
    plan: {
      sourceFingerprint: fingerprintWorkflowApiValueContext(context),
      calls: {},
    },
  }),
);
validateCompiledWorkflowApiValues({ ...context, result });
assert.equal(typeof generateApiValues, 'function');
assert.equal(typeof selectWorkflowApiBindingSources, 'function');
assert.equal(typeof describeApiBindingCalls, 'function');
assert.equal(typeof resolveWorkflowApiBindingSources, 'function');
assert.equal(typeof resolveApiValueAnswers, 'function');
assert.equal(
  (await analyzeApiValueAnswers({ reply: '', requirements: [] })).status,
  'no-pending-inputs',
);
const bindingInput: Pick<WorkflowApiBindingPlanningInput, 'callIds'> = {
  callIds: [],
};
assert.deepEqual(bindingInput.callIds, []);

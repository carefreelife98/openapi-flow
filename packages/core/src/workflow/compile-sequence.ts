import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import { operationFromDocument } from '../openapi/parse-spec.js';
import {
  responseFieldType,
  validateResponseField,
} from '../openapi/response-contract.js';
import { validatedDocument } from '../openapi/validate-spec.js';
import type {
  ExpectedBody,
  PreparedSequenceNode,
  PreviousOperations,
  RequiredFields,
  RequiredOutputs,
  SequenceRequest,
  SequenceResult,
} from '../types/workflow.js';
import {
  assertSerializablePlan,
  isObject,
  looksLikeCredential,
  originFrom,
} from '../utils/validation.js';
import { workflowId } from '../utils/workflow-id.js';
import { approvedEffect } from './effect-policy.js';
import { resolveCredentialBinding } from './credential-binding.js';
import {
  assertionCode,
  isSafeMethod,
  makeBody,
  makeHeaders,
} from './workflow-helpers.js';
import { operationNode } from './operation-node.js';
import { sequenceUrl } from './sequence-url.js';

export async function compileSequence({
  spec,
  baseUrl,
  profile,
  effectPolicy,
  credentialBindings,
  plan,
}: SequenceRequest): Promise<SequenceResult> {
  const origin = originFrom(baseUrl);
  if (profile !== 'read-only' && profile !== 'test')
    throw new Error('profile must be read-only or test');
  if (
    !isObject(plan) ||
    plan.version !== '1' ||
    typeof plan.goal !== 'string' ||
    !plan.goal.trim() ||
    !Array.isArray(plan.steps) ||
    plan.steps.length < 1
  ) {
    throw new Error('plan must contain version 1, goal, and non-empty steps');
  }
  assertSerializablePlan(plan);
  const document = await validatedDocument(spec);
  const previous: PreviousOperations = new Map();
  const requiredOutputs: RequiredOutputs = new Map();
  const evidence: SequenceResult['evidence'] = [];
  const missingInputs: string[] = [];
  const nodes: PreparedSequenceNode[] = [];
  let blocked = false;
  for (const step of plan.steps) {
    if (
      !isObject(step) ||
      typeof step.id !== 'string' ||
      !step.id.trim() ||
      previous.has(step.id) ||
      typeof step.operationRef !== 'string'
    ) {
      throw new Error('plan.steps must have unique id and operationRef values');
    }
    const operation = operationFromDocument(document, step.operationRef);
    const effect = approvedEffect(operation, effectPolicy);
    const authentication = resolveCredentialBinding(
      operation,
      credentialBindings,
    );
    const inputs = step.inputs === undefined ? {} : step.inputs;
    const expectedBody =
      step.expectedBody === undefined ? {} : step.expectedBody;
    if (!isObject(inputs) || !isObject(expectedBody)) {
      throw new Error(
        'plan.steps[' + step.id + '] inputs and expectedBody must be objects',
      );
    }
    for (const [key, value] of Object.entries(expectedBody)) {
      if (looksLikeCredential(key)) {
        throw new Error(
          'plan.steps[' +
            step.id +
            '].expectedBody.' +
            key +
            ' looks like a credential',
        );
      }
      validateResponseField(
        operation,
        key,
        value,
        'plan.steps[' + step.id + '].expectedBody.' + key,
      );
    }
    const allowed = new Set(
      operation.parameters.map(
        (parameter) => parameter.in + '.' + parameter.name,
      ),
    );
    if (operation.body) allowed.add('body');
    for (const key of Object.keys(inputs)) {
      if (!allowed.has(key))
        throw new Error(
          'plan.steps[' +
            step.id +
            '].inputs.' +
            key +
            ' is not declared in OAS',
        );
      if (looksLikeCredential(key)) {
        throw new Error(
          'plan.steps[' +
            step.id +
            '].inputs.' +
            key +
            ' looks like a credential',
        );
      }
    }
    const stepMissing: string[] = [];
    const url = sequenceUrl(
      operation,
      origin,
      inputs,
      previous,
      requiredOutputs,
      stepMissing,
    );
    const body = makeBody(
      operation,
      inputs,
      stepMissing,
      step.requestMediaType,
    );
    const headers = makeHeaders(operation, inputs, stepMissing);
    missingInputs.push(...stepMissing.map((key) => step.id + '.' + key));
    if (
      effect === 'unknown' ||
      (!isSafeMethod(operation.method) && effect !== 'write') ||
      (profile === 'read-only' &&
        (!isSafeMethod(operation.method) || effect !== 'read'))
    )
      blocked = true;
    evidence.push({
      stepId: step.id,
      operationRef: operation.operationRef,
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      effect,
    });
    nodes.push({
      operation,
      id: step.id,
      url,
      body,
      headers,
      expectedBody: expectedBody as ExpectedBody,
      authentication,
    });
    previous.set(step.id, operation);
  }
  if (blocked) return { status: 'blocked', plan, evidence, missingInputs };
  if (missingInputs.length)
    return { status: 'needs_input', plan, evidence, missingInputs };
  let built = workflow(workflowId(baseUrl, plan), 'OpenAPI sequence').add(
    trigger({
      type: 'n8n-nodes-base.manualTrigger',
      version: 1,
      config: { id: 'start', name: 'Start', position: [240, 300] },
    }),
  );
  nodes.forEach(
    (
      { operation, id, url, body, headers, expectedBody, authentication },
      index,
    ) => {
      const requiredFields: RequiredFields = {};
      for (const field of requiredOutputs.get(id) ?? []) {
        requiredFields[field] = responseFieldType(operation, field);
      }
      const shouldAssert =
        Object.keys(expectedBody).length > 0 ||
        Object.keys(requiredFields).length > 0;
      const request = operationNode({
        operation,
        id: 'request-' + id,
        name: 'Request ' + id,
        position: [480 + index * 480, 300],
        url,
        body,
        headers,
        authentication,
        shouldAssert,
      });
      built = built.to(request);
      if (!shouldAssert) return;
      const assert = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: 'assert-' + id,
          name: 'Assert ' + id,
          position: [720 + index * 480, 300],
          parameters: {
            mode: 'runOnceForAllItems',
            jsCode: assertionCode(expectedBody, requiredFields),
          },
        },
      });
      built = built.to(assert);
    },
  );
  const validation = validateWorkflow(built);
  if (!validation.valid)
    throw new Error(
      'n8n SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  return {
    status: 'complete',
    plan,
    evidence,
    missingInputs,
    workflow: built.toJSON(),
  };
}

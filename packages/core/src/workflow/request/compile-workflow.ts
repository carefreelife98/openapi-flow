import { operationFromSpec } from '../../openapi/request/parse-request-operations.js';
import { validateResponseField } from '../../openapi/request/response-contract.js';
import type { Operation } from '../../types/request.js';
import type {
  CompileOperationRequest,
  CompileRequest,
  CompileResult,
} from '../../types/request-workflow.js';
import { isObject } from '../../utils/is-object.js';
import { assertSerializablePlan } from '../common/plan-validation.js';
import { originFrom } from './base-url.js';
import { approvedEffect, isSafeMethod } from './effect-policy.js';
import {
  looksLikeCredential,
  resolveCredentialBinding,
} from './credential-binding.js';
import { makeBody } from './request-body.js';
import { makeHeaders } from './request-headers.js';
import { makeUrl } from './request-url.js';
import { buildRequestWorkflow } from './build-request-workflow.js';

export async function compileWorkflow(
  request: CompileRequest,
): Promise<CompileResult> {
  if (
    !isObject(request.plan) ||
    typeof request.plan.operationRef !== 'string'
  ) {
    throw new Error('plan must contain version 1, goal, and operationRef');
  }
  const operation = await operationFromSpec(
    request.spec,
    request.plan.operationRef,
  );
  return compileWorkflowFromOperation(request, operation);
}

export function compileWorkflowFromOperation(
  {
    baseUrl,
    profile,
    effectPolicy,
    credentialBindings,
    plan,
  }: CompileOperationRequest,
  operation: Operation,
): CompileResult {
  const origin = originFrom(baseUrl);
  if (profile !== 'read-only' && profile !== 'test')
    throw new Error('profile must be read-only or test');
  if (
    !isObject(plan) ||
    plan.version !== '1' ||
    typeof plan.goal !== 'string' ||
    !plan.goal.trim() ||
    typeof plan.operationRef !== 'string'
  ) {
    throw new Error('plan must contain version 1, goal, and operationRef');
  }
  assertSerializablePlan(plan);
  const effect = approvedEffect(operation, effectPolicy);
  const authentication = resolveCredentialBinding(
    operation,
    credentialBindings,
  );
  const evidence = {
    operationRef: operation.operationRef,
    operationId: operation.operationId,
    method: operation.method,
    path: operation.path,
    effect,
  };
  const inputs = plan.inputs === undefined ? {} : plan.inputs;
  if (!isObject(inputs)) throw new Error('plan.inputs must be an object');
  const expectedBody = plan.expectedBody === undefined ? {} : plan.expectedBody;
  if (!isObject(expectedBody))
    throw new Error('plan.expectedBody must be an object');
  for (const [key, value] of Object.entries(expectedBody)) {
    if (looksLikeCredential(key)) {
      throw new Error('plan.expectedBody.' + key + ' looks like a credential');
    }
    validateResponseField(operation, key, value, 'plan.expectedBody.' + key);
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
        'plan.inputs.' + key + ' is not declared in the OAS operation',
      );
    if (looksLikeCredential(key)) {
      throw new Error(
        'plan.inputs.' +
          key +
          ' looks like a credential; bind an existing n8n credential through credentialBindings instead',
      );
    }
  }
  const missingInputs: string[] = [];
  const url = makeUrl(operation, origin, inputs, missingInputs);
  const body = makeBody(
    operation,
    inputs,
    missingInputs,
    plan.requestMediaType,
  );
  const headers = makeHeaders(operation, inputs, missingInputs);
  if (
    effect === 'unknown' ||
    (!isSafeMethod(operation.method) && effect !== 'write') ||
    (profile === 'read-only' &&
      (!isSafeMethod(operation.method) || effect !== 'read'))
  ) {
    return { status: 'blocked', plan, evidence, missingInputs };
  }
  if (missingInputs.length)
    return { status: 'needs_input', plan, evidence, missingInputs };
  return {
    status: 'complete',
    plan,
    evidence,
    missingInputs,
    workflow: buildRequestWorkflow({
      baseUrl,
      plan,
      operation,
      url,
      body,
      headers,
      authentication,
      expectedBody,
    }),
  };
}

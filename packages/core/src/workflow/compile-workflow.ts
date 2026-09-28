import { node, trigger, validateWorkflow, workflow } from '@n8n/workflow-sdk';
import { operationFromSpec } from '../openapi/parse-spec.js';
import { checkSchemaValue } from '../openapi/check-schema-value.js';
import type { Operation } from '../types/openapi.js';
import type {
  CompileOperationRequest,
  CompileRequest,
  CompileResult,
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
  makeUrl,
} from './workflow-helpers.js';

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
    request.plan.expectedStatus,
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
    status: operation.status,
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
    if (!Object.hasOwn(operation.responseProperties, key)) {
      throw new Error(
        'plan.expectedBody.' + key + ' is not in the OAS response schema',
      );
    }
    checkSchemaValue(
      value,
      operation.responseProperties[key],
      'plan.expectedBody.' + key,
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
  const body = makeBody(operation, inputs, missingInputs);
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
  const start = trigger({
    type: 'n8n-nodes-base.manualTrigger',
    version: 1,
    config: { id: 'start', name: 'Start', position: [240, 300] },
  });
  const request = node({
    type: 'n8n-nodes-base.httpRequest',
    version: 4.3,
    config: {
      id: 'request',
      name: operation.method + ' ' + operation.path,
      position: [480, 300],
      parameters: {
        method: operation.method,
        url,
        ...authentication?.parameters,
        ...(body === undefined
          ? {}
          : { sendBody: true, specifyBody: 'json', jsonBody: body }),
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: 'autodetect',
            },
          },
        },
      },
      ...(authentication ? { credentials: authentication.credentials } : {}),
    },
  });
  const assert = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: 'assert',
      name: 'Assert response',
      position: [720, 300],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: assertionCode(operation.status, expectedBody),
      },
    },
  });
  const built = workflow(
    workflowId(baseUrl, plan),
    'OpenAPI ' + operation.method + ' ' + operation.path,
  )
    .add(start)
    .to(request)
    .to(assert);
  const validation = validateWorkflow(built);
  if (!validation.valid) {
    throw new Error(
      'n8n SDK validation failed: ' +
        validation.errors.map((error) => error.message).join('; '),
    );
  }
  return {
    status: 'complete',
    plan,
    evidence,
    missingInputs,
    workflow: built.toJSON(),
  };
}

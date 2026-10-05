import { operationFromDocument } from '@openapi-flow/core/internal';
import { validateResponseField } from '@openapi-flow/core/internal';
import type { PrepareStepsInput } from './../../../types/legacy/catalog-workflow.js';
import type { ExpectedBody } from '../../../types/legacy/request-workflow.js';
import type {
  PreparedSequenceNode,
  PreparedSequence,
  PrepareSequenceInput,
  PreviousOperations,
  RequiredOutputs,
  SequenceResult,
} from '../../../types/legacy/sequence-workflow.js';
import { isObject } from '@openapi-flow/core/internal';
import { approvedEffect, isSafeMethod } from './effect-policy.js';
import {
  looksLikeCredential,
  resolveCredentialBinding,
} from './credential-binding.js';
import { makeBody } from './request-body.js';
import { makeHeaders } from './request-headers.js';
import { sequenceUrl } from './sequence-url.js';

export function prepareSequence({
  document,
  origin,
  profile,
  effectPolicy,
  credentialBindings,
  plan,
}: PrepareSequenceInput): PreparedSequence {
  return prepareSteps({
    profile,
    plan,
    resolveStep: (step) => ({
      operation: operationFromDocument(document, step.operationRef),
      origin,
      effectPolicy,
      credentialBindings,
    }),
  });
}

export function prepareSteps({
  profile,
  plan,
  resolveStep,
}: PrepareStepsInput): PreparedSequence {
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
    const source = resolveStep(step);
    const { operation, origin, effectPolicy, credentialBindings } = source;
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
  return { evidence, missingInputs, nodes, requiredOutputs, blocked };
}

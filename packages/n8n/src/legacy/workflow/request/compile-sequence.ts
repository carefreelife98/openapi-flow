import { validateAndResolveOpenApiDocument } from '@openapi-flow/core/internal';
import type {
  SequenceRequest,
  SequenceResult,
} from '../../../types/legacy/sequence-workflow.js';
import { isObject } from '@openapi-flow/core/internal';
import { assertSerializablePlan } from '../common/plan-validation.js';
import { originFrom } from './base-url.js';
import { buildSequenceWorkflow } from './build-sequence-workflow.js';
import { prepareSequence } from './prepare-sequence.js';

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
  const document = await validateAndResolveOpenApiDocument(spec);
  const prepared = prepareSequence({
    document,
    origin,
    profile,
    effectPolicy,
    credentialBindings,
    plan,
  });
  const { evidence, missingInputs, nodes, requiredOutputs, blocked } = prepared;
  if (blocked) return { status: 'blocked', plan, evidence, missingInputs };
  if (missingInputs.length)
    return { status: 'needs_input', plan, evidence, missingInputs };
  return {
    status: 'complete',
    plan,
    evidence,
    missingInputs,
    workflow: buildSequenceWorkflow({ baseUrl, plan, nodes, requiredOutputs }),
  };
}

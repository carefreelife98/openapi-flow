import { createOperationCatalog } from '@openapi-flow/core/internal';
import { operationFromDocument } from '@openapi-flow/core/internal';
import type {
  CatalogSequenceRequest,
  CatalogSequenceResult,
} from './../../../types/legacy/catalog-workflow.js';
import type { SequenceStep } from '../../../types/legacy/sequence-workflow.js';
import { isObject } from '@openapi-flow/core/internal';
import { assertSerializablePlan } from '../common/plan-validation.js';
import { originFrom } from './base-url.js';
import { isSafeMethod } from './effect-policy.js';
import { buildSequenceWorkflow } from './build-sequence-workflow.js';
import { prepareSteps } from './prepare-sequence.js';

export async function compileCatalogSequence({
  sources,
  profile,
  plan,
}: CatalogSequenceRequest): Promise<CatalogSequenceResult> {
  if (profile !== 'read-only' && profile !== 'test')
    throw new Error('profile must be read-only or test');
  if (
    !isObject(plan) ||
    plan.version !== '1' ||
    typeof plan.goal !== 'string' ||
    !plan.goal.trim() ||
    !Array.isArray(plan.steps) ||
    (plan.gaps !== undefined && !Array.isArray(plan.gaps)) ||
    (plan.steps.length === 0 && (!plan.gaps || plan.gaps.length === 0))
  )
    throw new Error('plan must contain version 1, goal, steps or gaps');
  assertSerializablePlan(plan);
  const catalog = await createOperationCatalog(sources);
  const gaps = plan.gaps ?? [];
  for (const gap of gaps) {
    if (
      !isObject(gap) ||
      (gap.kind !== 'missing_operation' &&
        gap.kind !== 'insufficient_contract') ||
      typeof gap.description !== 'string' ||
      !gap.description.trim()
    )
      throw new Error(
        'plan.gaps[] must contain kind and non-empty description',
      );
    if (
      gap.kind === 'missing_operation' &&
      (gap.documentId !== undefined || gap.operationRef !== undefined)
    )
      throw new Error(
        'plan.gaps[] missing_operation must not identify an operation',
      );
    if (gap.kind === 'insufficient_contract') {
      if (
        typeof gap.documentId !== 'string' ||
        typeof gap.operationRef !== 'string'
      )
        throw new Error(
          'plan.gaps[] insufficient_contract needs documentId and operationRef',
        );
      const source = catalog.sources.get(gap.documentId);
      if (
        !source ||
        !source.operations.some(
          (operation) => operation.operationRef === gap.operationRef,
        )
      )
        throw new Error(
          'plan.gaps[] insufficient_contract operation is not in sources',
        );
    }
  }
  const stepById = new Map<string, string>();
  for (const step of plan.steps) {
    if (
      !isObject(step) ||
      typeof step.documentId !== 'string' ||
      !step.documentId.trim()
    )
      throw new Error('plan.steps[].documentId must be non-empty');
    if (typeof step.id !== 'string' || !step.id.trim() || stepById.has(step.id))
      throw new Error('plan.steps must have unique non-empty id values');
    stepById.set(step.id, step.documentId);
  }
  const prepared = prepareSteps({
    profile,
    plan,
    resolveStep: (step: SequenceStep) => {
      const documentId = stepById.get(step.id);
      const source =
        documentId === undefined ? undefined : catalog.sources.get(documentId);
      if (!source)
        throw new Error(
          `plan.steps[${step.id}].documentId is not in sources: ${documentId}`,
        );
      const target = sources.find((item) => item.id === source.id);
      if (!target)
        throw new Error(
          `sources[${source.id}] execution configuration is missing`,
        );
      return {
        operation: operationFromDocument(source.document, step.operationRef),
        origin: originFrom(target.baseUrl),
        effectPolicy: target.effectPolicy,
        credentialBindings: target.credentialBindings,
      };
    },
  });
  const evidence = prepared.evidence.map((entry) => ({
    ...entry,
    documentId: stepById.get(entry.stepId)!,
  }));
  const diagnostics: CatalogSequenceResult['diagnostics'] = [
    ...gaps.map((gap) => ({
      code: gap.kind,
      message: gap.description,
      ...(gap.documentId === undefined ? {} : { documentId: gap.documentId }),
      ...(gap.operationRef === undefined
        ? {}
        : { operationRef: gap.operationRef }),
    })),
    ...prepared.missingInputs.map((missing) => ({
      code: 'missing_input' as const,
      message: missing,
      stepId: missing.split('.')[0],
    })),
    ...evidence
      .filter(
        (entry) =>
          entry.effect === 'unknown' ||
          (!isSafeMethod(entry.method) && entry.effect !== 'write') ||
          (profile === 'read-only' &&
            (!isSafeMethod(entry.method) || entry.effect !== 'read')),
      )
      .map((entry) => ({
        code: 'effect_not_approved' as const,
        message: `step ${entry.stepId} requires an approved effect`,
        stepId: entry.stepId,
      })),
  ];
  const status = gaps.length
    ? 'needs_capability'
    : prepared.blocked
      ? 'blocked'
      : prepared.missingInputs.length
        ? 'needs_input'
        : 'complete';
  if (status !== 'complete') return { status, plan, evidence, diagnostics };
  return {
    status,
    plan,
    evidence,
    diagnostics,
    workflow: buildSequenceWorkflow({
      baseUrl: JSON.stringify(
        sources.map(({ id, baseUrl }) => ({ id, baseUrl })),
      ),
      plan,
      nodes: prepared.nodes,
      requiredOutputs: prepared.requiredOutputs,
    }),
  };
}

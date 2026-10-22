import assert from 'node:assert/strict';
import {
  createWorkflowDraftApiInputEditContract,
  createWorkflowDraftEditPlan,
  describeWorkflowDraftApiInputEditEnumChoices,
} from '@openapi-flow/core';
import { schemaDraftInputEditFixture } from './workflow-draft-api-input-edit-fixture.mjs';

export const enumEditIntent = '조회수 순으로 바꾸고 메모도 수정해줘.';

export async function createApiEnumEditFixture({
  schema = {
    type: 'string',
    enum: ['NEW', 'VIEWS', 'PURCHASES'],
    default: 'NEW',
  },
  oldValue = 'NEW',
  pointers = ['/body/sort'],
  includeExplanations = false,
  text = enumEditIntent,
} = {}) {
  const input = await schemaDraftInputEditFixture(
    {
      type: 'object',
      properties: {
        sort: schema,
        note: { type: 'string' },
        untouched: { type: 'string' },
      },
      required: ['sort', 'note', 'untouched'],
      additionalProperties: false,
    },
    { sort: oldValue, note: 'previous', untouched: 'kept' },
    text,
  );
  const explanation = {
    reason: 'The current request changes only selected input fields.',
    evidence: input.sources,
  };
  if (includeExplanations)
    input.plan = createWorkflowDraftEditPlan({
      ...input,
      options: { includeExplanations: true },
      proposal: {
        decisions: [
          {
            kind: 'revise-api-inputs',
            nodeId: 'source',
            instruction: text,
            sources: input.sources,
            explanation,
          },
        ],
      },
    });
  input.stepId = input.plan.steps[0].id;
  const contract = createWorkflowDraftApiInputEditContract({
    ...input,
    proposal: {
      targets: pointers.map((pointer) => ({
        kind: 'set',
        pointer,
        sources: input.sources,
        ...(includeExplanations ? { explanation } : {}),
      })),
    },
  });
  return { ...input, contract, selectOasEnums: true, explanation };
}

export function enumEditSelection(input, value) {
  const candidate = describeWorkflowDraftApiInputEditEnumChoices(
    input,
  ).candidates.find(
    (item) => JSON.stringify(item.value) === JSON.stringify(value),
  );
  assert(candidate, 'Original OAS candidate is required by the fixture');
  return {
    status: 'oas-enum',
    selection: {
      candidateId: candidate.id,
      messageId: 'edit-1',
      sourceText: input.context.messages[0].text,
      reason: '사용자가 요청한 의미에 맞는 원본 OAS 항목을 선택했습니다.',
    },
  };
}

export function pendingEnumEditValue(input) {
  return {
    status: 'needs-input',
    ...(input.plan.options.includeExplanations
      ? { explanation: input.explanation }
      : {}),
  };
}

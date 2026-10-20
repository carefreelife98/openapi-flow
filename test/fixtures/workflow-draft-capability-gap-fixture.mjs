import {
  createWorkflowDraft,
  createWorkflowDraftCapabilityGap,
  createWorkflowDraftEditPlan,
} from '@openapi-flow/core';
import { requestedApiInputFixture } from './requested-api-inputs-fixture.mjs';

export async function capabilityGapFixture() {
  const fixture = await requestedApiInputFixture();
  const context = {
    ...fixture.input.context,
    messages: [
      {
        id: 'gap-request',
        text: '기존 조회는 유지하고 변경 이력도 조회해줘. 이력 API가 없으면 다른 API로 대체하지 마.',
      },
    ],
  };
  const draft = createWorkflowDraft({
    context,
    content: {
      id: 'capability-gap-workflow',
      apiCalls: [],
      nativeNodes: [],
      requirements: [],
      edges: [],
    },
  });
  const finding = {
    kind: 'missing-api',
    reason: '제공된 OAS에는 조회와 검색만 있고 변경 이력 조회 계약은 없습니다.',
  };
  const gap = createWorkflowDraftCapabilityGap({
    id: 'history',
    requestedBehavior: '변경 이력 조회',
    finding,
    context,
    sourceMessageIds: ['gap-request'],
  });
  const editInput = (
    decisions,
    original = draft,
    suppliedContext = context,
  ) => {
    const message = suppliedContext.messages.at(-1);
    const requestMessageIds = [message.id];
    return {
      draft: original,
      context: suppliedContext,
      requestMessageIds,
      resolutions: [],
      plan: createWorkflowDraftEditPlan({
        draft: original,
        context: suppliedContext,
        requestMessageIds,
        options: { includeExplanations: false },
        proposal: {
          decisions: decisions.map((decision) => ({
            instruction: message.text,
            ...decision,
            sources: [
              { kind: 'message', messageId: message.id, quote: message.text },
            ],
          })),
        },
      }),
    };
  };
  return { ...fixture, context, draft, finding, gap, editInput };
}

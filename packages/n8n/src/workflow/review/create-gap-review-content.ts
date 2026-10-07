import type { WorkflowReviewGap } from '@openapi-flow/core';
import type { CreateGapNodeInput } from '../../types/reviewable-workflow.js';
import { escapeReviewMarkdown } from './escape-review-markdown.js';

const stageLabels: Record<WorkflowReviewGap['stage'], string> = {
  'api-selection': 'API 선택',
  'api-bindings': '요청값 연결',
  'workflow-graph': '워크플로 구성',
};

export function createGapReviewContent(input: CreateGapNodeInput): string[] {
  const content = [
    '# 확인 필요',
    '미해결 단계: ' + escapeReviewMarkdown(input.nodeId),
    ...input.gaps.map((gap) =>
      escapeReviewMarkdown(`${stageLabels[gap.stage]} — ${gap.description}`),
    ),
    '아래 노드는 미해결 작업의 위치를 표시하는 대역입니다. 실제 API를 호출하거나 응답을 만들지 않습니다.',
    '실수로 실행하지 않도록 Start의 연결을 끊어 두었습니다. 이 대역을 직접 실행하거나 다시 연결하면 오류로 중단됩니다.',
    '필요한 API·입력값·연결을 확인한 뒤 대역을 실제 구현으로 교체하고 검증하세요. 교체 전에는 Start를 연결하지 마세요.',
  ];
  for (const gap of input.gaps)
    if (gap.callId !== undefined && gap.targetPointer !== undefined)
      content.push(
        '확인할 요청값: ' +
          escapeReviewMarkdown(gap.callId + gap.targetPointer),
      );
  if (input.operation)
    content.push(
      '대상 OAS 작업: ' +
        escapeReviewMarkdown(
          input.operation.key.documentId +
            ' ' +
            input.operation.method +
            ' ' +
            input.operation.path,
        ),
    );
  return content;
}

import { createApiCatalog, resolveApiOperations } from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  describeN8nManualTrigger,
} from '@openapi-flow/n8n';
import { clarificationSpec } from './api-clarification-fixture.mjs';

export const clarificationLimits = {
  maxCategories: 4,
  maxQuestionsPerCategory: 3,
  maxChoicesPerQuestion: 5,
  maxQuestionsPerRound: 6,
};

export async function workflowClarificationFixture() {
  const catalog = await createApiCatalog([
    { id: 'members', spec: clarificationSpec },
  ]);
  const operations = await resolveApiOperations(
    catalog,
    catalog.operations.map((item) => item.key),
  );
  const context = {
    messages: [
      {
        id: 'request-1',
        text: '회원 간단 정보를 조회하는 테스트 워크플로우를 만들어줘.',
      },
    ],
    operations,
    capabilities: createN8nNativeCapabilities(),
    entrypoint: describeN8nManualTrigger(),
  };
  const source = {
    kind: 'message',
    messageId: 'request-1',
    quote: context.messages[0].text,
  };
  const explanation = {
    reason: '사용자가 회원 간단 정보 조회를 요청했습니다.',
    evidence: [source],
  };
  const proposal = {
    statements: [
      { text: context.messages[0].text, sources: [source], explanation },
    ],
    categories: [],
    suggestions: [],
  };
  return { context, limits: clarificationLimits, proposal };
}

export function clarificationQuestions(source, withExplanations = true) {
  const reason = withExplanations
    ? {
        explanation: {
          reason: '사용자 요청에서 이 동작을 확정하지 않았습니다.',
          evidence: [source],
        },
      }
    : {};
  return [
    {
      title: '실패 처리',
      ...reason,
      questions: [
        {
          message: '조회가 실패하면 어떻게 처리할까요?',
          answer: {
            kind: 'single-choice',
            choices: [
              { label: '오류로 중단', ...reason },
              { label: '결과만 확인', ...reason },
            ],
          },
          ...reason,
        },
        {
          message: '어떤 결과를 확인할까요?',
          answer: {
            kind: 'multiple-choice',
            choices: [
              { label: '회원번호', ...reason },
              { label: '이메일', ...reason },
            ],
          },
          ...reason,
        },
        {
          message: '추가로 필요한 검사가 있나요?',
          answer: { kind: 'text' },
          ...reason,
        },
      ],
    },
  ];
}

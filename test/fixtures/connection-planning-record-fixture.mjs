import { createN8nNativeCapabilities } from '@openapi-flow/n8n';
import { graphMaterials, graphPlan } from './request-binding-fixture.mjs';

export function connectionPlanningFixture() {
  const materials = globalThis
    .structuredClone(graphMaterials)
    .map((material) => ({
      ...material,
      status: 'ready',
      purpose: `선택된 ${material.arguments.callId}의 원래 호출 역할`,
    }));
  const edges = globalThis.structuredClone(graphPlan.edges);
  return {
    input: {
      scenario:
        'source 조회 후 detail·price·stock은 서로 독립적으로 분기합니다. 세 결과를 기존 join으로 모은 뒤 summary를 실행합니다. 고정된 연결은 유지하고 필요한 연결만 추가합니다.',
      materials,
      capabilities: createN8nNativeCapabilities(),
      nativeNodes: globalThis.structuredClone(graphPlan.nativeNodes),
      edges: edges.slice(0, 1),
    },
    proposal: { edges: edges.slice(1), additionalGaps: [], blockedCalls: [] },
    plan: { ...globalThis.structuredClone(graphPlan), blockedCalls: [] },
  };
}

export function explainConnections(proposal) {
  return {
    reason:
      '선행 응답을 기다린 뒤 독립 조회를 분기하고 기존 합류 노드에서 모든 결과를 모읍니다.',
    edges: proposal.edges.map((edge) => ({
      ...edge,
      reason: `${edge.from}의 ${edge.output} 결과를 ${edge.to}의 ${edge.input}에서 사용합니다.`,
    })),
    additionalGaps: globalThis.structuredClone(proposal.additionalGaps),
    ...(proposal.blockedCalls === undefined
      ? {}
      : {
          blockedCalls: proposal.blockedCalls.map((call) => ({
            ...globalThis.structuredClone(call),
            reason: '요청한 실행이 명시된 결손에 의존합니다.',
          })),
        }),
  };
}

export function connectionPlanningModel(output, inspect = () => {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls++;
          await inspect({
            schema,
            options,
            messages,
            context: JSON.parse(messages[1].content),
          });
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

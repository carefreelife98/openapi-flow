import { graphMaterials, graphPlan } from './request-binding-fixture.mjs';
import { createN8nNativeCapabilities } from '@openapi-flow/n8n';

export function graphPlanningFixture(mode = 'executable') {
  const ready = globalThis.structuredClone(graphMaterials).map((material) => ({
    ...material,
    status: 'ready',
    purpose: `선택된 ${material.arguments.callId} 호출의 원래 역할`,
  }));
  const input = {
    mode,
    scenario:
      'source 조회 후 detail·price·stock을 독립적으로 분기하고, 세 결과를 Merge로 모은 뒤 summary를 실행합니다. 사용자가 요청하지 않은 검사·조건·값 변환은 추가하지 않습니다.',
    materials: ready,
    capabilities: createN8nNativeCapabilities(),
    preparedNativeNodes: [],
    gaps: [],
  };
  const proposal = {
    mode,
    additionalNativeNodes: globalThis.structuredClone(graphPlan.nativeNodes),
    edges: globalThis.structuredClone(graphPlan.edges),
    ...(mode === 'reviewable'
      ? { additionalGaps: [], blockedCalls: [] }
      : { gaps: [] }),
  };
  const { mode: ignored, ...output } = proposal;
  if (ignored !== mode) throw new Error('fixture mode mismatch');
  return {
    input,
    proposal,
    output,
    plan: {
      ...globalThis.structuredClone(graphPlan),
      ...(mode === 'reviewable' ? { blockedCalls: [] } : {}),
    },
  };
}

export function explainGraphOutput(output) {
  return {
    ...globalThis.structuredClone(output),
    reason:
      '원본 응답을 기다린 뒤 독립 요청을 분기하고 모든 후속 응답을 모아 요약합니다.',
    ...(output.additionalNativeNodes === undefined
      ? {}
      : {
          additionalNativeNodes: output.additionalNativeNodes.map((node) => ({
            ...globalThis.structuredClone(node),
            reason: '요청된 독립 응답을 모두 모은 뒤 후속 호출을 수행합니다.',
          })),
        }),
    edges: output.edges.map((edge) => ({
      ...edge,
      reason: `${edge.from}의 ${edge.output} 결과를 ${edge.to}의 ${edge.input}에 전달합니다.`,
    })),
    ...(output.blockedCalls === undefined
      ? {}
      : {
          blockedCalls: output.blockedCalls.map((call) => ({
            ...globalThis.structuredClone(call),
            reason: '실행에 필요한 명시적 결손이 아직 해결되지 않았습니다.',
          })),
        }),
  };
}

export function graphModelAssessment(output) {
  return {
    reason: output.reason,
    nodes: (output.additionalNativeNodes === undefined
      ? []
      : output.additionalNativeNodes
    ).map((node) => ({ nodeId: node.id, reason: node.reason })),
    edges: globalThis.structuredClone(output.edges),
    blockedCalls: globalThis.structuredClone(
      output.blockedCalls === undefined ? [] : output.blockedCalls,
    ),
  };
}

export function graphPlannerInput(input) {
  const { mode, ...common } = input;
  if (mode === 'reviewable') return common;
  const { gaps, ...plain } = common;
  if (gaps.length)
    throw new Error('Executable fixture cannot carry supplied gaps');
  return {
    ...plain,
    materials: input.materials.map(({ status, ...material }) => {
      if (status !== 'ready')
        throw new Error('Executable fixture must be ready');
      return material;
    }),
  };
}

export function graphPlanningModel(output, inspect = () => {}) {
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

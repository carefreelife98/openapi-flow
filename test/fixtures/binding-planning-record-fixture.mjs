import { materials, bindingPlan } from './request-binding-fixture.mjs';

export function bindingPlanningFixture() {
  return {
    scenario:
      '원본 조회의 id로 상세·가격·재고를 조회하고 각 응답과 원본 배열·객체를 요약 요청에 그대로 연결한다.',
    materials: globalThis.structuredClone(materials).map((material) => ({
      ...material,
      purpose: `원래 선택한 ${material.callId} 호출의 역할`,
    })),
  };
}

export function explainedBindingProposal(plan = bindingPlan) {
  return {
    ...globalThis.structuredClone(plan),
    calls: plan.calls.map((call) => ({
      ...globalThis.structuredClone(call),
      reason: call.bindings.length
        ? `${call.callId}에는 시나리오가 요청한 원래 응답 필드만 연결했습니다.`
        : `${call.callId}에는 선행 응답 연결이 필요하지 않습니다.`,
    })),
  };
}

export function bindingPlanningModel(output, inspect = () => {}) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    withStructuredOutput(schema, options) {
      return {
        async invoke(messages) {
          calls++;
          await inspect({ schema, options, messages });
          return globalThis.structuredClone(output);
        },
      };
    },
  };
}

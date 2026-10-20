import { createJsonOutputCapability } from '@openapi-flow/n8n';
import {
  runtimeNativeSchema,
  runtimeNativeValue,
} from './native-runtime-input-fixture.mjs';

export function nativePlanningRecordFixture() {
  const capability = createJsonOutputCapability({
    name: 'typed-context',
    description:
      'Produce only the supplied typed JSON item, preserving literal values and types.',
    parametersSchema: runtimeNativeSchema,
  });
  const first = {
    ...globalThis.structuredClone(runtimeNativeValue),
    id: 'first',
    count: 0,
    enabled: false,
  };
  const second = {
    ...globalThis.structuredClone(runtimeNativeValue),
    id: 'second',
    count: 2,
    enabled: true,
  };
  const nodes = [
    { id: 'first-context', capability: capability.name, parameters: first },
    { id: 'second-context', capability: capability.name, parameters: second },
  ];
  return {
    input: {
      planId: 'native-record',
      scenario: `제공된 typed-context 기능으로 다음 JSON 값을 각각 그대로 출력하는 서로 독립적인 native 인스턴스 두 개를 만들어줘. 값의 의미나 타입을 바꾸지 마. 첫 번째: ${JSON.stringify(first)}. 두 번째: ${JSON.stringify(second)}. 이 단계에서는 API 호출이나 연결을 만들지 마.`,
      capabilities: [capability],
    },
    nodes,
    explained: {
      decision: {
        additions: nodes.map((node, index) => ({
          node: globalThis.structuredClone(node),
          reason: `요청한 ${index + 1}번째 JSON 값의 원래 타입과 값을 유지합니다.`,
        })),
        gaps: [],
      },
    },
  };
}

export function nativePlanningRecordModel(output, inspect = () => {}) {
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

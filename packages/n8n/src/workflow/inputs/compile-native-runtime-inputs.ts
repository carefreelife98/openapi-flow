import { sticky } from '@n8n/workflow-sdk';
import {
  inspectNativeRuntimeInputs,
  createNativeRuntimeParameterMaterializations,
} from '@openapi-flow/core';
import type {
  PrepareNativeRuntimeInputsInput,
  PreparedNativeRuntimeInputs,
  AssembleNativeRuntimeInputsInput,
  N8nNativeInputCompilationResult,
} from '../../types/native-runtime-parameters.js';
import { n8nNativeInputConfigurationSchema } from '../../schemas/native-runtime-input-schema.js';
import { resolveN8nNativeMaterials } from '../resolve-n8n-native-materials.js';
import { createRuntimeInputNativeCapabilities } from './create-runtime-input-native-capabilities.js';
import { createTemplateInputNodes } from '../../nodes/inputs/create-template-input-nodes.js';
import { buildN8nWorkflow } from '../build-n8n-workflow.js';
import {
  TEMPLATE_INPUT_ID,
  TEMPLATE_INPUT_NAME,
  TEMPLATE_PREFLIGHT_ID,
  TEMPLATE_PREFLIGHT_NAME,
  TEMPLATE_GUIDE_ID,
} from '../templates/workflow-template-identities.js';

/** One explicit execution-input protocol, shared by strict and review compilation. */
export function prepareNativeRuntimeInputs(
  input: PrepareNativeRuntimeInputsInput,
): PreparedNativeRuntimeInputs | undefined {
  if (input.nativeInputs === undefined) {
    if (input.nativeNodes.some((node) => node.runtimeParameters !== undefined))
      throw new Error(
        'nativeInputs.revision is required when the plan declares native runtime parameters',
      );
    return undefined;
  }
  const configuration = n8nNativeInputConfigurationSchema.parse(
    input.nativeInputs,
  );
  const snapshot = resolveN8nNativeMaterials({
    apiMaterials: input.apiMaterials,
    nativeOutputs: input.nativeOutputs,
    nativeNodes: input.nativeNodes,
    capabilities: input.capabilities,
  });
  const inputValues =
    configuration.inputValues === undefined ? {} : configuration.inputValues;
  const inspection = inspectNativeRuntimeInputs({
    nativeNodes: input.nativeNodes,
    capabilities: snapshot.capabilities,
    inputValues,
  });
  if (inspection.status === 'invalid-input')
    throw new Error(
      `nativeInputs.inputValues: ${inspection.issues.map((issue) => issue.message).join('; ')}`,
    );
  if (!inspection.slots.length) return undefined;
  return {
    revision: configuration.revision,
    inputValues: structuredClone(inputValues),
    inputsReady: inspection.status === 'ready',
    slots: inspection.slots,
    nativeParameters: createNativeRuntimeParameterMaterializations({
      nativeNodes: input.nativeNodes,
      capabilities: snapshot.capabilities,
    }),
    capabilities: createRuntimeInputNativeCapabilities({
      capabilities: snapshot.capabilities,
      slots: inspection.slots,
      revision: configuration.revision,
      inputNodeName: TEMPLATE_PREFLIGHT_NAME,
    }),
  };
}

/** Preserve every original DAG edge; only explicit system roots precede the graph. */
export function assembleNativeRuntimeInputs(
  input: AssembleNativeRuntimeInputsInput,
): N8nNativeInputCompilationResult {
  const prepared = input.nativeInputs;
  const inputSlots = prepared.slots.map((slot) => {
    const fragment = input.nodes.find((node) => node.nodeId === slot.nodeId);
    if (!fragment)
      throw new Error(
        `Native input ${slot.id} has no compiled node ${slot.nodeId}`,
      );
    return {
      ...slot,
      editNodeId: TEMPLATE_INPUT_ID,
      editNodeName: TEMPLATE_INPUT_NAME,
      editParameter: 'jsCode' as const,
      materializerNodeName: fragment.entry.name,
    };
  });
  const guide = [
    '# Native 실행 입력 안내',
    `입력 버전: ${prepared.revision}`,
    '입력 설정 노드의 inputValues 객체에 아래 슬롯 ID와 실제 JSON 값을 넣으세요. 미입력 값에 임시 값을 넣지 마세요. 인증 비밀값은 n8n credential에 설정하세요.',
    `입력 준비: ${prepared.inputsReady ? '완료' : '미입력 값 있음'}`,
    ...(input.triggerConnections === 'detached'
      ? [
          '결손이 있어 Start 연결을 끊었습니다. 경고 영역을 해결한 뒤 연결을 검토하세요.',
        ]
      : []),
    ...inputSlots.map(
      (slot) =>
        `\n## ${slot.nodeId}${slot.targetPointer}\n슬롯 ID: ${slot.id}\n입력 위치: ${slot.editNodeName}\n실행 직전 검사: ${slot.materializerNodeName}\n원래 형식:\n\`\`\`json\n${JSON.stringify(slot.schema, null, 2)}\n\`\`\``,
    ),
    '입력 사전 검사는 모든 초기 native 값을 외부 호출 전에 확인합니다. 각 native 노드는 실행 직전에도 원래 전체 스키마와 버전을 검사합니다. 부분 실행이나 pinning은 검사를 우회할 수 있으므로 보안 경계로 사용하지 마세요.',
  ].join('\n\n');
  const system = createTemplateInputNodes({
    revision: prepared.revision,
    slots: prepared.slots,
    inputValues: prepared.inputValues,
    requests: [],
    nativeParameters: prepared.nativeParameters,
  });
  const height =
    160 +
    guide
      .split('\n')
      .reduce(
        (total, line) => total + Math.max(1, Math.ceil(line.length / 90)) * 24,
        0,
      );
  const workflow = buildN8nWorkflow({
    ...input,
    nodes: [...system, ...input.nodes],
    edges: [
      {
        from: TEMPLATE_INPUT_ID,
        output: 'main',
        to: TEMPLATE_PREFLIGHT_ID,
        input: 'main',
      },
      ...input.starts.map((to) => ({
        from: TEMPLATE_PREFLIGHT_ID,
        output: 'main',
        to,
        input: 'main',
      })),
      ...input.edges,
    ],
    starts: [TEMPLATE_INPUT_ID],
    annotations: [
      ...input.annotations,
      sticky(guide, [], {
        id: TEMPLATE_GUIDE_ID,
        name: 'Native 실행 입력 안내',
        position: [0, -height - 100],
        width: 1000,
        height,
        color: prepared.inputsReady ? 5 : 3,
      }),
    ],
  });
  return {
    workflow,
    nativeInputTemplate: {
      revision: prepared.revision,
      inputsReady: prepared.inputsReady,
      inputSlots,
      guide,
    },
  };
}

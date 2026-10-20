import type { CreateTemplateGuideInput } from '../../types/workflow-template.js';
import { escapeReviewMarkdown } from '../review/escape-review-markdown.js';

/** Status and edit locations derive from the same revision and compiled mapping. */
export function createWorkflowTemplateGuide(
  input: CreateTemplateGuideInput,
): string {
  const text = escapeReviewMarkdown;
  const lines = [
    '# 워크플로우 사용 안내',
    `초안 버전: ${input.draft.revision}`,
    `설계 결정: ${input.readiness.designReady ? '확정' : '확인 필요'} / 사람 검토: ${input.readiness.reviewed ? '완료' : '미완료'} / 실제 요청 입력: ${input.requestInputsReady ? '준비됨' : '미입력 있음'} / native 입력: ${input.nativeInputsReady ? '준비됨' : '미입력 있음'}`,
    input.triggerConnected
      ? 'Start → 입력 설정 → 입력 사전 검사 → 업무 흐름 순서로 실행됩니다. 미입력·잘못된 값은 외부 호출 전에 오류로 중단됩니다.'
      : '미확정 설계 또는 배포 설정이 있어 Start 연결을 끊었습니다. 아래 항목을 해결한 뒤 다시 생성하거나 설정을 확인하고 Start를 입력 설정에 연결하세요.',
    '## 입력 슬롯',
    '입력 설정 노드의 jsCode에 있는 inputValues 객체에 슬롯 ID를 키로 실제 JSON 값을 추가하세요. API 값은 원래 OAS, native 값은 등록된 파라미터 스키마를 따릅니다. native 슬롯에는 표시된 필드의 값 또는 전체 파라미터 객체를 입력합니다. 이미 정한 리터럴은 보존하며, 포트·참조·연결을 바꾸는 설정은 실행 입력으로 미루지 않습니다. 비밀값은 여기에 넣지 말고 n8n credential을 사용하세요.',
    ...input.slots.map(
      (slot) =>
        `- ${text(slot.id)}: ${text(slot.kind === 'api-request-input' ? slot.callId + slot.targetPointer : 'native ' + slot.nodeId + (slot.targetPointer === '' ? ' 전체 파라미터' : slot.targetPointer))} → ${text(slot.materializerNodeName)} / 원래 스키마: ${text(JSON.stringify(slot.schema))}${slot.kind === 'api-request-input' && slot.requestedInputs !== undefined ? ' / 사용자 요청으로 포함할 입력: ' + text(slot.requestedInputs.join(', ')) + ' (OAS 필수 여부와 별도)' : ''}`,
    ),
    ...(input.slots.length ? [] : ['추가로 입력할 필수 실행 값이 없습니다.']),
    '## 노드 구성',
    ...input.mappings.map(
      (mapping) =>
        `- ${text(mapping.nodeId)} (${mapping.kind === 'api' ? text(mapping.operation.method + ' ' + mapping.operation.path) : mapping.kind === 'native' ? text('등록 native ' + mapping.capability) : '확인 필요 · 미해결 기능'}): ${text(mapping.entryNodeName)} → ${text(mapping.exitNodeName)}`,
    ),
    '## 연결과 데이터 출처',
    ...input.draft.edges.map(
      (edge) =>
        `- ${text(edge.from)} (${text(edge.output)}) → ${text(edge.to)} (${text(edge.input)})`,
    ),
    ...input.draft.apiCalls.flatMap((call) =>
      call.bindings.map(
        (binding) =>
          `- ${text(binding.sourceNodeId + binding.sourcePointer)} 값을 ${text(call.id + binding.targetPointer)}에 타입 변환 없이 전달합니다.`,
      ),
    ),
    '## 미확정 결정',
    ...(input.draft.gapNodes === undefined
      ? []
      : input.draft.gapNodes.flatMap((gap) => [
          `- ${text(gap.id)}: ${text(gap.requestedBehavior)} / ${text(gap.finding.kind)} / 판단 근거: ${text(gap.finding.reason)}`,
          ...(gap.finding.kind === 'api-contract-gap'
            ? [
                `  대상 OAS 작업: ${text(gap.finding.operation.documentId + ' ' + gap.finding.operation.operationRef)}`,
              ]
            : []),
          `  제공된 계약에서 충족하지 못한 기능이며 전체 서비스의 API 부재를 확정하지 않습니다. 원래 검토 범위: OAS ${gap.inventory.operations.length}개 작업·native ${gap.inventory.capabilities.length}개 계약. 대역을 실제 구현으로 교체하고 검증하기 전에는 Start를 연결하지 마세요.`,
          `  검토 범위 일치: ${input.mappings.some((mapping) => mapping.kind === 'capability-gap' && mapping.nodeId === gap.id && mapping.inventoryCurrent) ? '현재 계약과 일치' : '계약 변경됨. 새 계약으로 다시 검토해야 하며 결손을 자동 해소하지 않았습니다.'}`,
        ])),
    ...input.draft.requirements
      .filter((item) => item.state !== 'confirmed')
      .map(
        (item) =>
          `- ${text(item.id)}: ${text(item.text)} / 영향 범위: ${text(item.scope.kind === 'workflow' ? '전체' : item.scope.nodeIds.join(', '))}`,
      ),
    '## 배포 설정',
    ...input.deploymentRequirements.map(
      (item) =>
        `- ${text(item.documentId)} / ${text(item.callId)}: ${text(item.fields.join(', '))}. 주소는 ${text(item.materializerNodeName)}의 config.templateUrl, credential은 ${text(item.requestNodeName)}에서 설정하세요. 호스트에 배포 옵션을 제공하고 다시 생성하는 방법을 권장합니다.`,
    ),
    'credential 참조를 제공해도 실제 n8n에서 해당 credential을 사용할 권한이 있는지는 여기서 확인하지 않습니다. 실행 전 n8n에서 확인하세요.',
    '## 실행 전 확인',
    '입력 사전 검사와 요청 전 OAS 검사는 정상 실행 경로의 오류 방지 장치입니다. 부분 실행·pinning·JSON 직접 편집으로 건너뛸 수 있으므로 보안 경계가 아닙니다. 이 산출물은 사용자 n8n에 저장·활성화·실행하지 않습니다.',
  ];
  return lines.join('\n\n');
}

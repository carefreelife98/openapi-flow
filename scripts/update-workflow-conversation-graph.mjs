import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
import {
  createWorkflowDraftConversationGraph,
  createIncrementalWorkflowConnectionGraph,
  createApiArgumentPlanningGraph,
  createNativeSelectionPlanningGraph,
} from '@openapi-flow/example-langgraph-workflow';

export const conversationGraphDocument = new URL(
  '../docs/current-conversation-graph.md',
  import.meta.url,
);

// Display labels only. All routes and node identities come from the real compiled graph.
const stages = {
  input: {
    label: '입력·초안 확인',
    nodes: { __start__: '시작', acceptTurn: '새 메시지·초안 검증' },
  },
  clarify: {
    label: '요구사항 구체화',
    nodes: {
      clarifyRequest: '질문·선택지·요구사항 제안',
      scopeClarification: '확정 요구의 적용 범위 결정',
    },
  },
  analyze: {
    label: 'API·native 및 변경 선택',
    nodes: { analyze: '기존 초안·변경·기능 결손 분석' },
  },
  schedule: {
    label: '준비된 작업 배정',
    nodes: { schedule: '계약·선행 자료 준비 상태 검사' },
  },
  api: {
    label: 'OAS 기반 API 계획',
    nodes: {
      'api-media': '요청 본문 형식 결정',
      'api-binding-inputs': '선행 결과를 받을 입력 선택 (선택 옵션)',
      'api-bindings': '선행 응답·입력 참조 계획',
      'api-arguments': '명시한 요청값 생성·요청 입력 추적 (선택 옵션)',
      'api-input-targets': '수정할 API 입력 선택',
      'api-input-values': '선택 입력의 값 생성',
      'api-binding-edit': 'API 바인딩 수정',
      'api-repair': '영향받은 API 참조 재계획',
    },
  },
  native: {
    label: 'native 계획',
    nodes: {
      'native-dependencies': '지원하는 데이터 생산자 선택',
      'native-addition': '새 native 노드 설정 생성',
      'native-addition-ownership': 'native 설정의 값 소유권 결정',
      'native-targets': '수정할 native 설정 선택',
      'native-values': '선택한 native 설정값 생성',
      'native-repair': '영향받은 native 참조 재계획',
    },
  },
  connections: {
    label: '조건·연결·DAG 검사',
    nodes: {
      connections: '연결 계획·전체 DAG 검사 / 단일 독립 노드는 코드 확정',
    },
  },
  human: {
    label: '사용자 질문·검토·답변',
    nodes: {
      prepareReviewSuggestions: '선택적 후속 요청 제안',
      awaitClarification: '요구 구체화 답변 대기',
      awaitReview: '후보·변경 검토 대기',
      awaitQuestions: '미확정 입력·설계 답변 대기',
      applyResponse: '명시적 답변·승인·수정 적용',
      extractInputAnswers: '원문 값·선택적 OAS enum 후보로 입력 답변 해석',
    },
  },
  output: {
    label: '초안 확정·JSON 출력 또는 no-workflow / 취소 종료',
    nodes: {
      adopt: '검증한 초안 확정·출력 대기',
      export: 'SDK JSON 출력 또는 no-workflow 반환',
      __end__: '현재 턴 종료',
    },
  },
};

function mermaid(nodes, edges) {
  return [
    'flowchart TD',
    ...nodes.map(({ id, label }) => `  ${id}[${JSON.stringify(label)}]`),
    ...edges.map(
      ({ source, target, conditional }) =>
        `  ${source} ${conditional ? '-.->' : '-->'} ${target}`,
    ),
  ].join('\n');
}

export async function describeConversationGraph() {
  const graph = createWorkflowDraftConversationGraph({
    context: { operations: [], capabilities: [], messages: [] },
    model: {
      withStructuredOutput() {
        throw new Error('Graph inspection must never invoke a model');
      },
    },
    checkpointer: new MemorySaver(),
    reviewPolicy: 'review',
    name: 'Conversation topology inspection',
  });
  const actual = await graph.getGraphAsync();
  const membership = new Map();
  for (const [group, stage] of Object.entries(stages))
    for (const [nodeId, label] of Object.entries(stage.nodes)) {
      assert.ok(
        !membership.has(nodeId),
        `Duplicate graph display label: ${nodeId}`,
      );
      membership.set(nodeId, { group, label });
    }
  const ids = Object.keys(actual.nodes).sort();
  assert.deepEqual(
    [...membership.keys()].sort(),
    ids,
    'Every actual graph node requires an explicit Korean display label; do not omit new nodes',
  );
  const edges = actual.edges
    .map(({ source, target, conditional }) => ({
      source,
      target,
      conditional: conditional === true,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
    );
  const grouped = new Map();
  for (const edge of edges) {
    const source = membership.get(edge.source).group,
      target = membership.get(edge.target).group;
    if (source === target) continue;
    const key = `${source}:${target}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      source,
      target,
      conditional: edge.conditional && (existing?.conditional ?? true),
    });
  }
  const nodes = ids.map((id, index) => ({
    id,
    diagramId: `node${index}`,
    label: `${id} / ${membership.get(id).label}`,
    group: membership.get(id).group,
  }));
  const aliases = new Map(nodes.map((node) => [node.id, node.diagramId]));
  return {
    nodes,
    edges,
    digest: createHash('sha256')
      .update(JSON.stringify({ ids, edges }))
      .digest('hex'),
    overview: mermaid(
      Object.entries(stages).map(([id, stage]) => ({ id, label: stage.label })),
      [...grouped.values()],
    ),
    detail: mermaid(
      nodes.map((node) => ({ id: node.diagramId, label: node.label })),
      edges.map((edge) => ({
        ...edge,
        source: aliases.get(edge.source),
        target: aliases.get(edge.target),
      })),
    ),
  };
}

export async function describeIncrementalConnectionGraph() {
  const graph = createIncrementalWorkflowConnectionGraph({
    source() {
      throw new Error('Topology inspection must not load source material');
    },
    model: {
      withStructuredOutput() {
        throw new Error('Topology inspection must never invoke a model');
      },
    },
    // Inspection-only resource inputs; these are not application policy defaults.
    policy: { maxModelInvocations: 1, maxRejectedProposals: 0, deadlineMs: 1 },
  });
  const actual = await graph.getGraphAsync();
  const labels = {
    __start__: '자식 그래프 시작',
    initialize: '연결 상태·원본·예산 확인',
    reserveModelCall: '코드: 호출 예산 선점·체크포인트',
    interpretGoals: 'LLM: 확정 요구를 연결 목표로 해석',
    proposeBundle: 'LLM: 전체 맥락에서 다음 연결 묶음 제안',
    applyBundle: '코드: 묶음 검사·원자 적용 또는 거절',
    publishProgress: '검증된 상태 요약 발행·완료 조건 검사',
    finalize: '기존 전체 DAG 검사·계획 확정',
    publishCompletion: '완료 상태 요약 발행',
    fail: '체크포인트 실패 참조·원본 오류 전파',
    prepareNative: '선택된 native 역할·소유권으로 코드 ID 생성',
    planNativeDependencies: '필요한 데이터 생산자 선택 / 선택 없으면 코드 확정',
    generateNativeParameters: '선택한 native 설정값 생성 / 값 없으면 코드 확정',
    applyNativeMaterial: '원본·설정 재검사·native 추가·동일 세션 재개',
    recoverGoalMaterial: 'LLM: 목표 수정 또는 원인 단계 재계획 선택',
    replanOriginMaterial: '호스트: 예약된 모델로 원인 단계 실행',
    applyOriginMaterial: '코드: OAS·변경 범위 검사·재료 이력 저장',
    publishMaterialRecovery: '재계획 단계 요약 발행·저장 결과에서 재개',
    reviewInitialGoals: '별도 LLM: 원문 전체와 초기 목표·실제 매핑 검토',
    planOutline: '선택적 LLM: 전역 업무 개요·연결 묶음 계획',
    publishOutline: '저장한 전역 개요 발행·결과에서 재개',
    reviseAcceptedPlan: 'LLM: 수용 목표·재료·거절 연결을 함께 재검토',
    reviewRevisedGoals: '별도 LLM: 수정 목표와 원문 요구 검토',
    adoptRevision: '코드: 수정 후보 재검사·수용본 원자 교체',
    publishRevision: '수정 단계·영향 요약 발행·저장 결과에서 재개',
    generateMaterialArguments:
      'LLM: OAS에서 도출한 API 한 건의 후속 요청값 생성',
    publishMaterialArguments:
      '저장한 API별 요청값 작업의 안전한 진행 요약 발행',
    finishMaterialArguments: '코드: API별 결과 결합·원본 작업 제출',
    __end__: '완료·native 요청·업무 질문 결과를 부모로 반환',
  };
  const ids = Object.keys(actual.nodes).sort();
  assert.deepEqual(
    Object.keys(labels).sort(),
    ids,
    'Every incremental graph node requires a Korean display label',
  );
  const nodes = ids.map((id, index) => ({
    id,
    diagramId: `incremental${index}`,
    label: `${id} / ${labels[id]}`,
  }));
  const aliases = new Map(nodes.map((node) => [node.id, node.diagramId]));
  const edges = actual.edges
    .map(({ source, target, conditional }) => ({
      source,
      target,
      conditional: conditional === true,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
    );
  return {
    nodes,
    edges,
    detail: mermaid(
      nodes.map((node) => ({ id: node.diagramId, label: node.label })),
      edges.map((edge) => ({
        ...edge,
        source: aliases.get(edge.source),
        target: aliases.get(edge.target),
      })),
    ),
  };
}

export async function describeApiArgumentPlanningGraph() {
  const graph = createApiArgumentPlanningGraph({
    source() {
      throw new Error('Topology inspection must not load API source');
    },
    model: {
      withStructuredOutput() {
        throw new Error('Topology inspection must not invoke a model');
      },
    },
    policy: { maxAttempts: 1, maxRejectedProposals: 0, deadlineMs: 1 },
  });
  const actual = await graph.getGraphAsync();
  const labels = {
    __start__: 'API 요청값 계획 시작',
    initialize: '원문·OAS·역할·정책 snapshot 확인',
    reserveAttempt: '예산 확인·시도 예약 저장',
    publishAttempt: '안전한 시작 요약 발행',
    generateValues: 'OSS 한 번 호출·리터럴 거절 근거 보존',
    fail: '실패 참조 저장·원본 오류 종료 (모델 재실행 금지)',
    publishOutcome: '결과 요약 발행·완료 또는 다음 시도',
    __end__: '검증된 요청값 반환 (미정 입력은 별도)',
  };
  const ids = Object.keys(actual.nodes).sort();
  assert.deepEqual(Object.keys(labels).sort(), ids);
  const nodes = ids.map((id, index) => ({
    id,
    diagramId: `argument${index}`,
    label: `${id} / ${labels[id]}`,
  }));
  const aliases = new Map(nodes.map((node) => [node.id, node.diagramId]));
  const edges = actual.edges
    .map(({ source, target, conditional }) => ({
      source,
      target,
      conditional: conditional === true,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
    );
  return {
    nodes,
    edges,
    detail: mermaid(
      nodes.map((node) => ({ id: node.diagramId, label: node.label })),
      edges.map((edge) => ({
        ...edge,
        source: aliases.get(edge.source),
        target: aliases.get(edge.target),
      })),
    ),
  };
}

export async function describeNativeSelectionPlanningGraph() {
  const graph = createNativeSelectionPlanningGraph({
    capabilities: [],
    now: Date.now,
    policy: { maxModelInvocations: 1, maxReselections: 0, deadlineMs: 1 },
  });
  const actual = await graph.getGraphAsync();
  const labels = {
    __start__: 'native 선택 계획 시작',
    initialize: '원문·API·기능·정책 snapshot 확인',
    reserveModelCall: '예산·취소·기한 검사 / 호출 예약 저장',
    selectInstances: '독립 선택 또는 검토·시도 이력으로 재선택',
    reviewSelection: '원래 결손 검토 / 미지원·업무 판단 보존',
    publishOutcome: '안전한 결과 요약 / 완료·중단·다음 선택',
    fail: '저장한 실패 참조로 종료 / 모델 재호출 금지',
    __end__: '원래 선택·검토 이력·호출 집계 반환',
  };
  const ids = Object.keys(actual.nodes).sort();
  assert.deepEqual(Object.keys(labels).sort(), ids);
  const nodes = ids.map((id, index) => ({
    id,
    diagramId: `nativeSelection${index}`,
    label: `${id} / ${labels[id]}`,
  }));
  const aliases = new Map(nodes.map((node) => [node.id, node.diagramId]));
  const edges = actual.edges
    .map(({ source, target, conditional }) => ({
      source,
      target,
      conditional: conditional === true,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target),
    );
  return {
    nodes,
    edges,
    detail: mermaid(
      nodes.map((node) => ({ id: node.diagramId, label: node.label })),
      edges.map((edge) => ({
        ...edge,
        source: aliases.get(edge.source),
        target: aliases.get(edge.target),
      })),
    ),
  };
}

export async function buildConversationGraphDocument() {
  const graph = await describeConversationGraph();
  const incremental = await describeIncrementalConnectionGraph();
  const argumentsGraph = await describeApiArgumentPlanningGraph();
  const nativeSelection = await describeNativeSelectionPlanningGraph();
  return [
    '# 현재 대화형 워크플로우 설계 그래프',
    '',
    '이 그래프는 사용자의 대화로 n8n 워크플로우를 만드는 LangGraph입니다. 최종 결과물인 n8n 실행 그래프와는 다릅니다. 구조도이며, 실제 실행 로그나 모든 기능의 검증 완료를 뜻하지 않습니다.',
    '',
    '릴리스 검증(2026-10-27, 0.4.0·게시 전): 시작·종료 지점을 모델 출력 없이 자동 지정하던 계획기를 수정했습니다. 모델은 실제 시작/종료 의도를 선택하고 코드는 유일한 선언 포트만 해석하며 전체 그래프·개요 범위·revision 검사를 유지합니다. 집중 110건, 수정 후 전체 1678/1679·기존 Ajv 한 실패·skip/cancel 0, 원본 OAS 4파일/59건, 격리 엔진 명령 33개와 독립 패키지 설치·strict 타입 검사가 통과했습니다. 최초 Lint/OAS 대역 실패는 기록을 보존하고 명시적 계약으로 수정한 뒤 재검사했습니다. 보안 High 5는 이전 SDK Zod 3 의존 기록과 같으며 clean audit으로 표시하지 않습니다. 필수 planningParametersSchema와 추적 출력 타입 변경으로 후보는 0.4.0입니다. 소스 원격 선반영·일치 태그·npm·GitHub Release·제품 공개 설치를 순서대로 진행하며 이 안내는 게시 완료의 근거가 아닙니다. Qoopilot 공개 0.3.18·사용자 서버·Cloud와 아래 실제 topology는 유지합니다. 계층적 제품 통합·남은 native·원문 다섯 예제 독립 품질 평가를 포함한 전체 목표는 미완료입니다.',
    '',
    '제품 관찰 수명(2026-10-27, 로컬 미배포): Qoopilot의 명령 전송과 SDK 관찰을 분리했습니다. 실행 중에만 새 관찰자를 연결하고 대기/종료 상태는 검증된 서버 snapshot으로 표시합니다. snapshot 순번 이후의 재생과 명령 승인/focus의 재조회를 사용하며 구독 해제를 서버 취소로 바꾸지 않습니다. 직접 HTTP와 StrictMode의 실제 hook에서 해제 뒤 같은 run 유지·복원·명시적 취소 종료를 확인했고 종료된 작업 7개 탭의 SSE는 0개였습니다. 검증용 개발 프록시의 연결 잔류 원인은 미확정입니다. 일반적인 지연 해결·원문 다섯 예제의 새 생성 성공으로 세지 않습니다. 새 OSS의 검증 후 소스 선반영·일치 태그·npm·GitHub Release·로컬 적용은 승인받았지만 아직 게시 전입니다. 실제 모델/업무 API/엔진 호출은 없고 공개 0.3.18·기존 서버·Cloud·아래 topology는 유지합니다. 계층적 제품 통합·남은 native·다섯 원문 독립 평가·릴리스의 전체 0~7 범위는 진행 중입니다.',
    '',
    '현재 작업(2026-10-27, 로컬 미배포): native 처리 결과의 수집을 공식 Aggregate로 연결했습니다. CollectNativeOutputValues는 실제 생산자 ID와 원본 포인터만 선택하며 API 수집과 검사·SDK 컴파일을 공유합니다. 자체 집계 엔진·형변환·중복 제거·배열 펼치기는 없고 원본 타입·순서·모든 pairedItem 이력을 유지합니다. 빈 입력은 가짜 결과를 만들지 않으며 부재·계약 위반은 Aggregate 전에 거절합니다. 집중 48건·원본 OAS 59건·전체 OSS 1674/1675·기존 Ajv 한 실패·skip/cancel 0, strict 타입·빌드·Lint·포맷을 확인했습니다. 합성 격리 n8n 9조건·후속 로컬 REST 4요청이 정상/차단 기대와 일치합니다. 실제 모델·업무 API 호출은 0회이며 원문 다섯 예제의 새 전체 평가·제품 UI 적용은 아닙니다. 공개 0.3.18·lockfile·기존 서버·Cloud와 실제 topology는 유지합니다. 선택 검토·계층적 제품 통합·분류/페이지·다섯 원문 독립 품질 평가·승인 릴리스의 전체 0~7 범위는 진행 중입니다.',
    '',
    '최종 소스 검증(2026-10-27): 집중 81건·원본 OAS 4파일 57건·전체 OSS 1661/1662·기존 Ajv 특수 키 한 실패·skip/cancel 0입니다. strict 타입·빌드·Lint·포맷과 실제 등록 그래프 일치를 확인했습니다. 별도 격리 n8n의 native 비교 7조건과 그룹 선택/실행 입력 6조건·로컬 요청 9건이 정상/차단 기대와 일치했습니다. 합성 엔진 실행을 원문 다섯 예제의 새 전체 생성 성공으로 합산하지 않습니다. 실제 다섯 쌍 재평가의 0/5·0/5는 아래에 구분하며 전체 목표는 진행 중입니다.',
    '',
    '후속 작업과 실제 평가(2026-10-27, 로컬 미배포): 원문 다섯 쌍의 새 독립 생성은 단일 0/5·증분 0/5이며 모두 연결 이전에 멈췄습니다. API 선택은 열 번 모두 같았고 9건은 native 결손 보고, 한 건은 모델 후보 schema를 실행 입력 검사로 옮기던 혼용 오류였습니다. 이 비교의 원본·소스 지문은 보존했으며 연결 알고리즘 실패나 속도 우위로 해석하지 않습니다. 이후 Core가 실행 capability와 모델 후보 schema를 분리하고, 기존 참조 계약상 계획 시 빈 설정이 불가능하면 전체 runtime 소유권을 후보에서 제외했습니다. 그룹 키 같은 부분 입력은 유지하며 원본 출력은 고쳐 채택하지 않습니다. 선택·설정·후속 native 설정 회귀와 실제 custom 검사/변환 거절은 유지합니다. 원본 실패 출력의 전체 입력 소유권은 별도 무변경 재생에서 올바르게 거절됐으며 새 모델 호출·성공 JSON으로 대체하지 않았습니다. Qoopilot 공개 0.3.18·기존 서버·Cloud는 그대로입니다. 계층적 제품 통합·나머지 native·전체 재평가/엔진/화면·승인 릴리스의 0~7 범위는 미완료입니다.',
    '',
    '현재 작업(2026-10-27, 로컬 미배포): 기존 IF·assertion이 API 본문과 실제 native JSON을 구분해 비교하도록 공통 계약을 보강했습니다. 준비 완료된 생산자 ID와 해당 포인터만 모델 후보로 주며 미래 출력은 추측하지 않습니다. 새 native 기능군·업무 판정 기본값·비교 알고리즘은 추가하지 않았습니다. 격리 n8n에서 IF 표현식 오류가 false로 끝난 경우를 재현하고, 선택 값의 존재·연산 타입을 앞선 Code 단계에서 검사하도록 수정했습니다. 정상 false·원본 타입·paired-item 연결은 유지합니다. 단일/단계별 실제 LangChain의 로컬 HTTP 전송과 집중 회귀 30건, 전체 OSS 1660/1661·기존 Ajv 특수 키 한 실패·skip/cancel 0을 확인했습니다. 고정 합성 데이터의 격리 n8n 7조건은 정상/차단 기대와 일치하며 실제 모델·업무 API 호출은 0회입니다. 제품의 공개 0.3.18 설치·기존 서버·Cloud와 아래 실제 topology는 바꾸지 않았습니다. 계층적 제품 통합·나머지 native·원문 다섯 예제의 독립 평가·승인 릴리스 등 전체 0~7 범위는 남습니다.',
    '',
    '소비자 진행 화면 보강(2026-10-27, 로컬 미배포): 기존 공개 0.3.18 함수로 실제 OAS 작업·검사된 native 설정·요청 준비 상태를 연결 전부터 표시합니다. 재료 단계는 포트·실행 간선·시작/종료 판정이 없고 연결 단계와 별도 표시 세션을 사용합니다. task에 먼저 저장한 이벤트의 동일 실행 재개·SSE 재생과 대기 상태 보존을 검사했습니다. 실제 제품 컴포넌트의 합성 검증에서 API 5개에서 native 포함 6개, 연결 0에서 3개·7개로 진행했고 새 탭의 콘솔 경고/오류는 없었습니다. 노드·간선을 같은 프레임에서 갱신하고 포트 변경 시 이전 측정값만 폐기한 뒤 공식 훅으로 다시 측정합니다. 실제 모델·업무 API·엔진·원문 다섯 예제의 성공 근거는 아니며 새 native 검토 자식이나 계층적 개요의 제품 적용도 아닙니다. 아래 OSS 예제 topology와 공개 설치·잠금 파일·기존 서버·Cloud는 유지합니다. 제품의 별도 등록 구조는 43노드·102경로이며 이 OSS 그림에 가상으로 합치지 않습니다.',
    '',
    '해당 소비자 경로의 최종 집중 35건·전체 verify 109파일/550테스트·정적 검사·빌드·16개 API 경로 생성이 통과했습니다. 원본 등록에서 두 저장소의 그래프를 재생성했고 OSS 그래프 회귀 5건을 확인했습니다. 초기 전체 실행의 기존 TCP/enum 검사 시간 초과와 기존 번들 크기 경고는 별도 한계로 남깁니다. 검증 전용 HTTP 서버의 종료 지연은 완료 확인 뒤 연결을 닫도록 자원 해제를 수정했고 제품 서버나 테스트 제한은 바꾸지 않았습니다.',
    '',
    '이번 작업(2026-10-27, 로컬 미배포): native 결손 검토·재선택을 예제의 독립 자식 그래프로 조합하고 두 생성 부모에 선택 옵션으로 연결했습니다. 추가 호출·재선택·기한을 명시적으로 제한하며 원래 선택·검토·반복 시도를 checkpoint에 보존합니다. 같은 제안에는 이전 검토를 재사용하고 실제 미지원·업무 판단은 우회하지 않습니다. 통신·observer 실패를 저장한 뒤 재개해도 모델을 다시 호출하지 않습니다. 아래 새 자식 그래프는 실제 등록에서 추출하며 Qoopilot 제품에 연결된 그래프로 표시하지 않습니다. 공개 0.3.18·기존 서버·Cloud와 다섯 원문 평가의 기존 결과는 유지합니다. 제품 SSE/UI·업무 HITL 라우팅과 원문 다섯 예제의 재생성·엔진 평가는 남습니다.',
    '',
    '현재 보강(2026-10-27, 로컬 미배포): native 선택의 결손을 실제 미지원·설정·API 단계·연결 단계·업무 판단으로 독립 검토하는 OSS 함수와 명시적 재선택 feedback을 추가했습니다. 코드는 기존 gap 전체·실제 참조·원문 인용·선택 원본과 상태를 검사하며 원래 결손을 지우거나 검토를 실행 승인으로 바꾸지 않습니다. 추가 호출/예산/checkpoint는 호스트 소유입니다. 보존된 실제 모델 실패 두 건의 검토에서는 API 책임 오분류를 구분했지만 실제 미지원과 미정 업무도 남았습니다. 두 건은 다섯 예제 전체 재생성이나 Qoopilot 통합 성공이 아닙니다. 공개 0.3.18·사용자 서버·Cloud와 실제 topology를 유지하며 새 자동 검토 노드를 이 그림에 가상으로 추가하지 않습니다.',
    '',
    '현재 작업(2026-10-27, 로컬 미배포): native JSON 출력의 원본 필드 선택을 공식 Edit Fields 표현식으로 연결했습니다. Core는 실제 생산자/포인터와 원본 타입을 검사하고 같은 schema 리소스를 필드마다 중복하지 않습니다. guard는 원본 계약과 선택 값의 실제 존재만 검사하며 여러 item을 합치거나 값을 보정하지 않습니다. 집중 56건과 격리 n8n 정상 2조건/차단 2조건·후속 로컬 요청 2건을 확인했습니다. 등록부는 16개·기본 계획 목록 15개입니다. 별도 실제 Chomsky 원문 다섯 예제 독립 비교는 단일 1/5·증분 0/5였고 9건이 연결 전 native 단계에서 중단됐습니다. 이 엔진 검사를 원문 예제의 성공으로 세지 않습니다. 파생 출력·분류·반복·계층적 제품 통합/SSE/UI·독립 품질 평가·승인 릴리스는 남습니다. 공개 0.3.18·lockfile·사용자 서버·Cloud는 유지합니다. 현재 topology의 노드·경로 수는 아래 실제 등록 그래프의 자동 집계를 따릅니다. 이전 보강 안내의 수치를 현재 집계로 사용하지 않습니다.',
    '',
    '제품 화면 선택 상태(2026-10-27, 로컬 미배포): 실제 Canvas 컴포넌트에서 삭제된 노드의 선택 ID가 남는 문제를 재현하고, 선택 정리를 카메라/크기 측정 효과에서 실제 노드 목록 변경으로 옮겼습니다. 삭제 시 해제·복원 시 미선택·연결 추가 시 유지·재삭제를 격리 브라우저로 확인했고 Qoopilot 집중 9건·전체 verify 107파일/536테스트가 통과했습니다. 수정 전후 ResizeObserver 경고의 원인·영향 추적은 남습니다. 합성 미리보기 검사이며 전체 SSE·실제 모델·원문 다섯 예제 품질 완료는 아닙니다. 공식 SDK 설정의 모델 스키마 추출도 일부 비공개 보조 함수가 필요해 연결 작업이 남습니다. 새 기능/내부 SDK 우회 없이 기존 공개 0.3.18·사용자 서버·Cloud와 아래 소비자 topology 29노드·67경로를 유지합니다.',
    '',
    '응답 필드 선택 계약(2026-10-27, 로컬 미배포): 공통 재료 캡처가 준비된 API 전용 계약을 결합하므로 단계별·일괄 native·전체 그래프 계획에서 실제 API ID와 그 OAS의 포인터 후보를 함께 제한합니다. 미래 native 출력은 미확정 상태로 남기고 결합 오류는 전파합니다. 두 LangChain 전송 경로의 잘못된 교차 참조 거절을 확인했으며 값·타입·이름 규칙·기존 SDK 컴파일러·15기능 등록부는 유지합니다. 고정 합성 OAS의 격리 n8n 정상 2조건·차단 2조건·로컬 요청 18건과 원본 예제 05 Ad OAS 6API의 배열 4개/문자열 2개 계약도 확인했습니다. 원문 다섯 예제의 생성·품질이나 Qoopilot 통합 완료는 아닙니다. 파생 출력·반복/분할/페이지·제품 SSE/UI·독립 평가·승인 릴리스는 남고 아래 실제 topology 29노드·67경로·공개 0.3.18·기존 서버·Cloud는 유지합니다.',
    '',
    '공식 설정 검사·SDK 생성(2026-10-26, 로컬 미배포): 정확한 공식 정의·명시적 생성 스키마 경로로 SDK 검사를 수행하고 통과한 실제 설정만 node()로 만듭니다. 비객체 준비 검사까지 true이면 로딩을 확인하지 못한 오류로 종료하며 실제 워크플로우에는 이 입력을 넣지 않습니다. 동기 범위 뒤 SDK 전역 경로를 복원하고 원본 값·타입·빈 객체를 유지합니다. 공식 여섯 설정의 6수용/6거절·로딩 미확인 거절 6건·생성 6건과 오류 설정 생성 거절을 확인했습니다. 같은 배포본의 격리 n8n에서 다섯 공식 정의·여섯 인스턴스로 배열 분리·Filter·수집·독립 분기·Merge를 실행해 최종 결과 2개를 확인했습니다. 고정 합성 데이터/설정이며 새 실제 모델·HTTP·업무 API 호출 0회입니다. 모델 설정 스키마·동적 포트·OAS 출력 계약·Qoopilot 서버/SSE/UI·원문 다섯 예제·승인 릴리스는 남습니다. 아래 소비자 topology 29노드·67경로와 공개 0.3.18·기존 서버·Cloud는 유지합니다.',
    '',
    '공식 설정 경로의 회귀: 새 경계 6건을 포함한 집중 37건, 전체 OSS 1594/1595·기존 Ajv 특수 키 한 건·skip/cancel 0입니다. 메타데이터 감사와 고정 데이터의 격리 실행은 별도 검증이며 원문 다섯 예제나 일반 정확도 향상의 근거로 세지 않습니다.',
    '',
    '공식 native 공통 선택 재료(2026-10-26, 로컬 미배포): n8n 공개 함수가 SDK 타입·버전 필터로 정확한 공식 정의 카탈로그를 만들고, 모델 출력은 실제 정의 ID만 선택합니다. 코드는 원본 정의를 조회하며 같은 정의의 여러 역할 선택과 원본/버전별 복사본을 보존합니다. 기본값을 실제 입력에 적용하거나 동적 포트·값 출력 계약을 추측하지 않습니다. 공식 여섯 노드의 설정 6수용/6거절과 로컬 HTTP 대역의 실제 LangChain/Zod 4 전송을 확인했습니다. 새 실제 모델·노드 실행·원문 다섯 예제 평가·Qoopilot 적용은 아닙니다. 기존 15기능 등록부와 아래 실제 topology 29노드·67경로는 유지하고 설정 생성·동적 포트/출력 계약·SSE/UI·독립 평가·승인 릴리스는 남습니다.',
    '',
    '공통 선택 경로의 최종 검사: 새 카탈로그/전송 10건을 포함한 집중 31건, 전체 OSS 1588/1589·기존 Ajv 특수 키 한 건·skip/cancel 0과 strict 타입·빌드·Lint·포맷을 확인했습니다. 명시적 512버전 목록은 잘라내지 않았고 선택 순서로 정의 ID를 바꾸지 않습니다. 설정 검사 12건은 별도 integration이며 실제 모델 품질·노드 실행·Qoopilot UI 결과가 아닙니다.',
    '',
    '공식 native 정의 재사용 검사(2026-10-26): 새 integration 실행기가 격리 n8n 2.37.10의 여섯 정확한 노드 버전 정의를 SDK 0.36.4의 공개 로더·버전 필터·설정 생성기에 전달했습니다. 정상 6건 수용·잘못된 설정 6건 거절을 확인했으며, 설정 스키마 미로딩에서 같은 오류 입력이 true로 반환되는 경로도 구분했습니다. Merge의 동적 입력 표현식과 현재 조회에서 얻지 못한 여섯 값 출력 계약은 자동 추측하지 않습니다. 공식 설정 재사용을 먼저 연결하고 OAS 참조·항목·출력 검사만 보강하는 작업이 남습니다. 기존 등록부·아래 실제 topology·공개 0.3.18·Qoopilot 서버/화면·Cloud는 변경하지 않았고 새 실제 모델/업무 API/노드 실행 검증도 아닙니다.',
    '',
    '공식 정의 검사 뒤 소스 회귀: 전체 OSS 1578/1579·기존 Ajv 특수 키 한 건·skip/cancel 0과 strict 타입·빌드·Lint·포맷을 확인했습니다. 설정 검사 12건은 integration의 별도 직접 실행 결과이며 단위 테스트 개수나 노드 실행 성공으로 합산하지 않습니다.',
    '',
    '업무 키 배열 대조(2026-10-26, 로컬 미배포): JoinApiResponseArraysByKey가 원본 OAS의 좌우 배열·키 경로와 명시적 결합/누락 정책을 받아 공식 SDK Merge 3.2를 구성합니다. 응답 reader는 원본 전체·연결을 검사하고 Merge가 타입을 구분한 키 비교·모든 중복 조합을 수행합니다. 기존 항목 이력 결합과 별개이며 자체 매칭·위치 결합·미작성 상태 추정은 없습니다. 고정 합성 계획의 격리 n8n 정상 8조건·차단 2조건·로컬 요청 20건, 두 원본 OAS의 두 API·정수 키 projection·SDK fragment를 확인했습니다. 실제 모델·업무 API 호출은 0회이고 원문 다섯 예제 전체 생성이나 Qoopilot 적용이 아닙니다. 아래 실제 소비자 topology 29노드·67경로는 유지합니다. 공개 0.3.18·기존 서버·화면·Cloud는 유지하며 다른 native·서버/SSE/UI·독립 평가·승인 릴리스는 남습니다.',
    '',
    '업무 키 대조의 소스 검증: 집중·기존 배열/항목 결합·등록부·소비자·그래프 85건, 전체 OSS 1578/1579·기존 Ajv 특수 키 한 건·skip/cancel 0, strict 타입·빌드·Lint·포맷을 확인했습니다. 공식 예제의 새 등록부는 기본 계획 14기능군·계획 정의 13개·무문맥 실행 구현 6개이며 실제 제품 설치 상태와 구분합니다.',
    '',
    '맵 항목 선택의 최종 직렬 검사: 집중·그래프 72건, 전체 OSS 1570/1571·기존 Ajv 특수 키 한 건·skip/cancel 0, strict 타입·빌드·Lint·포맷을 확인했습니다. 다음 절의 58건에 등록부·생산자 선택·소비자·그래프 회귀를 더한 검사이며 실제 모델 품질이나 Qoopilot 제품 통합을 뜻하지 않습니다.',
    '',
    '응답 맵 항목 선택(2026-10-26, 로컬 미배포): 새 SelectApiResponseMapEntry가 원래 OAS 객체에서 사용자가 정한 키의 값을 그대로 선택하며, 기존 SplitNativeOutputArray와 linked HTTP Request에 연결합니다. 그룹 키는 명시적 runtime 슬롯으로 받을 수 있지만 API ID·응답 경로는 고정합니다. Core가 실제 참조와 입력 소유권을 검사하고 전체 응답·키 존재 검사를 유지합니다. 집중 58건과 격리 n8n의 정상 3조건·차단 3조건·로컬 요청 9건을 확인했습니다. 실제 My/ICL 원본 OAS 두 개·세 API의 그룹 선택/분리·gdNo 바인딩 두 개도 계약 검사했습니다. 실제 모델 호출은 없으며 자연어 전체 생성이나 Qoopilot 통합 결과가 아닙니다. 이 기능은 native 재료이며 아래 대화 LangGraph의 topology를 늘리지 않습니다. 공개 0.3.18·기존 서버·화면·Cloud는 유지하고 다른 native·독립 다섯 예제 평가·제품 통합·승인 릴리스는 남습니다.',
    '',
    '후속 API 요청값의 개별 저장(2026-10-26, 로컬 미배포): 명시적 materialRecovery.argumentPlanning이 Core가 실제 바인딩·OAS에서 도출한 작업을 한 API씩 생성·저장합니다. generateMaterialArguments → publishMaterialArguments → 다음 호출 또는 finishMaterialArguments를 사용하며 계획 순서로 실행 엣지를 만들지 않습니다. 알림 실패에서는 완료한 모델·원인 callback을 반복하지 않고, 다음 API 전송 실패에서도 앞선 결과를 보존합니다. 최종 입력 정책은 생성 후 슬롯과 이전 승인 제안을 구분해 적용합니다. 고정 합성 5API의 검토·알림 실패 후 재개·공식 SDK·격리 n8n 두 실행·로컬 요청 10건을 확인했습니다. 실제 모델 호출 0회·대역/예약 7회이며 Qoopilot 서버·화면 적용이나 원문 다섯 예제의 독립 품질 평가가 아닙니다. 공개 0.3.18·설치·기존 서버·Cloud는 유지합니다. 임의 callback 내부의 작업까지 자동으로 개별 저장하거나 전송 오류를 숨겨 재시도하는 기능은 아닙니다.',
    '',
    '수용한 부분 계획의 자동 수정(2026-10-26, 로컬 미배포): 공개 OSS 수정 계획기가 현재 거절 연결·원본 요구·목표·실제 매핑을 함께 받아 수정 후보 또는 원인 단계 요청을 한 번 반환합니다. 소비자 예제의 reviseAcceptedPlan·reviewRevisedGoals·adoptRevision·publishRevision이 같은 예산·checkpoint에서 실행합니다. 실제 재료는 후보에 저장하고 Core 검사와 설정한 목표 검토 뒤에만 기존 수용본을 교체합니다. 원문을 누락한 후보·똑같은 거절 후보·입력 변경·전송 실패를 구분하며 기술적 HITL은 추가하지 않습니다. sourceEvents가 실제 최초 복구·native 추가·수정 순서를 Core 이력으로 재생하고 다른 세션/변조/순서 변경을 거절합니다. 집중 66건·strict 타입/빌드·Lint·포맷과 고정 합성 5API의 SDK/격리 n8n 두 실행·로컬 요청 10건을 확인했습니다. 실제 모델 호출 0회·대역/예약 9회이며 실제 모델 품질이나 원문 다섯 예제의 독립 생성 비교가 아닙니다. Qoopilot은 문서만 갱신했고 공개 0.3.18·서버·화면·Cloud는 유지합니다. callback 내부 여러 요청값 호출의 개별 저장, 제품 통합·native 보강·전체 평가·승인 릴리스는 남아 있습니다.',
    '',
    '개요 재계획의 이전 검사: 집중 71건·전체 OSS 1540/1541·기존 Ajv 특수 키 실패 한 건·skip/cancel 0, 빌드·strict 타입·Lint·포맷과 실제 그래프 회귀 4건을 확인했습니다. 공통 거절 처리는 로컬 미배포이며 실제 Chomsky 품질·Qoopilot 전체 서버/화면 검증은 아닙니다.',
    '',
    '개요 거절·예산 내 재계획(2026-10-26, 로컬 미배포): OSS는 동일한 원본·세션·revision·목표·이전 개요의 실패 출력과 검사 사유만 다음 한 번 호출에 전달합니다. 전송·취소·입력 변경·비JSON 결과는 재계획하지 않습니다. 소비자 예제는 거절 이력을 저장하고 공유 호출·거절·시간 예산으로 planOutline → reserveModelCall 경로를 실행합니다. 성공 결과의 알림 재개는 모델을 반복하지 않습니다. 집중 71건과 고정 합성 5API의 최초 목표/개요 거절·원인 복구·세 연결 revision·SDK·격리 n8n 두 실행·로컬 요청 10건이 통과했습니다. 실제 모델 호출은 0회, 대역/예약은 11회입니다. 개요 사용 checkpoint에 새 거절 이력이 없으면 자동 변환하지 않습니다. Qoopilot은 문서만 갱신했으며 공개 0.3.18·실제 서버·화면·Cloud는 유지합니다. 모든 수용 계획·원인 수정 통합·native 확장·원문 다섯 예제 독립 평가·승인 릴리스는 남아 있습니다.',
    '',
    '전역 개요·작업 묶음(2026-10-26, 로컬 미배포): OSS의 한 번 호출 함수가 원문 전체·확정 목표·실제 재료에서 업무 개요와 작업 묶음을 제안합니다. Core가 전체 실제 참조·구조 ID·원본을 검사하고 현재 진행·필수 생산자·경계 연결을 도출합니다. 연결 단계는 전역 맥락을 유지하며 묶음 주변만 수정하고 기존 전체 그래프 검사를 그대로 거칩니다. 묶음 순서를 실행 순서로 사용하지 않습니다. 아래 소비자 예제에 planOutline·publishOutline 두 실제 노드를 추가했습니다. 명시적 model·selectBundle 정책과 공유 예산·checkpoint·알림 재개는 소비자 소유이며 API별 HITL은 추가하지 않았습니다. 최종 집중 64건·전체 OSS 1533/1534·기존 Ajv 한 건·skip/cancel 0과 고정 합성 5API의 한 개요·세 연결 revision·공식 SDK·격리 n8n 두 실행·로컬 요청 10건을 확인했습니다. 실제 모델 호출은 0회, 대역/예약은 10회입니다. 참조 포함 검사는 업무 의미 증명이 아니며 개요 거절 재계획·모든 원인 수정 조합·Qoopilot SSE/UI·native 확장·원문 다섯 예제 독립 평가·별도 승인 릴리스가 남아 있습니다. 공개 0.3.18·회사 서버·Cloud는 유지합니다.',
    '',
    '원인 단계 후보와 후속 작업(2026-10-26, 로컬 미배포): OAS의 실제 입력 소유권으로 primary API 복구 후보를 도출합니다. 입력이 없는 API의 바인딩 단계와 모든 입력이 바인딩된 API의 독립 값 생성 단계는 모델 출력 스키마·Core에서 제외합니다. 실제 바인딩 변경 뒤 새 리터럴 입력이 생긴 경우에만 describeWorkflowConnectionMaterialRepairWork가 후속 작업을 도출합니다. 생산자·선언 순서만 바뀌면 불필요한 값 호출을 추가하지 않습니다. 소비자 callback이 같은 예약 모델·취소 신호로 값을 생성하고 typed work submission을 저장하며, Core가 원본 작업·바인딩·media type·native·무관 API 보존과 workSource receipt를 재검사합니다. 알림 실패 뒤 모델을 반복하지 않고 재개합니다. 집중 54건·전체 1523/1524·기존 Ajv 한 건·skip/cancel 0과 고정 합성 5API의 요청값 단계/SDK/격리 n8n 두 실행·로컬 요청 10건이 통과했습니다. 실제 모델 호출은 0회, 대역/예약은 7회입니다. 아래 실제 topology는 그대로이며 추가 호출은 기존 replanOriginMaterial callback 안입니다. native 단계의 실행 가능성·여러 후속 호출의 개별 checkpoint·전역 개요/묶음·Qoopilot/SSE/UI·원문 다섯 예제 전체 평가·승인 릴리스는 남았습니다. 공개 0.3.18·회사 서버·Cloud는 유지합니다.',
    '',
    '입력 정책의 명시적 전달(2026-10-26, 로컬 미배포): OSS Core에 미채택 복구 결과의 OAS 입력 슬롯·유지/폐기할 승인·미승인 슬롯을 조회하는 inspectWorkflowConnectionMaterialRepairInputs를 추가했습니다. 호스트가 replacement.deferredApiInputIds를 명시한 경우에만 새 실행 입력을 허용하며 다른 API의 승인·원래 값·요구·OAS는 바꾸지 않습니다. 저장한 receipt도 같은 조건으로 재검사합니다. 선택적 requestedInputs의 생략과 빈 목록만 달라진 결과는 진전으로 세지 않습니다. 고정 합성 5API에서 별도 검토 거절→호스트 callback의 슬롯 조회/정책→원자 적용→목표/연결→공식 SDK 템플릿→격리 n8n 두 실행·로컬 요청 10건을 확인했습니다. 원본 응답·상세 응답·독립 실행 입력의 ID는 모두 다릅니다. 새 모델 호출이나 원문 다섯 예제 평가가 아니며 Qoopilot 공개 0.3.18·실제 서버·화면은 유지합니다. 아래 소비자 그래프의 topology는 그대로이고 조회는 기존 callback 내부의 공개 함수 호출입니다. 실제 단계 선택 가능 여부·바인딩 후 요청값 재계획 조합·전역 개요/묶음·native·호스트/SSE/UI 통합·전체 평가·승인 릴리스는 남아 있습니다.',
    '',
    '입력 정책 검사: 전체 OSS 1517/1518·기존 Ajv 특수 키 한 건·skip/cancel 0을 확인했습니다. 실제 입력값을 넣기 전 템플릿은 requestInputsReady=false이며 임의 값을 만들어 성공시키지 않습니다. 명시적 정책 없는 새 슬롯·중복/없는/사라진 ID·무관 API 승인 제거·receipt 변조는 거절합니다. 과거 실제 모델의 입력 미정 실패와 중간 네트워크/검토 실패는 원본으로 보존하며 새 고정 회귀로 덮어쓰지 않습니다.',
    '',
    '초기 요구 검토(이전 확인, 2026-10-26): OSS에 원문 전체·후보 목표·실제 매핑을 별도로 비교하는 한 번의 모델 함수와 요구별 판단·원문 인용·목표/정책 ID·source receipt 검사를 추가했습니다. 초기 검토 입력은 실행 그래프와 타입부터 분리하며 아직 없는 엣지를 결손으로 판정하지 않습니다. 기존 보호 연결 유지는 실제 코드 정책으로 제공하고 의미 판단 자체는 모델 근거로 남깁니다. 소비자 예제의 선택적 reviewInitialGoals 노드가 공유 예산·저장·원인 단계 복귀를 조합하며 사용자 HITL은 아닙니다. 당시 집중 74건과 검토 거절/수용 후 SDK·고정 합성 5API의 격리 엔진 두 실행·로컬 요청 10건을 확인했습니다. 실제 모델은 이전 잘못된 제안을 거절했고, 과거 엣지 부재로 오판한 정상 목표·매핑의 단일 검토는 새 범위에서 9.222초에 covered로 수용했습니다. 당시 전체 자동 복구는 바인딩 제거 후 새 필수 입력이 미정인 상태를 적용하려다 차단됐으며 엔진을 실행하지 않았습니다. 중간 하니스 오류·ECONNRESET·범위 수정 전 거절 예산 종료도 보존했습니다. 새 입력 정책 회귀와 별개인 실제 모델 원본 결과입니다.',
    '',
    '초기 검토의 최종 소스 검사: 전체 OSS 1512/1513·기존 Ajv 특수 키 한 건·skip/cancel 0, 빌드·strict 타입·Lint·포맷·그래프 회귀 4건을 확인했습니다. 모델을 다시 호출하지 않고 등록된 그래프를 재생성했습니다. 검토 근거의 동시 변경은 출력 형식 오류와 겹쳐도 입력 변경으로 종료하며 원래 두 오류를 보존합니다. Qoopilot 전체 yarn verify·새 브라우저·공개 설치·보안 감사는 이번에 수행하지 않았습니다.',
    '',
    '초기 충돌의 원인 단계 복귀(2026-10-26, 로컬 미배포): 수용된 세션이 없을 때도 OSS가 한 번의 재검토로 목표 수정 또는 실제 API/native 원인 단계 요청을 구분합니다. core는 OAS·요구·역할·변경 대상·필드 소유권과 재료 receipt를 검사합니다. 아래 소비자 예제에는 요청·원인 호출·적용·진행 발행 네 노드를 추가했고 공유 호출 예약·취소·checkpoint를 소유합니다. 최종 집중 52건·전체 1498/1499·기존 Ajv 1건·정적 검사·빌드와 고정 합성 5API의 격리 n8n 두 실행·로컬 요청 10건을 확인했습니다. 실제 Chomsky의 별도 검사는 최초 거절 목표만 고정한 뒤 모델이 독립 조회 요구를 제거하고 잘못된 바인딩을 유지해 품질 실패로 보존했으며 엔진은 실행하지 않았습니다. 구조상 완성과 요구 충족은 다릅니다. Qoopilot 공개 0.3.18·실제 서버·화면에는 미적용이며 전역 개요·작업 묶음·요구 누락 검토·native 확장·원문 다섯 예제 평가와 별도 승인 릴리스가 남습니다.',
    '',
    '수정 거절 피드백·이어가기(2026-10-26, 로컬 미배포): OSS가 새 계약으로 현재 그래프를 검사하고, 두 원본·세션 이력에 결합한 원본 제안·경로 위반·목표 충돌의 피드백을 제공합니다. 전송·취소·입력 변경은 재계획 피드백으로 바꾸지 않습니다. 집중 30건·전체 1476/1477·기존 Ajv 1건·정적 검사·빌드를 확인했습니다. 보존한 실패 제안을 재현해 전달한 실제 수정 후보는 구조상 정상이나 업무 의미 평가 한 개가 남았고, 기존 자동 연결 예제가 누적 호출·시작 시각을 유지한 한 번의 추가 모델 호출로 완료했습니다. 최종 단일 자동 흐름은 모델 200 두 번·22.243초이며 격리 n8n 두 실행·로컬 요청 10건에서 서로 다른 원본/상세 ID의 출처·값·타입을 확인했습니다. 완료 콜백 실패 뒤 저장된 결과만 재개하는 회귀도 포함합니다. 아래 topology와 Qoopilot 공개 0.3.18 설치는 그대로이며 이 조합의 호스트·SSE·화면 적용, 전역 개요·작업 묶음·native 확장·원문 다섯 예제 평가는 남아 있습니다. 합성 재료 검사를 전체 생성 품질 합격으로 표시하지 않습니다.',
    '',
    '수용 계획의 수정 기반(2026-10-26, 로컬 미배포): OSS가 원래 세션·요구·OAS·권한을 보존하고 실제 재계획 재료와 목표·연결 변경을 새 후보로 검사합니다. 모델은 연결 수정 또는 실제 API/native 원인 단계의 재계획 요청을 구분하며, 코드가 전후 매핑·관련 계약·영향 범위·평가 무효화·출처 receipt를 제공합니다. 같은 타입의 대상 교체·출력 변경 소비자·과거 제거된 editable 엣지·후보 ID 변조·배열 순서 무진전을 포함한 집중 19건·전체 1465/1466·기존 Ajv 1건과 정적 검사·빌드를 확인했습니다. 서로 다른 원본/상세 응답 ID를 사용한 고정 기준·수정 후보의 격리 n8n 4회·로컬 요청 20건은 통과했습니다. 실제 모델의 두 detail 시도는 HTTP 200 뒤 계약 검사에서 거절됐고 엔진 실행은 없습니다. 후속 진단에서는 필수 상세 응답을 건너뛰는 직접 경로가 함께 제안됐으며 원본을 보존하고 엣지를 임의 삭제하지 않았습니다. 새 독립 함수이며 아래 실제 LangGraph topology와 Qoopilot 공개 0.3.18 설치는 바꾸지 않았습니다. 원본 거절 피드백·전역 개요·묶음 스케줄·원인 단계 자동 호출·공유 예산·SSE·화면 통합과 다섯 예제 평가는 남아 있습니다. 실제 모델 품질 개선으로 표시하지 않습니다.',
    '',
    '책임 분리(2026-10-26, 로컬 미배포): OSS는 한 번의 요청값 생성·OAS 검사·거절 피드백·취소 전달을 담당합니다. 공식 examples의 선택적 자식 그래프가 시도·거절·시간 예산과 checkpoint·진행 콜백을 조합합니다. 집중 33건·전체 OSS 1446/1447·기존 Ajv 1건, 빌드·타입·Lint·포맷과 호스트 107개 파일·535개 테스트·운영 빌드·16개 API 경로를 확인했습니다. 기존 다중 바인딩 API의 원래 취소 사유 반환 계약도 유지합니다. Qoopilot의 설치본은 공개 0.3.18이며 이 새 자동 루프를 적용하지 않았습니다. 아래 실제 자식 topology는 소비자 조합 예시이지 회사 호스트의 적용 증거가 아닙니다. 새 실제 모델·n8n·브라우저 검사는 없으며 계층적 개요·영향 재계획·native 확장·원문 다섯 예제의 독립 품질 평가는 남아 있습니다.',
    '',
    '명시적 재개·거절 피드백(2026-10-26, 로컬 미배포): Qoopilot은 실제 실패 checkpoint가 API 요청값 단계인 경우에만 같은 저장 지점을 재개하며 공개 SDK·HTTP의 API 5개 검사에서 선정·형식·native·바인딩을 반복하지 않았습니다. stale 지점과 조회 실패는 원인 보존 후 중단하고 최종 검토도 유지합니다. 전체 호스트 107개 파일·535개 테스트·정적 검사·빌드·16개 API 경로가 통과했습니다. OSS는 동일 원문의 거절 제안·근거를 별도 입력으로 받는 계약을 추가했고 전체 1429/1430·기존 Ajv 1건·집중 7건을 확인했습니다. 보존한 예제 05 제안에서 피드백을 만든 뒤 해당 API 한 건의 실제 기본 모델 200 한 번으로 입력 확인 1개에 도달했습니다. 전체 예제·자동 호스트 루프·n8n·새 브라우저 성공은 아닙니다. 자동 재계획의 공개 계약 적용·예산·취소와 계층적 개요·native 확장·다섯 예제 평가는 남아 있습니다. 아래 topology·공개 0.3.18 설치·기존 서버·Cloud는 유지합니다.',
    '',
    '호스트 API task 보존(2026-10-26, 로컬 미배포): Qoopilot의 값 생성은 공식 LangGraph task로 완료 결과를 저장하고 같은 checkpoint 재개 시 실패한 호출부터 실행합니다. 원문·OAS·역할·바인딩 변경에는 재사용을 거절하고 현재 OAS 검사도 유지합니다. API마다 독립 checkpoint나 새 노드를 만들지는 않습니다. 집중 7건·전체 호스트 107개 파일·529개 테스트·정적 검사·빌드·16개 API 경로 생성이 통과했습니다. 같은 API 128개 역할 보존과 취소 시 후속 호출 금지도 확인했습니다. 검사 breakpoint 충돌은 다음 노드 앞에서 멈추도록 수정했으며 SDK patch나 빈 결과 fallback은 없습니다. 오류 근거 기반 자동 재계획·실제 사용자 재계획 명령 연결·다섯 예제 평가는 남았습니다. 아래 topology·공개 0.3.18·사용자 서버·Cloud는 유지합니다.',
    '',
    '입력 미정 계약(2026-10-26, 로컬 미배포): OSS의 추적 출력은 not-provided와 provided를 구분하며 실제 빈 값·OAS 타입·출처 검사를 유지합니다. 다른 LangChain 사본의 파싱 실패도 공식 오류 코드로 진단합니다. 최종 반환 계약은 같지만 모델 전송·공개 출력 타입은 달라 향후 호환성 안내가 필요합니다. 집중 17건·빌드·Lint·포맷·타입, 전체 1422/1423·기존 Ajv 1건을 확인했습니다. 원본 예제 05의 실제 값 생성은 첫 두 API 뒤 세 번째 출력 형식 오류로 중단했고 HTTP 200을 성공으로 세지 않았습니다. 합성 결정 6개만 별도 부모 그래프 입력 질문에 도달했습니다. Qoopilot의 API별 checkpoint·원인 단계 자동 재계획은 아직 남았습니다. topology·공개 0.3.18 설치·사용자 서버·Cloud는 유지합니다.',
    '',
    '호스트 native 단계 분리(2026-10-26, 로컬 미배포): Qoopilot이 공개 OSS 0.3.18의 역할 선택·생산자 선택·설정 생성 함수를 단계별 checkpoint로 조합합니다. 실제 준비된 생산자를 먼저 구성하고, 미정 설정은 원래 질문·답변을 보존해 같은 작업만 재개합니다. 전체 호스트 106개 파일·522개 테스트·정적 검사·빌드, 실제 입력 컴포넌트의 격리 브라우저 제출을 확인했습니다. 원본 API 10개 checkpoint의 실제 모델 native 세 단계는 기본 모델 429 후 기존 대체 모델에서 완료했으며 다섯 예제의 독립 전체 생성·서비스별 결과 의미·n8n 실행 평가는 아닙니다. 검증 전후 호스트 파일 974개 지문이 같습니다. 아래 OSS 참고 그래프 topology·공개 패키지·사용자 서버·Cloud는 바꾸지 않았습니다. API 입력 미정·계층적 원인 단계 재계획·native 확장·다섯 예제 평가는 남아 있습니다.',
    '',
    'native 참조 계약 보강(2026-10-26, 미배포): 실제 API ID·OAS 배열 경로에서 설정 후보를 도출하고 동적 경계는 원본 OAS로 검사합니다. 코드가 값 집합이 비었음을 증명한 설정 대안은 모델 출력에서 제외하며 유효한 빈 배열은 유지합니다. oneOf·not·lookaround 전송 거절을 보존한 뒤, 최종 실제 세 검사는 429 후 기존 라우팅의 대체 모델에서 완료됐습니다. Qoopilot의 registry 재료 누락과 template의 옛 material 계약 사용도 수정했습니다. OSS 회귀 1410/1411·기존 Ajv 1건, Qoopilot 517건·빌드, 격리 n8n 정상·차단 22조건·로컬 요청 103건을 확인했습니다. 검증 전후 파일 3200개의 해시는 같습니다. 일괄 native 호출의 선택·생산자·설정 단계 이관, 미정 입력·계층적 재계획·원문 다섯 예제 재평가는 아직 남았습니다. topology·공개 패키지 버전·Cloud는 바꾸지 않았습니다.',
    '',
    '공통 제약 검사 진행(2026-10-26, 미배포): OSS core가 선택된 참조·native 선행 조건·보호된 연결과 모델 목표의 순환·독립성 모순을 출처와 함께 검사합니다. 입력 포트별 참조를 전체 실행 순서로 확대하지 않으며 기존 분기·합류·완료 검사를 유지합니다. LangChain은 조건·거절 근거를 전달하고 반복·예산·취소는 호스트가 담당합니다. 집중 회귀 71건·전체 1395/1396·기존 Ajv 특수 키 1건, 원래 예제 04 목표의 무변경 오프라인 호스트 재생, 일반화한 고정 재료의 격리 n8n 네 실행·로컬 요청 20건을 확인했습니다. 목표 6개의 모순은 연결 호출 전에 거절됩니다. 새 실제 모델·원문 다섯 예제 전체 품질·브라우저 검증은 아니며, 수용된 목표 수정·바인딩 단계 복귀·영향 재검사·native/입력 미정은 남아 있습니다. 실제 그래프 topology·공개 0.3.18 설치·기존 서버·Cloud는 바꾸지 않았습니다.',
    '',
    '미배포 수정(2026-10-26): 원문 위치 ID 전체를 enum으로 열거하지 않고 형식은 출력 스키마, 실제 출처·순서·타입 검사는 코드가 담당하도록 분리했습니다. 증분 모델은 엣지만 선택하고 시작·종료 경계는 실제 계약과 엣지에서 계산합니다. 전체 회귀는 1385/1386이며 기존 Ajv 특수 키 1건만 남았습니다. 격리 n8n의 고정 재료·native 자동 추가는 각각 기준 계획 포함 4회·로컬 요청 20건을 통과했습니다. VPN 복구 후 실제 다섯 예제 중 운영 점검은 단일·증분 JSON을 만들었으나 예시 값을 확정 입력으로 해석해 업무 품질 합격으로 세지 않습니다. 이전 필터 재료를 그대로 사용한 별도 실제 연결 계획은 완성됐고 격리 엔진에서 정상 두 조건·비교 불일치·OAS 위반의 네 조건을 확인했습니다. 새 전체 생성의 native 결손·단계 책임 오인·출처 없는 요청값 제안과 페이지 반복·동적 그룹 선택·범위 분할·비교표 기능은 남아 있습니다. 구조는 변경하지 않았고 새 버전 배포·Qoopilot 공개 의존성·기존 서버도 변경하지 않았습니다.',
    '',
    '후속 확인(2026-10-26): 공개 0.3.18의 같은 GET API 64개 재료 비교는 단일·증분 각 3/3이며 증분의 속도·정확도 우위는 미입증입니다. 별도 복합 DAG의 두 실제 모델 계획은 격리 n8n 8회·로컬 호출 40건을 통과했고, 원본 OAS 화면 승인본에 명시적 로컬 입력·주소를 공급한 사본 두 번도 원본 요청·응답·수집을 보존했습니다. 후속 호스트 검사에서는 started 뒤 running 이벤트도 보내 공식 SDK 관찰자의 실행 중 표시와 취소 종료를 맞췄습니다. SDK·SSE·재접속 집중 14건과 호스트 전체 104개 파일·516개 테스트·정적 검사·빌드·16개 API 경로 생성이 통과했습니다. 이 수정은 대화 그래프의 노드·경로를 바꾸지 않으며 HTTP/1.1 다중 탭 포화·완료 구독 수명이나 넓은 질의 timeout을 해결했다는 뜻은 아닙니다. SDK·공개 패키지 버전·Cloud·기존 서버를 변경하지 않았고 새 게시도 없습니다.',
    '',
    '현재 확인(2026-10-26, 0.3.18): 소스 3b66261·동일 태그·세 npm 공개 버전과 다운로드 무결성·게시된 GitHub Release·호스트 공개 설치를 확인했습니다. 모델은 독립 입력·제공 출처·요청 출처 없음·부분 결손 중 하나를 고르고 코드는 고정 필드를 구성합니다. 모순 출력은 보정하지 않으며 실제 결손과 원본 계약을 유지합니다. 초안 oneOf의 HTTP 400은 anyOf를 생성하는 Zod union으로 수정했습니다. 집중 14건·동일 실패 입력의 실제 모델 3회·원본 OAS 56건·격리 실행 3개 묶음·독립 설치가 통과했습니다. 단위 1378/1379·기존 Ajv 1건·동일 High 5는 남았습니다. 공개 0.3.17의 단일·증분 비교는 각 3/3이며 별도 전체 화면 실패도 보존합니다. 공개 0.3.18의 새 전체 화면 세 대화는 API 5개·수집 1개·SDK JSON까지 완료했습니다. 실제 DOM에서 연결 0→5개와 사용자 zoom 유지를 확인했고 불필요한 행 재정렬을 보완한 후 같은 깊이의 API 다섯 개 위치도 유지했습니다. 호스트 전체 103개 파일·515개 테스트·정적 검사·빌드가 통과했습니다. 입력 슬롯·환경이 미완료라 시작은 차단됐으며 업무 API 실행 성공은 아닙니다. n8n 명령의 EOTP와 공개 파일 확인 결과를 구분했습니다. 넓은 구체화 timeout·대규모 의미 품질·다중 탭 접수 지연 원인은 남았습니다. 고정 QA 기본값·기존 서버를 유지하며 회사 push·Cloud 배포는 하지 않았습니다.',
    '',
    '현재 추가 작업(2026-10-26): 소스 ab65fb8·같은 v0.3.17 태그·세 npm 공개 다운로드 무결성·GitHub Release와 호스트 로컬 설치를 확인했습니다. 초기 목표의 형식·계약 거절은 원문·사유를 보존해 명시적 예산 안에서 재계획하며 자료 변경·전송·취소는 반복하지 않습니다. 구체화는 전체 API의 식별자·설명과 native 기능 설명을 받고 선택 후 원본 입출력 계약을 사용합니다. 명시적으로 잘못된 목표 1건을 주입한 후보 검사는 실제 모델 두 호출과 격리 n8n 4회·로컬 요청 20건을 통과했습니다. 원본 OAS 56건·실행 21개 묶음·독립 설치를 확인했고 단위 1374/1375·기존 Ajv 1건과 동일한 보안 High 5로 자동 게이트는 차단 상태입니다. 첫 소비자 입력 조합 실패와 올바른 조합의 후속 통과를 함께 보존했습니다. 공개 0.3.17을 설치한 호스트는 초기 목표 재계획·공유 거절 예산·전송 미재시도와 부모·SSE 집중 17건, 전체 103개 파일·512개 테스트·타입·lint·포맷·빌드를 통과했습니다. 새 회귀는 실제 모델·브라우저·업무 실행 검사가 아닙니다. 같은 176개 후보의 짧은 질의 구체화는 25.071초에 완료했지만 넓은 원래 질의는 여전히 60초 timeout입니다. 정확도·속도 개선은 주장하지 않습니다. 최신 회사 master의 고정 QA와 명시적 모드·기존 서버를 유지했으며 회사 push·Cloud 배포는 하지 않았습니다. 대규모 품질 재평가와 중간 화면 렌더 계측은 남았습니다.',
    '',
    '현재 작업(2026-10-25): 소스 b741f3d와 같은 태그, 세 npm 0.3.16·공개 다운로드 무결성·GitHub Release를 확인했습니다. 자동 연결 예시의 실모델 6회·거절 0회, native 1개·세 연결 묶음, 격리 n8n 4회·20건 로컬 요청 결과와 앞선 실패를 보존합니다. 릴리스 후보는 타입·lint·포맷·원본 OAS 56건·엔진/런타임 21개 묶음·독립 설치를 통과했습니다. 단위 1365/1366·기존 Ajv 1건과 보안 High 5를 유지하며 자동 게이트는 차단 상태입니다. 호스트는 공개 0.3.16을 설치하고 자동 계획·native 추가·업무 질문 checkpoint·SSE journal을 연결했습니다. 실제 모델과 브라우저의 짧은 질의는 API 5개·응답 수집 native·SDK JSON 생성과 복원을 완료했고 연결 프레임 0→5→5개를 기록했습니다. 같은 재료의 실제 모델 비교는 단일 호출 3/3·증분 2/3이며 증분 목표 검사 실패 1건의 세부 원인은 미확인입니다. 넓은 질의는 구체화에서 시간 초과했습니다. 호스트의 취소 전달 결함 수정 후 실제 60초 전송 종료를 확인했지만 구체화 지연은 해결하지 않았습니다. 전체 호스트 103개 파일·508개 테스트·타입·lint·포맷·빌드는 통과했습니다. 대규모 품질·계획 중 실제 렌더 계측은 남았고 정확도·속도 개선을 주장하지 않습니다. 기존 서버·의도한 JSON 시나리오를 유지했으며 회사 push·Cloud 배포는 하지 않았습니다.',
    '',
    '공개 0.3.12의 세 턴 승인·네 번째 기술 질문과 실패 기록은 보존했습니다. 새 공개 0.3.13의 원본 OAS 두 개·네 턴 화면 대화에서는 API 다섯 개 → 결과 묶기 → 숫자 0 검사 다섯 개의 SDK JSON을 생성했습니다. 기존 API 요청값·OAS 계약·비교 조건은 유지했지만 집계 필드 이름과 응답 선택 범위가 바뀌어 출력 형태 보존은 통과로 세지 않습니다. 모델 HTTP 200과 의미 정확도는 구분합니다. 대기 여섯 지점의 승인 JSON 보존, 다운로드 일치와 새로고침 복원을 확인했으며 자동 재시도·업무 API·이 화면 결과의 n8n 엔진 실행은 없습니다. 한 대화의 관측 결과이며 넓은 품질·동적 대상·장기 스트리밍 검증은 미완료입니다. 기존 Ajv 실패·큰 JS 번들도 남습니다. 이 도식은 30개 노드·68개 경로의 참고 LangGraph이며 Qoopilot 실행 로그나 생성된 n8n 그래프와는 다릅니다.',
    '',
    '## 단계 요약',
    '',
    '같은 책임의 노드를 묶었습니다. 화살표는 실제 등록 경로를 그룹 단위로 합친 것이며, 그룹 내부 경로는 아래 전체 그래프에 있습니다. 점선은 조건에 따라 선택하는 경로입니다. API·native 작업은 준비 상태에 따라 배정하며 둘 다 항상 필요한 것은 아닙니다.',
    '',
    '```mermaid',
    graph.overview,
    '```',
    '',
    '## 전체 등록 경로',
    '',
    `실제 노드 ${graph.nodes.length}개(시작·종료 포함), 등록 경로 ${graph.edges.length}개.`,
    '',
    '```mermaid',
    graph.detail,
    '```',
    '',
    '## 자동 연결 참고 자식 그래프 — 호스트 통합 검사 진행',
    '',
    `실제 컴파일한 독립 예시의 노드 ${incremental.nodes.length}개(시작·종료 포함), 경로 ${incremental.edges.length}개입니다. 위 대화 그래프에 연결된 경로나 Qoopilot의 실제 전체 구조가 아닙니다. 기술적 제안 거절은 예산 내에서 자동 반복하지만 전송 오류는 자동 재시도하지 않습니다. nativeAugmentation을 명시하면 선택된 native의 설정·검증·추가 후 같은 세션을 이어갑니다. 옵션을 생략하면 native 요청을 부모로 반환하며 실제 업무 질문과 구분합니다. 과거 호스트의 실제 모델·SSE·최종 화면 검사는 당시 구현의 결과입니다. 이 미배포 개요·수정·개별 값 저장 노드가 제품 서버/화면에 연결됐다는 증거는 아니며 새 제품 통합·중간 프레임 렌더·원문 다섯 예제 품질 검사는 남아 있습니다.`,
    '',
    '```mermaid',
    incremental.detail,
    '```',
    '',
    '## 요청값 자동 재계획 참고 자식 그래프',
    '',
    `실제 노드 ${argumentsGraph.nodes.length}개(시작·종료 포함), 경로 ${argumentsGraph.edges.length}개입니다. argumentPlanning 옵션을 명시한 예제의 scenario 입력 생성 단계에서만 사용합니다. 생략하면 기존 한 번 호출을 유지합니다. maxAttempts는 생성 함수 시도 수이며 enum 추가 단계나 provider HTTP 호출 수와 다릅니다. 전송·인증·timeout·enum 단계 실패는 리터럴 피드백으로 재시도하지 않습니다. 입력 미정은 유효한 결과이며 사용자 질문·검토는 부모의 책임입니다. 기술 실패는 예외로 끝나고 저장된 실패 노드에서 재개할 수 있습니다.`,
    '',
    '```mermaid',
    argumentsGraph.detail,
    '```',
    '',
    '## native 선택 자동 재계획 참고 자식 그래프',
    '',
    `실제 노드 ${nativeSelection.nodes.length}개(시작·종료 포함), 경로 ${nativeSelection.edges.length}개입니다. staged native 계획의 selectionReview 옵션을 명시한 두 예제 부모에서 사용하며 부모 checkpointer를 상속합니다. 생략하면 기존 한 번 선택을 유지합니다. maxModelInvocations는 선택·검토·재선택의 논리 호출 예약 수이고 provider의 HTTP 시도 수가 아닙니다. genuine 미지원·업무 판단은 별도 결과로 반환하고 예제 부모는 typed 오류와 원래 검토를 보존해 중단합니다. 아직 제품 업무 질문 UI에 연결된 것은 아닙니다. 통신 실패의 원본 예외는 이 그래프 런타임의 비공개 저장소에만 남으므로 같은 런타임에서만 원본 오류를 다시 던집니다. 런타임을 새로 만들었다면 원본 오류 부재로 실패하며 모델 재실행으로 복구하지 않습니다.`,
    '',
    '```mermaid',
    nativeSelection.detail,
    '```',
    '',
    '## 갱신',
    '',
    '`npm run graph:update`가 현재 소스를 빌드하고 실제 `createWorkflowDraftConversationGraph().getGraphAsync()`에서 이 문서를 다시 만듭니다. 모델·실서비스는 호출하지 않습니다. 이후 작업을 마칠 때 구조·현재 보강 안내를 갱신합니다. 상시 실행하는 감시 프로세스는 없습니다.',
    '',
    '일반 회귀 검사에서도 현재 구조와 이 문서가 일치하는지 확인합니다. 새 노드에 한글 설명이 없거나 문서가 오래되면 실패합니다. 진행 상태 설명은 확인한 결과에 맞춰 갱신하며 노드 존재를 기능 완료로 표시하지 않습니다.',
    '',
    '[실제 그래프 등록 코드](../examples/langgraph-workflow/src/graph/create-workflow-draft-conversation-graph.ts) · [현재 구현·검증 기록](conversational-oss-implementation.md)',
    '',
    `구조 지문: \`${graph.digest}\``,
    '',
  ].join('\n');
}

async function main() {
  const document = await buildConversationGraphDocument();
  if (process.argv.includes('--check')) {
    assert.equal(
      await readFile(conversationGraphDocument, 'utf8'),
      document,
      'Conversation graph is stale; run npm run graph:update',
    );
    console.log('Conversation graph matches current source');
  } else {
    await writeFile(conversationGraphDocument, document, 'utf8');
    console.log(`Updated ${conversationGraphDocument.pathname}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();

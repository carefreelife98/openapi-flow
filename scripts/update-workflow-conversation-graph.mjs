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

export async function buildConversationGraphDocument() {
  const graph = await describeConversationGraph();
  const incremental = await describeIncrementalConnectionGraph();
  return [
    '# 현재 대화형 워크플로우 설계 그래프',
    '',
    '이 그래프는 사용자의 대화로 n8n 워크플로우를 만드는 LangGraph입니다. 최종 결과물인 n8n 실행 그래프와는 다릅니다. 구조도이며, 실제 실행 로그나 모든 기능의 검증 완료를 뜻하지 않습니다.',
    '',
    '현재 작업(2026-10-25): 소스 b741f3d와 같은 태그, 세 npm 0.3.16·공개 다운로드 무결성·GitHub Release를 확인했습니다. 자동 연결 예시의 실모델 6회·거절 0회, native 1개·세 연결 묶음, 격리 n8n 4회·20건 로컬 요청 결과와 앞선 실패를 보존합니다. 릴리스 후보는 타입·lint·포맷·원본 OAS 56건·엔진/런타임 21개 묶음·독립 설치를 통과했습니다. 단위 1365/1366·기존 Ajv 1건과 보안 High 5를 유지하며 자동 게이트는 차단 상태입니다. 호스트는 공개 0.3.16을 설치하고 실제 부모의 자동 계획·native 추가·업무 질문 checkpoint·SSE journal을 연결했습니다. 모델 대역의 5개 API 계획은 연결 0→3→7개를 발행하고 SDK JSON까지 생성했습니다. 최신 호스트 전체 102개 파일·505개 테스트·타입·lint·포맷·빌드가 통과했습니다. 실제 Chomsky 기반 호스트 실행·브라우저·대규모 비교는 남았습니다. 명시적 모드·자원 예산을 사용하며 기존 서버와 의도한 JSON 시나리오를 유지했습니다. 회사 push·Cloud 배포는 하지 않았습니다.',
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
    `실제 컴파일한 독립 예시의 노드 ${incremental.nodes.length}개(시작·종료 포함), 경로 ${incremental.edges.length}개입니다. 위 대화 그래프에 연결된 경로나 별도 호스트 구현의 전체 구조가 아닙니다. 기술적 제안 거절은 예산 내에서 자동 반복합니다. nativeAugmentation을 명시하면 선택된 native의 설정·검증·추가 후 같은 세션을 이어갑니다. 옵션을 생략하면 native 요청을 부모로 반환하며 실제 업무 질문과 구분합니다. 호스트의 실제 계획기→SSE journal 연결은 대역 검사까지 통과했고 실제 화면 검증은 남았습니다.`,
    '',
    '```mermaid',
    incremental.detail,
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

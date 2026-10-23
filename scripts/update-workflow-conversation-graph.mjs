import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';

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

export async function buildConversationGraphDocument() {
  const graph = await describeConversationGraph();
  return [
    '# 현재 대화형 워크플로우 설계 그래프',
    '',
    '이 그래프는 사용자의 대화로 n8n 워크플로우를 만드는 LangGraph입니다. 최종 결과물인 n8n 실행 그래프와는 다릅니다. 구조도이며, 실제 실행 로그나 모든 기능의 검증 완료를 뜻하지 않습니다.',
    '',
    '현재 작업(2026-10-23): 초기 generateApiArguments의 선택적 enum 의미 선택·요청 경로 추적·정확한 리터럴 출처 검증을 레퍼런스 생성 factory까지 연결했습니다. 검토 준비의 재검사도 요청한 선택 입력을 유지해 미해결 값을 인자 준비 단계에서 알립니다. 같은 API의 여러 역할은 값과 근거를 따로 보존하고 근거 기록은 후속 그래프 모델에 전달하지 않습니다. 기본 경로·confirmed-only 입력 소유·일회성 fail-fast 계약은 유지합니다. 버전 정렬 전 전체 1,253개 중 1,252개·집중 18개·원본 OAS 54개·타입·lint·포맷·빌드를 확인했으며 기존 Ajv 실패 1개·skip/cancel 0개입니다.',
    '',
    '기존 저장 결과의 격리 n8n 2.37.10 실행과 원본 OAS 요청/응답 검사를 통과했고 최초 시간 초과·검사 도구 오류·원본 바이트도 보존했습니다. 0.3.12의 버전 정렬 후 전체 1,252/1,253·원본 OAS 54개·격리 n8n 18개 검사군·독립 설치·배포 파일 검사를 확인했고 감사 취약점은 0건입니다. 소스 44a9b9a를 원격 main에 먼저 반영한 뒤 재빌드 일치·세 패키지 게시·공개 다운로드·latest·무결성을 확인했습니다. Qoopilot은 공개 0.3.12로 초기 enum 옵션을 사용하며 제품 359개 검사·타입·lint·포맷·빌드와 한 화면 사례의 실제 Chomsky 다섯 호출·값 검토·승인·JSON 다운로드·새로고침 복원을 통과했습니다. 주소·인증이 없는 이 UI 템플릿은 n8n 엔진으로 실행하지 않았습니다. 기존 Ajv 실패 1개·큰 JS 번들·이전 다중 OAS 전송 실패와 넓은 품질/안정성 과제는 남습니다. 이 도식은 30개 노드·68개 경로이며 Qoopilot 실행 로그나 생성된 n8n 그래프와는 다릅니다.',
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

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
      extractInputAnswers: '코드 소유 원문 후보로 입력 답변 해석',
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
    '현재 작업: API 복수 선택 질문의 명시적 kind·최소/최대 개수와 복수 답변 계약을 0.3.7 후보 소스에 추가했습니다. 기존 단일 선택은 유지하며 질문 문구에서 선택 방식을 추측하지 않습니다. 최종 단위 1,189개 중 1,188개와 원본 OAS 53개·격리 n8n 17개 검사군·엄격한 독립 설치·audit가 통과했습니다. 기존 승인된 Ajv 실패 1개는 유지합니다. 실제 모델은 원본 OAS에서 3~4개를 고르는 질문을 생성했고, 별도 실제 제품 폼의 브라우저 검사에서 세 항목 선택·해제·제출을 확인했습니다. 최초 oneOf 전송 거절과 원본 OAS 검사 가정 오류는 보존했으며 Zod union과 실제 통합 카탈로그로 원인을 수정해 다시 검사했습니다. 공개 배포·전체 호스트 적용은 진행 중이고 기존 사용자 대화는 재시작하거나 자동 제출하지 않습니다. 일반 의미 품질이나 새 업무 API 실행 완료를 주장하지 않습니다. 이 참고 도식은 실제 30개 노드·68개 경로이며 별도 호스트의 33개 노드·81개 간선과 구분합니다.',
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

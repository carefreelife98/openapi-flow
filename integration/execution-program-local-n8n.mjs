import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import console from 'node:console';
import {
  prepareWorkflowExecutionProgramSource,
  resolveWorkflowExecutionProgram,
} from '@openapi-flow/core';
import {
  createN8nNativeCapabilities,
  createPassThroughCapability,
  createN8nWorkflowProgramControls,
  createHttpRequestNode,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import { incrementalConnectionFixture } from '../test/fixtures/incremental-connection-fixture.mjs';
import { createFiveApiDagRuntime } from './fixtures/five-api-dag-runtime.mjs';

const node = (nodeId) => ({ kind: 'node', nodeId });
const directory = new URL(
  '../.local-artifacts/execution-program-local-n8n/',
  import.meta.url,
);
await mkdir(directory, { recursive: true });
const runtime = await createFiveApiDagRuntime(randomUUID());
const runs = [];
try {
  for (const useBarrier of [false, true]) {
    const source = incrementalConnectionFixture().source;
    const controls = createN8nWorkflowProgramControls();
    const input = {
      ...source,
      edges: [],
      gaps: [],
      controls,
      limits: { maxDepth: 20, maxBlocks: 100 },
      nativeNodes: useBarrier ? [] : source.nativeNodes,
      program: {
        kind: 'execution-program',
        body: {
          kind: 'sequence',
          steps: [
            node('source'),
            {
              kind: 'parallel',
              branches: ['detail', 'price', 'stock'].map(node),
              join: useBarrier ? { kind: 'barrier' } : node('join'),
            },
            node('summary'),
          ],
        },
      },
    };
    const result = resolveWorkflowExecutionProgram({
      ...prepareWorkflowExecutionProgramSource(input),
      program: input.program,
    });
    const names = Object.fromEntries(
      source.materials.map((m) => [
        m.arguments.callId,
        `Request ${m.arguments.callId}`,
      ]),
    );
    const apiNodes = source.materials.map((m) =>
      createHttpRequestNode({
        operation: m.operation,
        arguments: m.arguments,
        position: [0, 0],
        baseUrl: runtime.baseUrl,
        apiNodeNames: names,
      }),
    );
    const compiled = compilePlannedN8nWorkflow({
      id: randomUUID(),
      name: useBarrier
        ? 'Structured program barrier'
        : 'Structured program material join',
      plan: result.plan,
      materials: source.materials,
      apiNodes,
      capabilities: [...source.capabilities, ...controls.capabilities],
    });
    const executed = await runtime.execute(compiled.workflow, {
      id: 'program-source',
      labels: ['one', 'two'],
      filter: { R: 7 },
    });
    runs.push({
      useBarrier,
      status: executed.execution.status,
      requestCount: 5,
      generatedControls: result.generatedNodeIds.length,
    });
    await writeFile(
      new URL(
        useBarrier ? 'barrier-execution.json' : 'material-join-execution.json',
        directory,
      ),
      JSON.stringify(
        {
          program: input.program,
          result,
          compiled,
          execution: executed.execution,
        },
        null,
        2,
      ),
    );
    assert.equal(executed.execution.status, 'success');
  }
  for (const selected of [true, false]) {
    const source = incrementalConnectionFixture().source;
    const controls = createN8nWorkflowProgramControls();
    const input = {
      ...source,
      edges: [],
      gaps: [],
      controls,
      limits: { maxDepth: 20, maxBlocks: 100 },
      capabilities: [
        ...source.capabilities,
        ...createN8nNativeCapabilities().filter(
          (cap) =>
            !source.capabilities.some((existing) => existing.name === cap.name),
        ),
        createPassThroughCapability(),
      ],
      nativeNodes: [
        {
          id: 'condition',
          capability: 'if',
          parameters: {
            combinator: 'and',
            conditions: [
              {
                left: { source: 'literal', value: selected },
                operator: 'equals',
                right: { source: 'literal', value: true },
              },
            ],
          },
        },
        ...['yes', 'no'].map((id) => ({
          id,
          capability: 'pass-through',
          parameters: {},
        })),
      ],
      program: {
        kind: 'execution-program',
        body: {
          kind: 'sequence',
          steps: [
            node('source'),
            {
              kind: 'parallel',
              branches: [
                {
                  kind: 'sequence',
                  steps: [
                    node('detail'),
                    {
                      kind: 'branch',
                      nodeId: 'condition',
                      paths: [
                        { output: 'true', body: node('yes') },
                        { output: 'false', body: node('no') },
                      ],
                    },
                  ],
                },
                node('price'),
                node('stock'),
              ],
              join: { kind: 'barrier' },
            },
            node('summary'),
          ],
        },
      },
    };
    const result = resolveWorkflowExecutionProgram({
      ...prepareWorkflowExecutionProgramSource(input),
      program: input.program,
    });
    const names = Object.fromEntries(
      source.materials.map((m) => [
        m.arguments.callId,
        `Request ${m.arguments.callId}`,
      ]),
    );
    const apiNodes = source.materials.map((m) =>
      createHttpRequestNode({
        operation: m.operation,
        arguments: m.arguments,
        position: [0, 0],
        baseUrl: runtime.baseUrl,
        apiNodeNames: names,
      }),
    );
    const compiled = compilePlannedN8nWorkflow({
      id: randomUUID(),
      name: `Structured selected path ${selected}`,
      plan: result.plan,
      materials: source.materials,
      apiNodes,
      capabilities: [...input.capabilities, ...controls.capabilities],
    });
    const executed = await runtime.execute(compiled.workflow, {
      id: 'program-source',
      labels: ['one', 'two'],
      filter: { R: 7 },
    });
    const executedNodes = executed.execution.data.resultData.runData;
    assert.equal(executedNodes[selected ? 'yes' : 'no'].length, 1);
    assert.equal(executedNodes[selected ? 'no' : 'yes'], undefined);
    assert.equal(executedNodes['Request summary'].length, 1);
    runs.push({
      selected,
      status: executed.execution.status,
      requestCount: 5,
      generatedControls: result.generatedNodeIds.length,
    });
    await writeFile(
      new URL(`conditional-${selected}-execution.json`, directory),
      JSON.stringify(
        {
          program: input.program,
          result,
          compiled,
          execution: executed.execution,
        },
        null,
        2,
      ),
    );
  }
  {
    const source = incrementalConnectionFixture().source,
      controls = createN8nWorkflowProgramControls();
    const input = {
      ...source,
      edges: [],
      gaps: [],
      controls,
      limits: { maxDepth: 20, maxBlocks: 100 },
      capabilities: [...source.capabilities, createPassThroughCapability()],
      nativeNodes: [
        ...source.nativeNodes,
        {
          id: 'independent-terminal',
          capability: 'pass-through',
          parameters: {},
        },
      ],
      program: {
        kind: 'execution-program',
        body: {
          kind: 'parallel',
          branches: [
            {
              kind: 'sequence',
              steps: [
                node('source'),
                {
                  kind: 'parallel',
                  branches: ['detail', 'price', 'stock'].map(node),
                  join: node('join'),
                },
                node('summary'),
              ],
            },
            node('independent-terminal'),
          ],
          join: { kind: 'none' },
        },
      },
    };
    const result = resolveWorkflowExecutionProgram({
      ...prepareWorkflowExecutionProgramSource(input),
      program: input.program,
    });
    assert.equal(result.generatedNodeIds.length, 0);
    assert.equal(result.plan.starts.length, 2);
    const names = Object.fromEntries(
      source.materials.map((material) => [
        material.arguments.callId,
        `Request ${material.arguments.callId}`,
      ]),
    );
    const apiNodes = source.materials.map((material) =>
      createHttpRequestNode({
        operation: material.operation,
        arguments: material.arguments,
        position: [0, 0],
        baseUrl: runtime.baseUrl,
        apiNodeNames: names,
      }),
    );
    const compiled = compilePlannedN8nWorkflow({
      id: randomUUID(),
      name: 'Structured separate terminal results',
      plan: result.plan,
      materials: source.materials,
      apiNodes,
      capabilities: [...input.capabilities, ...controls.capabilities],
    });
    const executed = await runtime.execute(compiled.workflow, {
      id: 'program-source',
      labels: ['one', 'two'],
      filter: { R: 7 },
    });
    assert.equal(
      executed.execution.data.resultData.runData['independent-terminal'].length,
      1,
    );
    runs.push({
      terminalSeparateResults: true,
      status: executed.execution.status,
      requestCount: 5,
      generatedControls: 0,
    });
    await writeFile(
      new URL('terminal-results-execution.json', directory),
      JSON.stringify(
        {
          program: input.program,
          result,
          compiled,
          execution: executed.execution,
        },
        null,
        2,
      ),
    );
  }
  await writeFile(
    new URL('result.json', directory),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        image: runtime.image,
        runs,
        requests: runtime.requests,
        failures: runtime.failures,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ image: runtime.image, runs }, null, 2));
} finally {
  await runtime.close();
}

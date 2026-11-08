import { node } from '@n8n/workflow-sdk';
import type { N8nWorkflowProgramControls } from '../../types/workflow-execution-program.js';
import type { N8nNativeCapability } from '../../types/native-capability.js';
import type { PlannedNativeNode } from '@openapi-flow/core';
import {
  parallelBarrierParametersSchema,
  alternativeRejoinParametersSchema,
} from '../../schemas/execution-program-controls-schema.js';
import { createNativeFragment } from '../../nodes/native/common/create-native-fragment.js';

/** Compiler-owned control tokens are never bindable business values. */
export function createN8nWorkflowProgramControls(): N8nWorkflowProgramControls {
  const barrier: N8nNativeCapability = {
    name: 'execution-parallel-barrier',
    description:
      'Compiler-owned workflow-level completion barrier. Each input must supply one item; output is one non-bindable control token. Item-wise parallel joins require their explicit scoped implementation.',
    parametersSchema: parallelBarrierParametersSchema,
    inputPorts: (value) =>
      Array.from(
        { length: parallelBarrierParametersSchema.parse(value).numberInputs },
        (_, index) => `input${index + 1}`,
      ),
    outputPorts: () => ['main'],
    responseReferences: () => [],
    parameterReferenceSources: [],
    parameterReferenceBindings: () => [],
    waitsForAllInputs: true,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) => {
      const { numberInputs } = parallelBarrierParametersSchema.parse(
        planned.parameters,
      );
      const ports = Array.from(
        { length: numberInputs },
        (_, index) => `input${index + 1}`,
      );
      const merge = node({
        type: 'n8n-nodes-base.merge',
        version: 3.2,
        config: {
          id: planned.id,
          name: planned.id,
          position,
          parameters: { mode: 'append', numberInputs },
        },
      });
      const guards = ports.map((port, index) =>
        node({
          type: 'n8n-nodes-base.code',
          version: 2,
          config: {
            id: `${planned.id}-${port}`,
            name: `${planned.id}-${port}`,
            position: [position[0] - 220, position[1] + index * 80],
            parameters: {
              mode: 'runOnceForAllItems',
              language: 'javaScript',
              jsCode: `const items=$input.all();if(items.length!==1)throw new Error('Workflow parallel completion requires exactly one item per branch; use an explicit item-scoped join');return items;`,
            },
          },
        }),
      );
      const completed = node({
        type: 'n8n-nodes-base.code',
        version: 2,
        config: {
          id: `${planned.id}-completed`,
          name: `${planned.id}-completed`,
          position: [position[0] + 220, position[1]],
          parameters: {
            mode: 'runOnceForAllItems',
            language: 'javaScript',
            jsCode: `if($input.all().length!==${numberInputs})throw new Error('Parallel completion input count differs from its declared branches');return [{json:{}}];`,
          },
        },
      });
      return {
        nodeId: planned.id,
        nodes: [...guards, merge, completed],
        entry: guards[0],
        exit: completed,
        inputPorts: Object.fromEntries(ports.map((port) => [port, 0])),
        outputPorts: { main: 0 },
        inputEndpoints: Object.fromEntries(
          ports.map((port, index) => [
            port,
            { nodeId: guards[index].id, input: 0 },
          ]),
        ),
        internalEdges: [
          ...guards.map((guard, index) => ({
            from: guard.id,
            output: 0,
            to: merge.id,
            input: index,
          })),
          { from: merge.id, output: 0, to: completed.id, input: 0 },
        ],
      };
    },
  };
  const rejoin: N8nNativeCapability = {
    name: 'execution-alternative-rejoin',
    description:
      'Compiler-owned continuation of mutually exclusive paths. Forwards the selected path without waiting for the unselected one.',
    parametersSchema: alternativeRejoinParametersSchema,
    inputPorts: () => ['main'],
    outputPorts: () => ['main'],
    responseReferences: () => [],
    parameterReferenceSources: [],
    parameterReferenceBindings: () => [],
    waitsForAllInputs: false,
    exclusiveOutputPorts: false,
    compile: ({ planned, position }) => ({
      ...createNativeFragment(
        node({
          type: 'n8n-nodes-base.code',
          version: 2,
          config: {
            id: planned.id,
            name: planned.id,
            position,
            parameters: {
              mode: 'runOnceForAllItems',
              language: 'javaScript',
              jsCode:
                'return $input.all().map((item,index)=>({...item,pairedItem:{item:index}}));',
            },
          },
        }),
        ['main'],
        ['main'],
      ),
      preservesInputItems: true,
    }),
  };
  return {
    version: 'n8n-execution-controls-v1',
    capabilities: [barrier, rejoin],
    create: (request): PlannedNativeNode =>
      request.kind === 'parallel-barrier'
        ? {
            id: request.id,
            capability: barrier.name,
            parameters: { numberInputs: request.inputCount },
          }
        : { id: request.id, capability: rejoin.name, parameters: {} },
  };
}

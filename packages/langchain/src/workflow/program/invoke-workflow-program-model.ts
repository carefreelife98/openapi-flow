import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { describeWorkflowExecutionProgram } from '@openapi-flow/core';
import type { InvokeWorkflowProgramModelInput } from '../../types/workflow-execution-program.js';
import { invokeStructuredModel } from '../../model/invoke-structured-model.js';
import { serializeStructuredOutputSchema } from '../../schemas/serialize-structured-output-schema.js';
import { WorkflowProgramPlanningError } from './workflow-program-planning-error.js';

/** Exactly one model call. Neither provider failures nor validation failures are retried here. */
export async function invokeWorkflowProgramModel<Output extends object>(
  input: InvokeWorkflowProgramModelInput<Output>,
): Promise<Output> {
  const controlsFactory = input.input.controls?.create;
  const output = await invokeStructuredModel<Output>({
    model: input.input.model,
    operation: input.operation,
    name: input.name,
    schema: serializeStructuredOutputSchema(
      input.schema,
      'draft-2020-12',
      'output',
      'ref',
    ),
    method: 'jsonSchema',
    strict: true,
    ...(input.input.signal === undefined ? {} : { signal: input.input.signal }),
    messages: [
      new SystemMessage(input.prompt),
      new HumanMessage(
        JSON.stringify({
          scope: 'supplied-workflow-configuration',
          scenario: input.description.context.scenario,
          requirements: input.description.requirements.map((fact) => ({
            id: fact.id,
            text: fact.text,
          })),
          operations: input.description.apiOperations,
          nodes: input.description.context.nodes,
          protectedEdges: input.description.context.edges,
          materials: input.description.sources.materials.map((material) =>
            material.status === 'ready'
              ? {
                  callId: material.arguments.callId,
                  status: material.status,
                  arguments: {
                    values: material.arguments.values,
                    bindings: material.arguments.bindings,
                    unresolvedInputs: material.arguments.unresolvedInputs,
                    ...(material.arguments.requestedInputs === undefined
                      ? {}
                      : {
                          requestedInputs: material.arguments.requestedInputs,
                        }),
                    ...(material.arguments.requestMediaType === undefined
                      ? {}
                      : {
                          requestMediaType: material.arguments.requestMediaType,
                        }),
                  },
                }
              : {
                  callId: material.callId,
                  status: material.status,
                  bindings: material.bindings,
                  gapIds: material.gapIds,
                },
          ),
          nativeNodes: (input.description.context.nativeNodes ?? []).map(
            (material) => ({
              id: material.id,
              capability: material.capability,
              parameters: material.parameters,
              ...(material.runtimeParameters === undefined
                ? {}
                : { runtimeParameters: material.runtimeParameters }),
            }),
          ),
          responseValues: input.description.responseValues,
          nativeImplementations: input.description.sources.capabilities
            .filter((capability) =>
              input.description.context.nativeNodes?.some(
                (node) => node.capability === capability.name,
              ),
            )
            .map((capability) => ({
              name: capability.name,
              description: capability.description,
            })),
          limits: input.description.limits,
          materialRepairStages: input.description.materialRepairStages,
          ...(input.result === undefined
            ? {}
            : { program: input.result.program, graph: input.result.plan }),
          ...(input.input.feedback === undefined
            ? {}
            : { feedback: input.input.feedback }),
        }),
      ),
    ],
  });
  if (
    !isDeepStrictEqual(
      describeWorkflowExecutionProgram(input.input),
      input.description,
    ) ||
    input.input.controls?.create !== controlsFactory
  )
    throw new Error('Execution program source changed during model invocation');
  try {
    const parsed = input.schema.parse(output);
    if (!isDeepStrictEqual(parsed, output))
      throw new Error(
        'Execution program output must not default, coerce or transform model data',
      );
    return parsed;
  } catch (cause) {
    throw new WorkflowProgramPlanningError({
      operation: input.operation,
      sourceFingerprint: input.description.sourceFingerprint,
      stage: 'model-output',
      output,
      cause,
    });
  }
}

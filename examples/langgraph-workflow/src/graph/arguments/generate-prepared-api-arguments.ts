import { generateApiArguments } from '@openapi-flow/langchain';
import type { GenerateApiArgumentsInput } from '@openapi-flow/langchain';
import type { ApiCallArguments } from '@openapi-flow/core';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { ApiArgumentPlanningOptions } from '../../types/api-argument-planning.js';
import { createApiArgumentPlanningGraph } from '../create-api-argument-planning-graph.js';

/** Omission keeps the existing one-attempt composition. The loop is an explicit host option. */
export async function generatePreparedApiArguments(
  input: GenerateApiArgumentsInput,
  planning?: ApiArgumentPlanningOptions,
  config?: RunnableConfig,
): Promise<ApiCallArguments> {
  if (planning === undefined)
    return generateApiArguments({
      ...input,
      ...(config?.signal === undefined
        ? {}
        : {
            signal:
              input.signal === undefined
                ? config.signal
                : AbortSignal.any([input.signal, config.signal]),
          }),
    });
  if (!input.model) throw new Error('argumentPlanning requires model');
  if (input.rejectedProposals !== undefined)
    throw new Error(
      'argumentPlanning owns rejectedProposals; resume its checkpoint instead of replacing history',
    );
  if (
    planning.checkpointer !== undefined &&
    (typeof config?.configurable?.['thread_id'] !== 'string' ||
      !config.configurable['thread_id'].trim())
  )
    throw new Error(
      'argumentPlanning.checkpointer requires configurable.thread_id',
    );
  const { model, signal, ...source } = input;
  const combined =
    signal === undefined
      ? config?.signal
      : config?.signal === undefined
        ? signal
        : AbortSignal.any([signal, config.signal]);
  const graph = createApiArgumentPlanningGraph({
    ...planning,
    model,
    source: () => source,
  });
  const result = await graph.invoke(
    {},
    { ...config, ...(combined === undefined ? {} : { signal: combined }) },
  );
  if (result.status !== 'complete' || result.arguments === undefined)
    throw new Error(
      'argumentPlanning ended without validated completed arguments',
    );
  return result.arguments;
}

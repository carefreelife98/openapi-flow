import type { WorkflowInputCatalog } from '../../types/workflow-api-arguments.js';
import type { ApiInputSourceCatalog } from '../../types/api-input-source-selection.js';

/** One conservative type projection serves both provider schema and visible candidate context. */
export function describeWorkflowInputSourceChoices(
  catalog: WorkflowInputCatalog,
  types: string[],
): ApiInputSourceCatalog {
  return {
    json: catalog.sources
      .flatMap((entry) => entry.sources.json)
      .filter((candidate) => {
        const value: unknown = JSON.parse(candidate.text);
        const type = Array.isArray(value)
          ? 'array'
          : value === null
            ? 'null'
            : typeof value === 'number' && Number.isInteger(value)
              ? 'integer'
              : typeof value;
        return types.includes(type);
      }),
    text: types.includes('string')
      ? catalog.sources.flatMap((entry) => entry.sources.text)
      : [],
  };
}

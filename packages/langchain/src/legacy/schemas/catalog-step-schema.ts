import { z } from 'zod';
import type { Operation } from '@openapi-flow/core/internal';
import type { PriorStepSummary } from '../../types/legacy/catalog-planning.js';
import { createOperationPlanSchema } from '@openapi-flow/core/internal';

function declaredNames(
  names: string[],
  description: string,
): z.ZodType<string> {
  return (
    names.length
      ? z.enum(names)
      : z.string().refine(() => false, {
          message: 'No declared names are available for this reference.',
        })
  ).describe(description);
}

export function createCatalogStepSchema(
  operation: Operation,
  openapiVersion: string,
  previousSteps: PriorStepSummary[],
) {
  const targetKeys = operation.parameters
    .filter((parameter) => parameter.in === 'path' || parameter.in === 'query')
    .map((parameter) => `${parameter.in}.${parameter.name}`);
  const previousStepIds = previousSteps.map((step) => step.id);
  const responseFields = [
    ...new Set(previousSteps.flatMap((step) => step.responseFields)),
  ];
  return createOperationPlanSchema(operation, openapiVersion).extend({
    ...(operation.body
      ? {
          requestMediaType: z
            .enum(Object.keys(operation.body.mediaTypes))
            .describe(
              'OAS request-body media type explicitly implied by the scenario; omit when the scenario does not choose one.',
            )
            .optional(),
        }
      : {}),
    references: z
      .array(
        z
          .object({
            target: declaredNames(
              targetKeys,
              'Exact path or query parameter key from the selected OAS operation.',
            ),
            fromStep: declaredNames(
              previousStepIds,
              'ID of an earlier API step whose response supplies this parameter.',
            ),
            field: declaredNames(
              responseFields,
              'Top-level response body field declared by an earlier operation OAS.',
            ),
          })
          .strict(),
      )
      .describe(
        previousStepIds.length
          ? `Response-to-request bindings from earlier steps: ${previousStepIds.join(', ')}. Empty if none are needed.`
          : 'No previous steps exist; return an empty array.',
      ),
  });
}

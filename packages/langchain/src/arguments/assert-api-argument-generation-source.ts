import { isDeepStrictEqual } from 'node:util';
import { describeWorkflowConnectionApiRepair } from '@openapi-flow/core';
import type {
  ApiLiteralGenerationInput,
  WorkflowConnectionApiRepairDescription,
} from '@openapi-flow/core';
import type { GenerateApiArgumentsInput } from '../types/argument-generation.js';

/** Both asynchronous decisions must finish against the same explicit original source and repair request. */
export function assertApiArgumentGenerationSource(
  input: GenerateApiArgumentsInput,
  snapshot: ApiLiteralGenerationInput,
  materialRepair?: WorkflowConnectionApiRepairDescription,
): void {
  if (
    snapshot.literalSourceMessages !== undefined &&
    !isDeepStrictEqual(
      snapshot.literalSourceMessages,
      input.literalSourceMessages,
    )
  )
    throw new Error('literalSourceMessages changed during argument generation');
  if (
    materialRepair !== undefined &&
    (input.materialRepair === undefined ||
      !isDeepStrictEqual(
        materialRepair,
        describeWorkflowConnectionApiRepair({
          stage: 'api-arguments',
          repair: input.materialRepair,
          planning: input,
        }),
      ))
  )
    throw new Error(
      'API material repair feedback changed during argument generation',
    );
}

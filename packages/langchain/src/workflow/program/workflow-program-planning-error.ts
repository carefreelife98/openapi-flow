import { OpenApiFlowError } from '@openapi-flow/core';
import type { WorkflowProgramPlanningFailure } from '../../types/workflow-execution-program.js';

export class WorkflowProgramPlanningError extends OpenApiFlowError {
  readonly sourceFingerprint: string;
  readonly #output: unknown;
  constructor(input: WorkflowProgramPlanningFailure) {
    super({
      message:
        input.cause instanceof Error
          ? input.cause.message
          : 'Invalid execution program output',
      diagnostic: {
        owner: 'langchain',
        operation: input.operation,
        stage: input.stage,
        code:
          input.stage === 'model-output'
            ? 'MODEL_OUTPUT_INVALID'
            : 'WORKFLOW_GRAPH_PLANNING_FAILED',
      },
      cause: input.cause,
    });
    this.name = 'WorkflowProgramPlanningError';
    this.sourceFingerprint = input.sourceFingerprint;
    this.#output = structuredClone(input.output);
  }
  get output(): unknown {
    return structuredClone(this.#output);
  }
}

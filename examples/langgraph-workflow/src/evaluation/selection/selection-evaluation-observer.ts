import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type {
  EvaluationModelEvidence,
  EvaluationModelResponse,
} from '../../types/api-selection-evaluation.js';
import { evaluationGenerationUsageSchema } from '../../schemas/api-selection-evaluation-schema.js';

/** Save generated text and standardized usage only, never model requests or headers. */
export class SelectionEvaluationObserver extends BaseCallbackHandler {
  name = 'api-selection-evaluation';
  awaitHandlers = true;
  private calls = 0;
  private responses: EvaluationModelResponse[] = [];

  handleLLMStart(): void {
    this.calls += 1;
  }
  handleLLMEnd(output: LLMResult): void {
    for (const generations of output.generations)
      for (const generation of generations) {
        const parsed = evaluationGenerationUsageSchema.safeParse(generation);
        this.responses.push({
          text: generation.text,
          usage: parsed.success
            ? {
                input_tokens: parsed.data.message.usage_metadata.input_tokens,
                output_tokens: parsed.data.message.usage_metadata.output_tokens,
                total_tokens: parsed.data.message.usage_metadata.total_tokens,
              }
            : null,
        });
      }
  }
  take(): EvaluationModelEvidence {
    const result = { calls: this.calls, responses: this.responses };
    this.calls = 0;
    this.responses = [];
    return result;
  }
}

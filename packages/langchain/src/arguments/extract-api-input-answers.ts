import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createApiInputAnswersSchema } from '@openapi-flow/core';
import type { ApiInputAnswer } from '@openapi-flow/core';
import type {
  ExtractApiInputAnswersInput,
  ApiInputAnswersOutput,
} from '../types/api-input-answers.js';
import { apiInputAnswersPrompt } from '../prompts/api-input-answers-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { assertSelectionInput } from '../legacy/planning/select-operation.js';
import { validateApiAnswerSource } from './validate-api-answer-source.js';

export async function extractApiInputAnswers(
  input: ExtractApiInputAnswersInput,
): Promise<ApiInputAnswer[]> {
  assertSelectionInput(input.reply, input.model);
  const schema = createApiInputAnswersSchema(input.requirements);
  const output = await input.model
    .withStructuredOutput<ApiInputAnswersOutput>(schema, {
      name: 'extract_api_input_answers',
      method: 'functionCalling',
    })
    .invoke([
      new SystemMessage(apiInputAnswersPrompt),
      new HumanMessage(
        JSON.stringify({ reply: input.reply, questions: input.requirements }),
      ),
    ]);
  return parseStructuredOutput(
    schema,
    output,
    'model clarification answers',
  ).answers.map((answer) => ({
    requirementId: answer.requirementId,
    value: validateApiAnswerSource(input.reply, answer),
  }));
}

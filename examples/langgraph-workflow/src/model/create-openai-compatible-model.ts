import { ChatOpenAI } from '@langchain/openai';
import type { ExampleConfiguration } from '../types/configuration.js';

export function createOpenAiCompatibleModel(
  config: ExampleConfiguration,
): ChatOpenAI {
  return new ChatOpenAI({
    model: config.LLM_MODEL,
    apiKey: config.LLM_API_KEY,
    maxRetries: 0,
    timeout: 60_000,
    configuration: {
      baseURL: config.LLM_BASE_URL,
      defaultHeaders: config.LLM_HEADERS_JSON,
    },
  });
}

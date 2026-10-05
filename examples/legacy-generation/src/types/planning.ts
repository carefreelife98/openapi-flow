import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  CompileRequest,
  CompileResult,
  CatalogSequenceResult,
  ExpectedBody,
  N8nCatalogSource,
} from '@openapi-flow/n8n/legacy';
import type { ProposeCatalogScenarioInput } from '@openapi-flow/langchain/legacy';
export interface GenerateRequest extends Omit<CompileRequest, 'plan'> {
  scenario: string;
  model: BaseChatModel;
  requestMediaType?: string;
  expectedBody?: ExpectedBody;
}
export interface GenerateCatalogScenarioInput extends Omit<
  ProposeCatalogScenarioInput,
  'sources'
> {
  sources: N8nCatalogSource[];
  profile: CompileRequest['profile'];
}
export type GeneratedCatalogScenario = CatalogSequenceResult;
export type GeneratedWorkflow = CompileResult;

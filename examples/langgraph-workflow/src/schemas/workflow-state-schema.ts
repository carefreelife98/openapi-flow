import { StateSchema } from '@langchain/langgraph';
import { z } from 'zod';
import type {
  ApiSource,
  ApiCatalog,
  ApiSelection,
  ApiOperationContract,
  ApiCallArguments,
} from '@openapi-flow/core';
import type { N8nCompileResult } from '@openapi-flow/n8n';

// These channels carry host/library objects, not model structured-output schemas.
// createApiCatalog validates the source OAS; adapter calls validate proposals.
export const workflowStateSchema = new StateSchema({
  workflowId: z.string().min(1),
  workflowName: z.string().min(1),
  scenario: z.string().min(1),
  sources: z.array(z.custom<ApiSource>()).min(1),
  catalog: z.custom<ApiCatalog>().optional(),
  selection: z.custom<ApiSelection>().optional(),
  contracts: z.custom<ApiOperationContract[]>().optional(),
  arguments: z.custom<ApiCallArguments[]>().optional(),
  workflow: z.custom<N8nCompileResult['workflow']>().optional(),
  trace: z.array(z.string()),
});

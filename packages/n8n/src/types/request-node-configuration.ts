import type {
  CreateBoundHttpRequestNodeInput,
  N8nNodeFragment,
} from './node-fragment.js';
import type { RequestMaterializationConfig } from './request-materialization.js';
import type { ResolvedHttpRequestDeployment } from './request-deployment.js';
import type { HttpRequestPagination } from './http-request-pagination.js';

export interface ResolveHttpRequestNodeConfigurationResult {
  input: CreateBoundHttpRequestNodeInput;
  config: RequestMaterializationConfig;
}
export interface FinalizeHttpRequestFragmentInput {
  pagination?: HttpRequestPagination;
  fragment: N8nNodeFragment;
  method: string;
  documentId: string;
  deployment: ResolvedHttpRequestDeployment;
}

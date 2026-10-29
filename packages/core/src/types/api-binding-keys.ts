import type { ApiLiteralSourceSelection } from './api-input-literal-source.js';
import type { WorkflowSourceMessage } from './workflow-draft.js';

export type ApiBindingKeySourceSelection =
  | Omit<
      Extract<ApiLiteralSourceSelection, { sourceFormat: 'text' }>,
      'targetPointer'
    >
  | Omit<
      Extract<ApiLiteralSourceSelection, { sourceFormat: 'json' }>,
      'targetPointer'
    >;

export interface ApiBindingKeyProposal {
  nodeId: string;
  kind: 'key' | 'path';
  value: string;
  source: ApiBindingKeySourceSelection;
}

export interface ApiBindingKeyCandidate extends ApiBindingKeyProposal {
  id: string;
  tokens: string[];
}

export interface CreateApiBindingKeyCatalogInput {
  selections: ApiBindingKeyProposal[];
  messages: WorkflowSourceMessage[];
  nodeIds: string[];
}

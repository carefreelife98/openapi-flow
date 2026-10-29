import type {
  ApiBindingKeyProposal,
  ApiBindingKeySourceSelection,
} from '@openapi-flow/core';

export type ApiBindingGeneratedKeySource =
  | (Omit<
      Extract<ApiBindingKeySourceSelection, { sourceFormat: 'text' }>,
      'messageId'
    > & { messageId?: string })
  | (Omit<
      Extract<ApiBindingKeySourceSelection, { sourceFormat: 'json' }>,
      'messageId'
    > & { messageId?: string });

export interface ApiBindingGeneratedKeySelection extends Omit<
  ApiBindingKeyProposal,
  'source'
> {
  source: ApiBindingGeneratedKeySource;
}

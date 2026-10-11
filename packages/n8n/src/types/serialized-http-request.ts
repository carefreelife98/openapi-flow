import type { HttpRequestNodeInput } from './legacy/request-node.js';

export interface SerializedHttpRequestNodeInput extends HttpRequestNodeInput {
  bodySource: 'literal' | 'materialized';
}

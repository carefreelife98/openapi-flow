/** Adapter-only configuration, not a model-inferred API pagination contract. */
export interface HttpRequestPagination {
  mode: 'page-number';
  /** Exactly one original response envelope per fetched page, including the terminal page. */
  output: 'per-page';
  /** Name of the original OAS query parameter; no field-name heuristics. */
  parameter: string;
  start: number;
  step: number;
  /** Positive safe integer; host-selected budget also bounds O(maxRequests) prevalidation. */
  maxRequests: number;
  requestInterval: number;
  /** A status-based sequence fails if its request budget ends before this condition. */
  termination:
    { kind: 'max-requests' } | { kind: 'status-codes'; statusCodes: number[] };
}

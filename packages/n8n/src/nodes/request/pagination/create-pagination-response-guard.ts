import type { HttpRequestPagination } from '../../../types/http-request-pagination.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** The official helper skips continuation on maxRequests; verify completion afterwards. */
export function createPaginationResponseGuard(
  pagination?: HttpRequestPagination,
): string {
  if (!pagination) return '';
  const statusTermination = pagination.termination.kind === 'status-codes';
  const statuses =
    pagination.termination.kind === 'status-codes'
      ? pagination.termination.statusCodes
      : [];
  const allowed = javascriptJsonLiteral(statuses);
  const statusGuard = `if(!Number.isInteger(item.json.statusCode)||((item.json.statusCode<200||item.json.statusCode>=300)&&!${allowed}.includes(item.json.statusCode)))throw new Error('pagination HTTP status '+item.json.statusCode);`;
  if (!statusTermination)
    return `for(const item of $input.all()){${statusGuard}}`;
  // n8n 2.37.10 HttpRequestV3 emits each original input's complete response array
  // contiguously, in input order (Promise.allSettled, then the itemIndex loop).
  // The helper appends pages in request order and stops only on completion or
  // maxRequests. A terminal status therefore delimits a complete sequence.
  // Decoder input pairedItem is rebased to transport indexes; never group by it.
  return `let paginationPageCount=0;for(const item of $input.all()){${statusGuard}paginationPageCount++;if(${allowed}.includes(item.json.statusCode)){paginationPageCount=0;}else if(paginationPageCount>=${pagination.maxRequests})throw new Error('pagination exhausted maxRequests before status-codes termination');}if(paginationPageCount!==0)throw new Error('pagination ended before status-codes termination');`;
}

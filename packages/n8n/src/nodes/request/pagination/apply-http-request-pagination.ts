import { isObject } from '@openapi-flow/core/internal';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import type { RequestMaterializationConfig } from '../../../types/request-materialization.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';

/** Official HTTP Request V3 options, verified against n8n 2.37.10 / node 4.3. */
export function applyHttpRequestPagination(
  fragment: N8nNodeFragment,
  config: RequestMaterializationConfig,
): N8nNodeFragment {
  const pagination = config.pagination;
  if (!pagination) return fragment;
  const transport = fragment.exit;
  const parameters = transport.config.parameters;
  if (!parameters || !isObject(parameters.options))
    throw new Error('pagination transport requires options');
  const statusCodes =
    pagination.termination.kind === 'status-codes'
      ? pagination.termination.statusCodes
      : [];
  // Explicit max-requests termination uses this expression only for early HTTP errors.
  // The decoder checks status and actual completion even on the last budgeted page.
  const complete = `={{ (()=>{if(!Number.isInteger($response.statusCode))throw new Error('pagination response.statusCode is missing');if(${javascriptJsonLiteral(statusCodes)}.includes($response.statusCode))return true;if($response.statusCode<200||$response.statusCode>=300)throw new Error('pagination HTTP status '+$response.statusCode);return false;})() }}`;
  transport.config.parameters = {
    ...parameters,
    options: {
      ...parameters.options,
      // Do not let a redirect escape the operation URI/security contract.
      redirect: { redirect: { followRedirects: false } },
      pagination: {
        pagination: {
          paginationMode: 'updateAParameterInEachRequest',
          parameters: {
            parameters: [
              {
                type: 'qs',
                name: pagination.parameter,
                value: `={{ ${pagination.start} + $pageCount * ${pagination.step} }}`,
              },
            ],
          },
          paginationCompleteWhen: 'other',
          completeExpression: complete,
          limitPagesFetched: true,
          maxRequests: pagination.maxRequests,
          requestInterval: pagination.requestInterval,
        },
      },
    },
  };
  // Native pagination is 1:N. Singleton/ancestry analysis must never claim 1:1.
  return { ...fragment, preservesInputItems: false };
}

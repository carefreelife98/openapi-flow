import { readFileSync } from 'node:fs';
import { node } from '@n8n/workflow-sdk';
import { isObject } from '@openapi-flow/core/internal';
import type { N8nNodeFragment } from '../../../types/node-fragment.js';
import type { CreateHttpResponseDecoderInput } from '../../../types/http-response-decoding.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { httpResponseNodeName } from './http-response-node-name.js';

/** Keep transport metadata and item ancestry while exposing the decoded API exit. */
export function createHttpResponseDecoder({
  fragment,
  method,
}: CreateHttpResponseDecoderInput): N8nNodeFragment {
  const transport = fragment.exit;
  const position = transport.config.position;
  if (!position || position.length !== 2)
    throw new Error(
      `API ${fragment.nodeId} response decoder requires transport position`,
    );
  const parameters = transport.config.parameters;
  if (
    !parameters ||
    !isObject(parameters.options) ||
    !isObject(parameters.options.response) ||
    !isObject(parameters.options.response.response)
  )
    throw new Error(
      `API ${fragment.nodeId} transport requires options.response.response`,
    );
  transport.config.parameters = {
    ...parameters,
    options: {
      ...parameters.options,
      response: {
        ...parameters.options.response,
        response: {
          ...parameters.options.response.response,
          fullResponse: true,
          responseFormat: 'file',
          outputPropertyName: 'openApiFlowRawResponse',
        },
      },
    },
  };
  const runtime = readFileSync(
    new URL('./response-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const decoder = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: fragment.nodeId,
      name: httpResponseNodeName(fragment.nodeId),
      position: [position[0] + 220, position[1]],
      notes:
        'Decode the raw HTTP response once. Preserve status, headers, body types and item ancestry. Invalid JSON fails without repair.',
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `${runtime}\nconst sourceNodeId=${javascriptJsonLiteral(fragment.nodeId)};\nconst method=${javascriptJsonLiteral(method)};\nconst result=[];\nfor(const [inputIndex,item] of $input.all().entries()){\nconst bytes=await this.helpers.getBinaryDataBuffer(inputIndex,'openApiFlowRawResponse');\nconst decoded=OpenApiFlowResponseRuntime.decodeHttpResponse({response:item.json,bytes,method,sourceNodeId});\nconst binary={...item.binary};\nconst raw=binary.openApiFlowRawResponse;\ndelete binary.openApiFlowRawResponse;\nif(decoded.kind==='binary')binary.data=raw;\nresult.push({json:decoded.response,...(Object.keys(binary).length?{binary}:{}),pairedItem:{item:inputIndex}});\n}\nreturn result;`,
      },
    },
  });
  return {
    ...fragment,
    nodes: [...fragment.nodes, decoder],
    exit: decoder,
    internalEdges: [
      ...(fragment.internalEdges ?? []),
      { from: transport.id, output: 0, to: decoder.id, input: 0 },
    ],
  };
}

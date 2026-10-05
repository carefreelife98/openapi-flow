import { readFileSync } from 'node:fs';
import { node } from '@n8n/workflow-sdk';
import type {
  CreateHttpRequestNodeInput,
  N8nNodeFragment,
} from '../../../types/node-fragment.js';
import type { RequestMaterializationConfig } from '../../../types/request-materialization.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { httpRequestNode } from '../../../legacy/workflow/request/http-request-node.js';
import { resolveCredentialBinding } from '../../../legacy/workflow/request/credential-binding.js';
import { compileRequestValidator } from './compile-request-validator.js';

export function createBoundRequestFragment(
  input: CreateHttpRequestNodeInput,
  config: RequestMaterializationConfig,
): N8nNodeFragment {
  if (!input.apiNodeNames)
    throw new Error(
      `arguments[${config.arguments.callId}] requires apiNodeNames for response bindings`,
    );
  const names = input.apiNodeNames;
  const sources = [
    ...new Set(
      config.arguments.bindings.map((binding) => binding.sourceNodeId),
    ),
  ];
  for (const id of sources)
    if (!Object.hasOwn(names, id) || !names[id].trim())
      throw new Error(`apiNodeNames is missing ${id}`);
  const runtime = readFileSync(
    new URL('../runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const validator = compileRequestValidator(config);
  const code = `${runtime}\n${validator}\nconst config=${javascriptJsonLiteral(config)};\nconst names=${javascriptJsonLiteral(Object.fromEntries(sources.map((id) => [id, names[id]])))};\nconst responses=Object.create(null);\nfor(const [id,name] of Object.entries(names)){const items=$(name).all();if(items.length!==1)throw new Error('Response '+id+' requires an unambiguous single API envelope; got '+items.length+' items');if(!Object.hasOwn(items[0].json,'body'))throw new Error('Missing response body '+id);responses[id]=items[0].json.body;}\nreturn [{json:OpenApiFlowRequestRuntime.materializeHttpRequest(config,responses,OpenApiFlowRequestValidator)}];`;
  const materializer = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: `${config.arguments.callId}-materialize`,
      name: `Materialize ${config.arguments.callId}`,
      position: input.position,
      parameters: { mode: 'runOnceForAllItems', jsCode: code },
    },
  });
  const bodyPresent =
    Object.hasOwn(config.arguments.values, 'body') ||
    config.arguments.bindings.some(
      (binding) =>
        binding.targetPointer === '/body' ||
        binding.targetPointer.startsWith('/body/'),
    );
  const mediaTypes = config.operation.body
    ? Object.keys(config.operation.body.mediaTypes)
    : [];
  const mediaType =
    config.arguments.requestMediaType ??
    (mediaTypes.length === 1 ? mediaTypes[0] : undefined);
  if (bodyPresent && mediaType === undefined)
    throw new Error('requestMediaType must select the bound body media type');
  if (
    bodyPresent &&
    mediaType !== 'application/json' &&
    mediaType !== 'application/x-www-form-urlencoded'
  )
    throw new Error(
      `${config.operation.operationRef}: requestBody media type ${mediaType} has no n8n mapping`,
    );
  const request = httpRequestNode({
    operation: config.operation,
    id: config.arguments.callId,
    name: 'Request ' + config.arguments.callId,
    position: [input.position[0] + 220, input.position[1]],
    url: '={{ $json.url }}',
    headers: [],
    body: bodyPresent
      ? {
          contentType:
            mediaType === 'application/json' ? 'json' : 'form-urlencoded',
          value: '={{ $json.body.value }}',
        }
      : undefined,
    authentication: resolveCredentialBinding(
      config.operation,
      input.credentialBindings,
    ),
    shouldAssert: false,
  });
  // Headers may include bound values; HTTP Request supports a JSON expression.
  request.config.parameters = {
    ...request.config.parameters,
    sendHeaders: true,
    specifyHeaders: 'json',
    jsonHeaders: '={{ $json.headersJson }}',
  };
  return {
    nodeId: config.arguments.callId,
    nodes: [materializer, request],
    entry: materializer,
    exit: request,
    internalEdges: [
      { from: materializer.id, output: 0, to: request.id, input: 0 },
    ],
    inputPorts: { main: 0 },
    outputPorts: { main: 0 },
  };
}

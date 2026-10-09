import { readFileSync } from 'node:fs';
import { node } from '@n8n/workflow-sdk';
import type {
  CreateBoundHttpRequestNodeInput,
  N8nNodeFragment,
} from '../../../types/node-fragment.js';
import type { RequestMaterializationConfig } from '../../../types/request-materialization.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { httpRequestNode } from '../../../legacy/workflow/request/http-request-node.js';
import { resolveCredentialBinding } from '../../../legacy/workflow/request/credential-binding.js';
import { compileRequestValidator } from './compile-request-validator.js';
import { resolveOutputBindingSources } from './resolve-output-binding-sources.js';
import { createOutputReaderCode } from './create-output-reader-code.js';

export function createBoundRequestFragment(
  input: CreateBoundHttpRequestNodeInput,
  config: RequestMaterializationConfig,
): N8nNodeFragment {
  const sources = resolveOutputBindingSources(input);
  const runtime = readFileSync(
    new URL('../runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const validator = compileRequestValidator(config);
  const linked = input.itemMode === 'linked';
  const materialize = `OpenApiFlowRequestRuntime.materializeHttpRequest(config,responses,OpenApiFlowRequestValidator)`;
  const code = `${runtime}\n${validator}\nconst config=${javascriptJsonLiteral(config)};\n${linked ? `return $input.all().map((_,inputIndex)=>{${createOutputReaderCode(sources, true)}\nreturn {json:${materialize},pairedItem:{item:inputIndex}};});` : `${createOutputReaderCode(sources)}\nreturn [{json:${materialize}}];`}`;
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
    authentication: resolveCredentialBinding(input, input.credentialBindings),
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
    bindingSources: sources,
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

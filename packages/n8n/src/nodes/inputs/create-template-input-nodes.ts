import { readFileSync } from 'node:fs';
import { node } from '@n8n/workflow-sdk';
import type { CreateTemplateInputNodesInput } from '../../types/workflow-template.js';
import type { N8nNodeFragment } from '../../types/node-fragment.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';
import { compileTemplateInputValidators } from './compile-template-input-validators.js';
import { compileRequestValidator } from '../request/bindings/compile-request-validator.js';
import { compileStandaloneValidator } from '../common/validation/compile-standalone-validator.js';
import { createNativeFragment } from '../native/common/create-native-fragment.js';
import {
  TEMPLATE_INPUT_ID,
  TEMPLATE_INPUT_NAME,
  TEMPLATE_PREFLIGHT_ID,
  TEMPLATE_PREFLIGHT_NAME,
} from '../../workflow/templates/workflow-template-identities.js';

/** Compile immutable contracts; the user edits only the separate actual-value map. */
export function createTemplateInputNodes(
  input: CreateTemplateInputNodesInput,
): N8nNodeFragment[] {
  const validators = compileTemplateInputValidators(input.slots);
  const setup = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: TEMPLATE_INPUT_ID,
      name: TEMPLATE_INPUT_NAME,
      position: [220, 0],
      notes:
        '실제 값은 inputValues 객체에 슬롯 ID를 키로 추가하세요. 미입력 키는 생략하세요. 타입·스키마·revision은 바꾸지 마세요. 인증 비밀값은 n8n credential에 설정하세요.',
      notesInFlow: true,
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `// 실제 값만 입력하세요. 미입력 값에 임시 값을 넣지 마세요.\nconst inputValues=${javascriptJsonLiteral(input.inputValues)};\nreturn [{json:{revision:${input.revision},values:inputValues}}];`,
      },
    },
  });
  const runtime = readFileSync(
    new URL('../request/runtime/request-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  const nativeRuntime = readFileSync(
    new URL('../native/inputs/native-input-runtime.bundle.js', import.meta.url),
    'utf8',
  );
  // A request without runtime response dependencies can be checked completely
  // before any branch performs an external call. Dependent requests are checked
  // again by their materializers after the actual producers have executed.
  const earlyChecks = input.requests
    .filter((request) => !request.arguments.bindings.length)
    .map((request, index) => {
      const name = `OpenApiFlowInitialRequestValidator${index}`;
      return `${compileRequestValidator(request, name)}\nOpenApiFlowRequestRuntime.materializeHttpRequest(${javascriptJsonLiteral(request)},Object.create(null),${name},payload.values);`;
    });
  const nativeChecks = input.nativeParameters.map((material, index) => {
    const name = `OpenApiFlowInitialNativeValidator${index}`;
    return `${compileStandaloneValidator({ schema: material.schema, globalName: name })}\n{const parameters=OpenApiFlowNativeInputRuntime.materializeNativeRuntimeParameters(${javascriptJsonLiteral(material)},payload.values);if(!${name}(parameters))throw new Error('Native runtime input violates complete original schema for '+${javascriptJsonLiteral(material.nodeId)}+': '+JSON.stringify(${name}.errors));}`;
  });
  const preflight = node({
    type: 'n8n-nodes-base.code',
    version: 2,
    config: {
      id: TEMPLATE_PREFLIGHT_ID,
      name: TEMPLATE_PREFLIGHT_NAME,
      position: [440, 0],
      notes:
        '모든 초기 입력을 외부 호출 전에 검사합니다. 선행 응답을 사용하는 요청은 해당 응답을 합친 후 전송 직전에 전체 OAS를 다시 검사합니다. 부분 실행·pinning으로 검사를 건너뛰지 마세요.',
      notesInFlow: true,
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: `${runtime}\n${nativeRuntime}\nconst items=$input.all();if(items.length!==1)throw new Error('Workflow input setup requires exactly one JSON item');const payload=items[0].json;if(!payload||payload.revision!==${input.revision})throw new Error('Missing or stale workflow input revision');\n${validators}\n${nativeChecks.join('\n')}\n${earlyChecks.join('\n')}\nreturn [{json:payload,pairedItem:{item:0}}];`,
      },
    },
  });
  return [
    createNativeFragment(setup, ['main'], ['main']),
    createNativeFragment(preflight, ['main'], ['main']),
  ];
}

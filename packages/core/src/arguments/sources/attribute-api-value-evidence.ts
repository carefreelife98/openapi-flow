import { isDeepStrictEqual } from 'node:util';
import type { JsonValue } from '../../types/api-arguments.js';
import type {
  ApiValueEvidence,
  WorkflowApiValueContext,
  ApiValueEvidenceResolver,
} from '../../types/workflow-api-values.js';
import { createOriginalApiValueSourceResolver } from './create-original-api-value-source-resolver.js';
import { requestBindingSchemas } from '../../bindings/request-binding-schema.js';
import { unionBindingSchemas } from '../../bindings/combine-binding-schemas.js';
import { createSchemaResourceContext } from '../../bindings/resources/create-schema-resource-context.js';
import { listApiInputEnumCandidates } from '../enum/list-api-input-enum-candidates.js';
import { createOasValueValidator } from '../../openapi/common/create-oas-value-validator.js';

/** Attribute checked values in code. The model never supplies quotations or lexical locations. */
export function createApiValueEvidenceResolver(
  context: Pick<WorkflowApiValueContext, 'messages' | 'interpretSchemaChoices'>,
): ApiValueEvidenceResolver {
  const resolveSource = createOriginalApiValueSourceResolver(context.messages);
  return (input) => {
    const result: ApiValueEvidence = {
      literalSources: [],
      schemaSelections: [],
    };
    function visit(value: JsonValue, pointer: string): void {
      const source = resolveSource(value);
      if (source !== undefined) {
        result.literalSources.push({ ...source, targetPointer: pointer });
        return;
      }
      if (
        value !== null &&
        typeof value === 'object' &&
        Object.keys(value).length
      ) {
        for (const [key, child] of Object.entries(value))
          visit(
            child,
            `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`,
          );
        return;
      }
      if (context.interpretSchemaChoices) {
        const schemas = requestBindingSchemas(input.call, pointer);
        if (!schemas.length)
          throw new Error(
            `API ${input.call.callId}${pointer} has no OAS value contract`,
          );
        const validator = createOasValueValidator(
          unionBindingSchemas(schemas),
          input.call.operation.openapiVersion.startsWith('3.0.')
            ? 'openapi-3.0'
            : 'draft-2020-12',
          pointer,
        );
        const resources = createSchemaResourceContext(validator.schema);
        const candidates = listApiInputEnumCandidates({
          source: { kind: 'operation', ...input.call, targetPointer: pointer },
          schemas: [resources.reference(resources.root)],
          resources,
        });
        if (
          validator.validate(value).valid &&
          (typeof value === 'boolean' ||
            value === null ||
            candidates.some((candidate) =>
              isDeepStrictEqual(candidate.value, value),
            ))
        ) {
          result.schemaSelections.push({
            targetPointer: pointer,
            value: structuredClone(value),
          });
          return;
        }
      }
      throw new Error(
        `API ${input.call.callId}${pointer} value has no exact original input or permitted OAS choice`,
      );
    }
    for (const [root, value] of Object.entries(input.values))
      visit(value, `/${root}`);
    return result;
  };
}

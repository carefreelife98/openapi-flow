import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  describeApiLiteralGeneration,
  createApiLiteralGenerationRecord,
  applyConfirmedApiInputs,
  createApiRequestSchema,
  inspectApiArgumentRequirements,
  resolveApiLiteralProposalSources,
  runOpenApiFlowOperation,
  runOpenApiFlowAsyncOperation,
  isOpenApiFlowError,
  describeWorkflowConnectionApiRepair,
} from '@openapi-flow/core';
import type { ApiCallArguments } from '@openapi-flow/core';
import type {
  GenerateApiArgumentsInput,
  ApiLiteralGenerationOutput,
} from '../types/argument-generation.js';
import {
  apiLiteralGenerationOptionsSchema,
  createApiLiteralGenerationOutputSchema,
} from '../schemas/api-literal-generation-output-schema.js';
import {
  apiArgumentsPrompt,
  apiArgumentReplanningPrompt,
} from '../prompts/api-arguments-prompt.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { interpretApiArgumentEnums } from './interpret-api-argument-enums.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { resolveApiLiteralGenerationOutput } from './resolve-api-literal-generation-output.js';
import { apiArgumentRejectionsSchema } from '../schemas/api-argument-rejection-schema.js';
import { fingerprintApiArgumentSource } from './fingerprint-api-argument-source.js';
import { rethrowApiArgumentPlanningError } from './api-argument-planning-error.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';
import { apiMaterialRepairPrompt } from '../prompts/api-material-repair-prompt.js';
import { attributeApiLiteralGenerationSources } from './attribute-api-literal-generation-sources.js';
import { assertApiArgumentGenerationSource } from './assert-api-argument-generation-source.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';

export async function generateApiArguments(
  input: GenerateApiArgumentsInput,
): Promise<ApiCallArguments> {
  const {
    options,
    snapshot,
    contract,
    context,
    trackInputs,
    schema,
    validationSchema,
    sourceFingerprint,
    rejectedProposals,
    materialRepair,
  } = runOpenApiFlowOperation(
    {
      owner: 'langchain',
      operation: 'generateApiArguments',
      stage: 'input-validation',
      code: 'PLANNING_INPUT_INVALID',
    },
    () => {
      modelSignalSchema.parse(input.signal);
      if (
        input.model !== undefined &&
        (!input.model || typeof input.model.withStructuredOutput !== 'function')
      )
        throw new Error(
          'generateApiArguments.model must support structured output when supplied',
        );
      if (typeof input.callId !== 'string' || !input.callId.trim())
        throw new Error('callId must be non-empty');
      const options = apiLiteralGenerationOptionsSchema.parse({
        includeExplanations: input.includeExplanations,
        selectOasEnums: input.selectOasEnums,
        trackRequestedInputs: input.trackRequestedInputs,
      });
      const {
        input: snapshot,
        contract,
        context,
      } = describeApiLiteralGeneration(input);
      const materialRepair =
        input.materialRepair === undefined
          ? undefined
          : describeWorkflowConnectionApiRepair({
              stage: 'api-arguments',
              repair: input.materialRepair,
              planning: input,
            });
      const trackInputs =
        options.trackRequestedInputs === true ||
        options.selectOasEnums === true ||
        snapshot.literalSourceMessages !== undefined ||
        materialRepair !== undefined;
      const schema = createApiLiteralGenerationOutputSchema(
        contract,
        options.includeExplanations === true,
        trackInputs ? createApiRequestSchema(snapshot) : undefined,
        snapshot.literalSourceMessages,
        true,
        options.selectOasEnums === true,
      );
      const validationSchema = createApiLiteralGenerationOutputSchema(
        contract,
        options.includeExplanations === true,
        trackInputs ? createApiRequestSchema(snapshot) : undefined,
        snapshot.literalSourceMessages,
        false,
        options.selectOasEnums === true,
      );
      const sourceFingerprint = fingerprintApiArgumentSource(
        snapshot,
        options,
        materialRepair,
      );
      const rejectedProposals =
        input.rejectedProposals === undefined
          ? undefined
          : apiArgumentRejectionsSchema.parse(input.rejectedProposals);
      if (
        rejectedProposals?.some(
          (item) => item.sourceFingerprint !== sourceFingerprint,
        )
      )
        throw new Error(
          'API argument rejection feedback belongs to a different source',
        );
      if (!contract.hasLiteralInputs && rejectedProposals?.length)
        throw new Error(
          'API argument rejection feedback requires a literal model decision',
        );
      if (contract.hasLiteralInputs && !input.model)
        throw new Error(
          'generateApiArguments.model must support structured output when literal inputs remain',
        );
      return {
        options,
        snapshot,
        contract,
        context,
        trackInputs,
        schema,
        validationSchema,
        sourceFingerprint,
        rejectedProposals,
        materialRepair,
      };
    },
  );
  let proposed: ApiLiteralGenerationOutput = trackInputs
    ? {
        literalInputs: { state: 'not-provided' },
        requestedInputs: [],
        ...(options.selectOasEnums === true ? { enumIntentInputs: [] } : {}),
      }
    : { values: {} };
  if (contract.hasLiteralInputs) {
    const model = input.model;
    if (!model || typeof model.withStructuredOutput !== 'function')
      throw new Error(
        'generateApiArguments.model must support structured output when literal inputs remain',
      );
    try {
      proposed = await invokeStructuredModel<ApiLiteralGenerationOutput>({
        model,
        schema: serializeStructuredOutputSchema(schema, 'draft-2020-12'),
        operation: 'generateApiArguments',
        name: 'generate_api_arguments',
        method: 'functionCalling',
        // Preserve the existing provider-default strictness of literal generation.
        strict: undefined,
        signal: input.signal,
        messages: [
          new SystemMessage(
            [
              apiArgumentsPrompt,
              ...(rejectedProposals === undefined
                ? []
                : [apiArgumentReplanningPrompt]),
              ...(materialRepair === undefined
                ? []
                : [apiMaterialRepairPrompt]),
            ].join('\n'),
          ),
          new HumanMessage(
            JSON.stringify({
              ...context,
              ...(rejectedProposals === undefined ? {} : { rejectedProposals }),
              ...(materialRepair === undefined ? {} : { materialRepair }),
              ...(options.selectOasEnums === true
                ? { selectOasEnums: true }
                : {}),
            }),
          ),
        ],
      });
    } catch (error) {
      const cause = isOpenApiFlowError(error) ? error.cause : undefined;
      // The parser's documented raw output is retained as-is, never parsed/repaired from its message.
      const output =
        typeof cause === 'object' &&
        cause !== null &&
        Object.getOwnPropertyDescriptor(cause, 'lc_error_code')?.value ===
          'OUTPUT_PARSING_FAILURE'
          ? Object.getOwnPropertyDescriptor(cause, 'llmOutput')?.value
          : undefined;
      rethrowApiArgumentPlanningError(error, sourceFingerprint, output);
    }
  }
  let interpretingEnums = false;
  return runOpenApiFlowAsyncOperation(
    {
      owner: 'langchain',
      operation: 'generateApiArguments',
      stage: 'contract-validation',
      code: 'API_ARGUMENT_VALIDATION_FAILED',
    },
    async () => {
      assertApiArgumentGenerationSource(input, snapshot, materialRepair);
      const output = parseStructuredOutput<ApiLiteralGenerationOutput>(
        validationSchema,
        proposed,
        `model arguments for ${snapshot.callId}`,
      );
      const parsed = resolveApiLiteralGenerationOutput(output);
      const values = applyConfirmedApiInputs({
        ...snapshot,
        values: parsed.values,
      });
      const requestedInputs = parsed.requestedInputs;
      const literalSources =
        parsed.literalSources !== undefined
          ? resolveApiLiteralProposalSources({
              callId: snapshot.callId,
              values: parsed.values,
              sources: attributeApiLiteralGenerationSources(
                snapshot,
                parsed.literalSources,
              ),
              messages:
                snapshot.literalSourceMessages === undefined
                  ? [{ id: 'scenario', text: snapshot.scenario }]
                  : snapshot.literalSourceMessages,
            })
          : undefined;
      const inspection = inspectApiArgumentRequirements({
        ...snapshot,
        values,
        requestedInputs,
      });
      const result: ApiCallArguments = {
        callId: snapshot.callId,
        values,
        bindings: structuredClone(snapshot.bindings),
        unresolvedInputs: inspection.requirements.map(
          (item) => item.targetPointer,
        ),
        ...(literalSources === undefined ? {} : { literalSources }),
        ...(requestedInputs === undefined ? {} : { requestedInputs }),
        ...(snapshot.requestMediaType === undefined
          ? {}
          : { requestMediaType: snapshot.requestMediaType }),
        ...(options.includeExplanations === true
          ? {
              literalGeneration: createApiLiteralGenerationRecord({
                ...snapshot,
                ...(contract.hasLiteralInputs
                  ? {
                      proposal: { values: parsed.values },
                      ...(parsed.explanation === undefined
                        ? {}
                        : { reason: parsed.explanation.reason }),
                    }
                  : {}),
              }),
            }
          : {}),
      };
      if (options.selectOasEnums === true) {
        if (parsed.enumIntentInputs === undefined)
          throw new Error(
            'generateApiArguments requires explicit enumIntentInputs when selectOasEnums is true',
          );
        if (literalSources === undefined)
          throw new Error(
            'generateApiArguments enum interpretation requires source-verified literalSources',
          );
        interpretingEnums = true;
        const interpreted = await interpretApiArgumentEnums({
          ...snapshot,
          ...options,
          arguments: result,
          proposal: { values: parsed.values },
          literalSources,
          enumIntentInputs: parsed.enumIntentInputs,
          model: input.model,
          signal: input.signal,
        });
        assertApiArgumentGenerationSource(input, snapshot, materialRepair);
        return interpreted;
      }
      return result;
    },
  ).catch((error: unknown) => {
    if (interpretingEnums || !contract.hasLiteralInputs) throw error;
    rethrowApiArgumentPlanningError(error, sourceFingerprint, proposed);
  });
}

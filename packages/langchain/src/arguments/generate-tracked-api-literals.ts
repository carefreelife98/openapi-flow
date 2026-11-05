import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createApiRequestSchema,
  describeApiLiteralTargets,
  runOpenApiFlowOperation,
} from '@openapi-flow/core';
import type { ApiLiteralGenerationOutput } from '../types/argument-generation.js';
import type {
  TrackedApiLiteralPlanningInput,
  TrackedApiLiteralPlanningResult,
} from '../types/tracked-api-literal-planning.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { createApiLiteralTargetPlanSchema } from '../schemas/api-literal-target-plan-schema.js';
import { createApiLiteralGenerationOutputSchema } from '../schemas/api-literal-generation-output-schema.js';
import { createScopedApiLiteralOutputSchema } from '../schemas/create-scoped-api-literal-output-schema.js';
import { rethrowApiArgumentPlanningError } from './api-argument-planning-error.js';
import { apiLiteralTargetsPrompt } from '../prompts/api-literal-targets-prompt.js';
import {
  apiArgumentsPrompt,
  apiArgumentReplanningPrompt,
} from '../prompts/api-arguments-prompt.js';
import { apiMaterialRepairPrompt } from '../prompts/api-material-repair-prompt.js';
import { describeApiLiteralSourceChoices } from './describe-api-literal-source-choices.js';

/** Two semantic decisions, no hidden retry: select destinations, then OAS-scoped original sources. */
export async function generateTrackedApiLiterals(
  input: TrackedApiLiteralPlanningInput,
): Promise<TrackedApiLiteralPlanningResult> {
  const requestSchema = createApiRequestSchema(input.input);
  const targetSchema = createApiLiteralTargetPlanSchema(
    requestSchema,
    input.options.includeExplanations === true,
  );
  const targetValidationSchema = createApiLiteralTargetPlanSchema(
    requestSchema,
    input.options.includeExplanations === true,
    false,
  );
  const context = {
    ...input.context,
    ...(input.rejectedProposals === undefined
      ? {}
      : { rejectedProposals: input.rejectedProposals }),
    ...(input.materialRepair === undefined
      ? {}
      : { materialRepair: input.materialRepair }),
  };
  const raw = await invokeStructuredModel({
    model: input.model,
    schema: serializeStructuredOutputSchema(targetSchema, 'draft-2020-12'),
    operation: 'generateApiArguments',
    name: 'select_api_literal_targets',
    method: 'functionCalling',
    strict: undefined,
    signal: input.signal,
    messages: [
      new SystemMessage(
        [
          apiLiteralTargetsPrompt,
          ...(input.rejectedProposals === undefined
            ? []
            : [apiArgumentReplanningPrompt]),
          ...(input.materialRepair === undefined
            ? []
            : [apiMaterialRepairPrompt]),
        ].join('\n'),
      ),
      new HumanMessage(JSON.stringify(context)),
    ],
  });
  input.assertSourceUnchanged();
  const plan = (() => {
    try {
      return parseStructuredOutput(
        targetValidationSchema,
        raw,
        'API literal destinations',
      );
    } catch (error) {
      rethrowApiArgumentPlanningError(error, input.sourceFingerprint, raw);
    }
  })();
  const targets = (() => {
    try {
      return runOpenApiFlowOperation(
        {
          owner: 'langchain',
          operation: 'generateApiArguments',
          stage: 'contract-validation',
          code: 'API_ARGUMENT_VALIDATION_FAILED',
        },
        () =>
          plan.literalInputs.state === 'provided'
            ? describeApiLiteralTargets(
                input.contract,
                plan.literalInputs.targetPointers,
              )
            : [],
      );
    } catch (error) {
      rethrowApiArgumentPlanningError(error, input.sourceFingerprint, raw);
    }
  })();
  const validationSchema = createApiLiteralGenerationOutputSchema(
    input.contract,
    input.options.includeExplanations === true,
    requestSchema,
    input.messages,
    false,
    false,
    targets,
  );
  if (plan.literalInputs.state === 'not-provided') {
    const proposal: ApiLiteralGenerationOutput = {
      literalInputs: { state: 'not-provided' },
      requestedInputs: plan.requestedInputs,
      ...('explanation' in plan && plan.explanation !== undefined
        ? { explanation: plan.explanation }
        : {}),
    };
    return { proposal, validationSchema };
  }
  const sourceSchema = createScopedApiLiteralOutputSchema(
    input.contract,
    input.options.includeExplanations === true,
    requestSchema,
    input.messages,
    targets,
    plan.requestedInputs,
  );
  const wire = serializeStructuredOutputSchema(sourceSchema, 'draft-2020-12');
  const output = await invokeStructuredModel<ApiLiteralGenerationOutput>({
    model: input.model,
    schema: wire,
    operation: 'generateApiArguments',
    name: 'generate_api_arguments',
    method: 'functionCalling',
    strict: undefined,
    signal: input.signal,
    messages: [
      new SystemMessage(
        [
          apiArgumentsPrompt,
          ...(input.rejectedProposals === undefined
            ? []
            : [apiArgumentReplanningPrompt]),
          ...(input.materialRepair === undefined
            ? []
            : [apiMaterialRepairPrompt]),
        ].join('\n'),
      ),
      new HumanMessage(
        JSON.stringify({
          ...context,
          literalTargets: targets.map((t) => t.targetPointer),
          literalSourceChoices: describeApiLiteralSourceChoices(
            input.messages,
            targets,
          ),
          requestedInputs: plan.requestedInputs,
          ...(input.options.selectOasEnums === true
            ? { selectOasEnums: true }
            : {}),
        }),
      ),
    ],
  });
  return {
    proposal: output,
    validationSchema: createScopedApiLiteralOutputSchema(
      input.contract,
      input.options.includeExplanations === true,
      requestSchema,
      input.messages,
      targets,
      plan.requestedInputs,
      false,
    ),
  };
}

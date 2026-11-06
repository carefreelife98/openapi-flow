import { isDeepStrictEqual } from 'node:util';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
  compileWorkflowApiArguments,
  validateWorkflowInputCatalog,
  describeApiLiteralGeneration,
  describeWorkflowApiArgumentTargets,
  describeWorkflowInputSourceChoices,
  runOpenApiFlowAsyncOperation,
  workflowApiArgumentPlanSchema,
  fingerprintWorkflowApiArgumentContext,
} from '@openapi-flow/core';
import type {
  WorkflowApiArgumentPlanProposal,
  WorkflowApiArgumentContext,
  CompiledWorkflowApiArguments,
} from '@openapi-flow/core';
import type { GenerateWorkflowApiArgumentsInput } from '../types/workflow-api-arguments.js';
import { createWorkflowApiArgumentGenerationSchema } from '../schemas/workflow-api-argument-generation-schema.js';
import { serializeStructuredOutputSchema } from '../schemas/serialize-structured-output-schema.js';
import { invokeStructuredModel } from '../model/invoke-structured-model.js';
import { parseStructuredOutput } from '../legacy/planning/parse-structured-output.js';
import { workflowApiArgumentsPrompt } from '../prompts/workflow-api-arguments-prompt.js';
import { interpretApiArgumentEnums } from './interpret-api-argument-enums.js';
import { modelSignalSchema } from '../schemas/model-signal-schema.js';
import { listRequestedApiEnumTargets } from './list-requested-api-enum-targets.js';

/** One shared planning call, code-owned evidence and independently checked call outcomes. */
export async function generateWorkflowApiArguments(
  input: GenerateWorkflowApiArgumentsInput,
): Promise<CompiledWorkflowApiArguments> {
  modelSignalSchema.parse(input.signal);
  input.signal?.throwIfAborted();
  const snapshot: WorkflowApiArgumentContext = structuredClone({
    scenario: input.scenario,
    calls: input.calls,
    catalog: validateWorkflowInputCatalog(input.catalog),
  });
  if (
    !snapshot.calls.length ||
    new Set(snapshot.calls.map((call) => call.callId)).size !==
      snapshot.calls.length
  )
    throw new Error(
      'Workflow argument planning requires distinct nonempty call identities',
    );
  const descriptions = snapshot.calls.map((call) =>
    describeApiLiteralGeneration({
      ...call,
      scenario: snapshot.scenario,
      literalSourceMessages: snapshot.catalog.messages,
    }),
  );
  const schema = createWorkflowApiArgumentGenerationSchema(snapshot);
  for (const rejection of input.rejectedCalls === undefined
    ? []
    : input.rejectedCalls) {
    const call = snapshot.calls.find(
      (entry) => entry.callId === rejection.callId,
    );
    if (
      call === undefined ||
      typeof rejection.reason !== 'string' ||
      rejection.sourceFingerprint !==
        fingerprintWorkflowApiArgumentContext({ ...snapshot, calls: [call] })
    )
      throw new Error(
        'Workflow API argument rejection does not match the current call contract',
      );
  }
  let plan: WorkflowApiArgumentPlanProposal;
  if (
    descriptions.every((description) => !description.contract.hasLiteralInputs)
  ) {
    plan = {
      calls: Object.fromEntries(
        snapshot.calls.map((call) => [
          call.callId,
          { assignments: [], requestedInputs: [] },
        ]),
      ),
    };
  } else {
    if (!input.model || typeof input.model.withStructuredOutput !== 'function')
      throw new Error(
        'Workflow argument planning requires a structured-output model',
      );
    plan = await invokeStructuredModel<WorkflowApiArgumentPlanProposal>({
      model: input.model,
      schema: serializeStructuredOutputSchema(
        schema,
        'draft-2020-12',
        'output',
        'ref',
      ),
      operation: 'generateWorkflowApiArguments',
      name: 'generate_workflow_api_arguments',
      method: 'functionCalling',
      strict: true,
      signal: input.signal,
      messages: [
        new SystemMessage(workflowApiArgumentsPrompt),
        new HumanMessage(
          JSON.stringify({
            scenario: snapshot.scenario,
            sources: snapshot.catalog.sources,
            calls: descriptions.map(({ input: call, context }) => ({
              callId: call.callId,
              purpose: call.purpose,
              operation: context.operation,
              literalInputSchema: context.literalInputSchema,
              targets: describeWorkflowApiArgumentTargets(call).map(
                (target) => {
                  const choices = describeWorkflowInputSourceChoices(
                    snapshot.catalog,
                    target.template.types,
                  );
                  return {
                    ...target,
                    jsonSourceIds: choices.json.map((entry) => entry.id),
                    textSourceIds: choices.text.map((entry) => entry.id),
                  };
                },
              ),
            })),
            ...(input.rejectedCalls === undefined
              ? {}
              : { rejectedCalls: input.rejectedCalls }),
            ...(input.selectOasEnums === true ? { selectOasEnums: true } : {}),
          }),
        ),
      ],
    });
  }
  input.signal?.throwIfAborted();
  if (
    !isDeepStrictEqual(snapshot, {
      scenario: input.scenario,
      calls: input.calls,
      catalog: input.catalog,
    })
  )
    throw new Error(
      'Workflow argument sources or call contracts changed while planning',
    );
  const parsed = parseStructuredOutput(
    schema,
    plan,
    'Workflow API argument plan',
  );
  const result = await runOpenApiFlowAsyncOperation(
    {
      owner: 'langchain',
      operation: 'generateWorkflowApiArguments',
      stage: 'contract-validation',
      code: 'API_ARGUMENT_VALIDATION_FAILED',
    },
    async () =>
      compileWorkflowApiArguments({
        ...snapshot,
        plan: workflowApiArgumentPlanSchema.parse({
          ...parsed,
          sourceFingerprint: fingerprintWorkflowApiArgumentContext(snapshot),
        }),
      }),
  );
  if (input.selectOasEnums === true) {
    for (const [index, args] of result.arguments.entries()) {
      const description = descriptions.find(
        (entry) => entry.input.callId === args.callId,
      );
      if (
        description === undefined ||
        args.literalSources === undefined ||
        args.requestedInputs === undefined
      )
        throw new Error(
          'Compiled workflow argument record is missing its original call or sources',
        );
      const record = args.literalGeneration;
      if (record === undefined)
        throw new Error(
          'Compiled workflow argument record is missing its literal proposal',
        );
      const proposal = {
        values:
          record.kind === 'proposed-literals' ? record.proposedValues : {},
      };
      const enumIntentInputs = listRequestedApiEnumTargets({
        ...description.input,
        proposal,
        literalSources: args.literalSources,
        requestedInputs: args.requestedInputs,
      });
      result.arguments[index] = await interpretApiArgumentEnums({
        ...description.input,
        arguments: args,
        proposal,
        literalSources: args.literalSources,
        enumIntentInputs,
        model: input.model,
        selectOasEnums: true,
        signal: input.signal,
      });
    }
  }
  if (
    !isDeepStrictEqual(snapshot, {
      scenario: input.scenario,
      calls: input.calls,
      catalog: input.catalog,
    })
  )
    throw new Error(
      'Workflow argument sources or call contracts changed during enum interpretation',
    );
  return result;
}

import { readFile, writeFile } from 'node:fs/promises';
import { ZodError } from 'zod';
import { validateOpenApi } from '@openapi-flow/core';
import { configurationSchema } from '../schemas/configuration-schema.js';
import { createOpenAiCompatibleModel } from '../model/create-openai-compatible-model.js';
import { createWorkflowGenerationGraph } from '../graph/create-single-call-workflow-generation-graph.js';

async function generate(): Promise<void> {
  const config = configurationSchema.parse(process.env);
  const sources = await Promise.all(
    config.OAS_SOURCES_JSON.map(async (source) => ({
      id: source.id,
      spec: validateOpenApi(JSON.parse(await readFile(source.file, 'utf8'))),
    })),
  );
  const graph = createWorkflowGenerationGraph({
    model: createOpenAiCompatibleModel(config),
    deployments: config.DEPLOYMENTS_JSON,
  });
  const result = await graph.invoke({
    workflowId: config.WORKFLOW_ID,
    workflowName: config.WORKFLOW_NAME,
    scenario: config.SCENARIO,
    sources,
    trace: [],
  });
  if (!result.workflow) throw new Error('Graph ended without a workflow');
  await writeFile(
    config.OUTPUT_FILE,
    JSON.stringify(result.workflow, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Generated ${config.OUTPUT_FILE}. Review before importing or executing; no business API was called.`,
  );
}

generate().catch((error: unknown) => {
  // Provider exceptions can contain request headers. Never dump the raw error.
  if (error instanceof ZodError) {
    console.error(
      `Invalid example configuration: ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  } else {
    console.error(
      error instanceof Error
        ? `Workflow generation failed (${error.name}); inspect the failing graph stage without logging credentials.`
        : 'Workflow generation failed.',
    );
  }
  process.exitCode = 1;
});

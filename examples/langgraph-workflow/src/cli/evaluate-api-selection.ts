import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { ChatOpenAI } from '@langchain/openai';
import { evaluationModelHeadersSchema } from '../schemas/api-selection-evaluation-schema.js';
import { prepareApiSelectionEvaluation } from '../evaluation/selection/prepare-api-selection-evaluation.js';
import { runApiSelectionEvaluation } from '../evaluation/selection/run-api-selection-evaluation.js';
import { SelectionEvaluationObserver } from '../evaluation/selection/selection-evaluation-observer.js';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

const validateOnly =
  process.argv.length === 3 && process.argv[2] === '--validate-only';
if (process.argv.length > (validateOnly ? 3 : 2))
  throw new Error('Only --validate-only is supported');
const prepared = await prepareApiSelectionEvaluation(
  requiredEnv('OPENAPI_FLOW_EVAL_CASES'),
);
if (validateOnly) {
  console.log(
    JSON.stringify({
      valid: true,
      datasetSha256: prepared.datasetSha256,
      documents: prepared.documents,
      cases: prepared.dataset.cases.length,
      repeats: prepared.dataset.repeats,
    }),
  );
} else {
  const outputPath = requiredEnv('OPENAPI_FLOW_EVAL_OUTPUT');
  if (existsSync(outputPath))
    throw new Error(
      'OPENAPI_FLOW_EVAL_OUTPUT already exists; use a fresh run path',
    );
  const modelName = requiredEnv('LLM_MODEL');
  const baseURL = requiredEnv('LLM_BASE_URL');
  if (new URL(baseURL).protocol !== 'https:')
    throw new Error('LLM_BASE_URL must use HTTPS');
  const headers = process.env.LLM_HEADERS_JSON;
  const observer = new SelectionEvaluationObserver();
  const model = new ChatOpenAI({
    model: modelName,
    apiKey: requiredEnv('LLM_API_KEY'),
    maxRetries: 0,
    timeout: 60_000,
    temperature: 0,
    callbacks: [observer],
    configuration: {
      baseURL,
      ...(headers === undefined
        ? {}
        : {
            defaultHeaders: evaluationModelHeadersSchema.parse(
              JSON.parse(headers),
            ),
          }),
    },
  });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath + '.attempts.jsonl', '', { flag: 'wx' });
  const report = await runApiSelectionEvaluation({
    prepared,
    model,
    modelLabel: modelName,
    modelSettings: { temperature: 0, maxRetries: 0, timeoutMs: 60_000 },
    observer,
    onAttempt: async (attempt) => {
      await writeFile(
        outputPath + '.attempts.jsonl',
        JSON.stringify(attempt) + '\n',
        { flag: 'a' },
      );
      console.log(
        JSON.stringify({
          caseId: attempt.caseId,
          repetition: attempt.repetition,
          status: attempt.status,
          exact: attempt.score.exact,
        }),
      );
    },
  });
  await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(
    JSON.stringify({
      complete: report.complete,
      planned: report.planned,
      unattempted: report.unattempted,
      summary: report.summary,
      cohorts: report.cohorts,
    }),
  );
  if (
    !report.complete ||
    report.summary.rejected > 0 ||
    report.summary.exactMatch.numerator !==
      report.summary.exactMatch.denominator
  )
    process.exitCode = 1;
}

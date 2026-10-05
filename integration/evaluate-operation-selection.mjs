import console from 'node:console';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { operationsFromSpec } from '@openapi-flow/core';
import { selectOperationFromCandidates } from '../packages/langchain/dist/legacy/planning/select-operation.js';

const casesPath = requiredEnv('OPENAPI_FLOW_EVAL_CASES');
const validateOnly =
  process.argv.length === 3 && process.argv[2] === '--validate-only';
if (process.argv.length > (validateOnly ? 3 : 2)) {
  throw new Error('Only --validate-only is supported');
}

const dataset = JSON.parse(await readFile(casesPath, 'utf8'));
if (
  !isObject(dataset) ||
  dataset.version !== 1 ||
  !Array.isArray(dataset.suites) ||
  dataset.suites.length === 0
) {
  throw new Error(
    'evaluation dataset must contain version 1 and non-empty suites',
  );
}

const preparedSuites = [];
const suiteIds = new Set();
for (const suite of dataset.suites) {
  if (!isObject(suite) || !nonEmpty(suite.id) || suiteIds.has(suite.id)) {
    throw new Error('evaluation suite.id must be unique and non-empty');
  }
  suiteIds.add(suite.id);
  if (
    Number(Object.hasOwn(suite, 'specFile')) +
      Number(Object.hasOwn(suite, 'specUrl')) !==
      1 ||
    (Object.hasOwn(suite, 'specFile') && !nonEmpty(suite.specFile)) ||
    (Object.hasOwn(suite, 'specUrl') && !nonEmpty(suite.specUrl))
  ) {
    throw new Error(
      `suite ${suite.id} must have exactly one specFile or specUrl`,
    );
  }
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new Error(`suite ${suite.id}.cases must be non-empty`);
  }
  const spec = await loadSpec(suite, dirname(resolve(casesPath)));
  const specSha256 = createHash('sha256')
    .update(JSON.stringify(spec))
    .digest('hex');
  const operations = await operationsFromSpec(spec);
  const refs = new Set(operations.map(({ operationRef }) => operationRef));
  const caseIds = new Set();
  for (const entry of suite.cases) {
    if (!isObject(entry) || !nonEmpty(entry.id) || caseIds.has(entry.id)) {
      throw new Error(`suite ${suite.id} has an invalid or duplicate case.id`);
    }
    caseIds.add(entry.id);
    if (
      !nonEmpty(entry.scenario) ||
      entry.scenario.length > 2_000 ||
      !nonEmpty(entry.expectedOperationRef) ||
      !refs.has(entry.expectedOperationRef)
    ) {
      throw new Error(
        `suite ${suite.id} case ${entry.id} has an invalid scenario or expectedOperationRef`,
      );
    }
  }
  preparedSuites.push({ id: suite.id, operations, cases: suite.cases });
  console.log(
    JSON.stringify({
      suite: suite.id,
      operations: operations.length,
      cases: suite.cases.length,
      specSha256,
      valid: true,
    }),
  );
}

if (!validateOnly) {
  const modelName = requiredEnv('MODEL_NAME');
  const modelBaseUrl = requiredEnv('LLM_BASE_URL');
  const modelApiKey = requiredEnv('LLM_API_KEY');
  if (new URL(modelBaseUrl).protocol !== 'https:') {
    throw new Error('LLM_BASE_URL must use HTTPS');
  }
  const modelHeaderName = process.env.LLM_MODEL_HEADER_NAME;
  if (modelHeaderName !== undefined && !nonEmpty(modelHeaderName)) {
    throw new Error('LLM_MODEL_HEADER_NAME must be non-empty when provided');
  }
  const model = new ChatOpenAI({
    model: modelName,
    apiKey: modelApiKey,
    maxRetries: 0,
    configuration: {
      baseURL: modelBaseUrl,
      defaultHeaders: modelHeaderName ? { [modelHeaderName]: modelName } : {},
    },
  });
  let total = 0;
  let correct = 0;
  let totalDurationMs = 0;
  for (const suite of preparedSuites) {
    let suiteCorrect = 0;
    let suiteTotal = 0;
    for (const entry of suite.cases) {
      const started = performance.now();
      let actual;
      try {
        actual = await selectOperationFromCandidates(
          suite.operations,
          entry.scenario,
          model,
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            suite: suite.id,
            case: entry.id,
            error: error instanceof Error ? error.name : 'UnknownError',
            status:
              typeof error?.status === 'number' ? error.status : undefined,
          }),
        );
        process.exitCode = 1;
        break;
      }
      const durationMs = Math.round(performance.now() - started);
      const match = actual === entry.expectedOperationRef;
      total += 1;
      correct += Number(match);
      suiteTotal += 1;
      suiteCorrect += Number(match);
      totalDurationMs += durationMs;
      console.log(
        JSON.stringify({
          suite: suite.id,
          case: entry.id,
          expected: entry.expectedOperationRef,
          actual,
          match,
          durationMs,
        }),
      );
    }
    console.log(
      JSON.stringify({
        suite: suite.id,
        total: suiteTotal,
        correct: suiteCorrect,
        accuracy: suiteTotal ? suiteCorrect / suiteTotal : null,
      }),
    );
    if (process.exitCode) break;
  }
  console.log(
    JSON.stringify({
      total,
      correct,
      accuracy: total ? correct / total : null,
      averageDurationMs: total ? Math.round(totalDurationMs / total) : null,
      complete: !process.exitCode,
    }),
  );
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!nonEmpty(value)) throw new Error(`${name} is required`);
  return value;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function loadSpec(suite, datasetDirectory) {
  if (nonEmpty(suite.specFile)) {
    return JSON.parse(
      await readFile(resolve(datasetDirectory, suite.specFile), 'utf8'),
    );
  }
  const url = new URL(suite.specUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`suite ${suite.id}.specUrl must use HTTPS`);
  }
  const response = await globalThis.fetch(url, {
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `suite ${suite.id}.specUrl returned HTTP ${response.status}`,
    );
  }
  return response.json();
}

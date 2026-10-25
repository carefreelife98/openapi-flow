import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OpenApiFlowError,
  isOpenApiFlowError,
  openApiFlowDiagnosticSchema,
  runOpenApiFlowOperation,
  runOpenApiFlowAsyncOperation,
  validateOpenApi,
  validateApiBindingAssignments,
  validateApiBindingGaps,
} from '@openapi-flow/core';
import {
  planApiBindings,
  selectApiOperations,
  NativeNodePlanningError,
  WorkflowGraphPlanningError,
  ReviewableWorkflowGraphPlanningError,
} from '@openapi-flow/langchain';
import {
  compileN8nWorkflowTemplate,
  compilePlannedN8nWorkflow,
} from '@openapi-flow/n8n';
import { OutputParserException } from '@langchain/core/output_parsers';
import {
  bindingPlanningFixture,
  bindingPlanningModel,
} from './fixtures/binding-planning-record-fixture.mjs';
import { bindingPlan } from './fixtures/request-binding-fixture.mjs';
import { apiSelectionExplanationsFixture } from './fixtures/api-selection-explanations-fixture.mjs';

const boundary = {
  owner: 'core',
  operation: 'validateApiBindingAssignments',
  stage: 'contract-validation',
  code: 'API_BINDING_VALIDATION_FAILED',
};

test('public error preserves exact private cause and exposes only the closed diagnostic', () => {
  const cause = Object.assign(new Error('secret-message'), {
    headers: { authorization: 'secret-token' },
    response: 'secret-response',
  });
  const error = new OpenApiFlowError({
    message: 'secret-message',
    diagnostic: boundary,
    cause,
  });
  assert.ok(error instanceof Error);
  assert.equal(error.cause, cause);
  assert.ok(isOpenApiFlowError(error));
  assert.equal(isOpenApiFlowError({ diagnostic: boundary }), false);
  assert.equal(isOpenApiFlowError(new Error('ordinary')), false);
  assert.deepEqual(JSON.parse(JSON.stringify(error)), boundary);
  assert.equal(JSON.stringify(error).includes('secret'), false);
  assert.ok(Object.isFrozen(error.diagnostic));
  assert.throws(() => {
    error.diagnostic.code = 'MODEL_TIMEOUT';
  }, TypeError);
  assert.equal(
    openApiFlowDiagnosticSchema.safeParse({ ...boundary, cause }).success,
    false,
  );
  assert.equal(
    openApiFlowDiagnosticSchema.safeParse({ ...boundary, httpStatus: 999 })
      .success,
    false,
  );
  assert.equal(
    openApiFlowDiagnosticSchema.safeParse({
      ...boundary,
      code: 'API_BINDING_CALL_COVERAGE_MISMATCH',
    }).success,
    false,
  );
});

test('boundaries never replace a known typed failure and preserve primitive causes without guessing', async () => {
  const original = new OpenApiFlowError({
    message: 'known',
    diagnostic: boundary,
  });
  assert.throws(
    () =>
      runOpenApiFlowOperation(boundary, () => {
        throw original;
      }),
    (error) => error === original,
  );
  await assert.rejects(
    runOpenApiFlowAsyncOperation(boundary, async () => {
      throw original;
    }),
    (error) => error === original,
  );
  assert.throws(
    () =>
      runOpenApiFlowOperation(boundary, () => {
        throw 'private-primitive';
      }),
    (error) => {
      assert.equal(error.cause, 'private-primitive');
      assert.equal(error.diagnostic.code, boundary.code);
      assert.equal(JSON.stringify(error).includes('private-primitive'), false);
      return true;
    },
  );
});

test('OAS failures retain standard validation and expose a core-owned input failure', () => {
  assert.throws(
    () => validateOpenApi({ openapi: '3.1.0' }),
    (error) => {
      assert.ok(error instanceof OpenApiFlowError);
      assert.equal(error.diagnostic.code, 'OAS_VALIDATION_FAILED');
      assert.equal(error.diagnostic.stage, 'input-validation');
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
});

test('binding coverage reports exact numeric counts, without exposing call identities', async () => {
  const input = bindingPlanningFixture();
  for (const calls of [
    bindingPlan.calls.slice(1),
    bindingPlan.calls.map(() => bindingPlan.calls[0]),
  ]) {
    const model = bindingPlanningModel({ calls, gaps: [] });
    await assert.rejects(planApiBindings({ ...input, model }), (error) => {
      assert.equal(error.diagnostic.code, 'API_BINDING_CALL_COVERAGE_MISMATCH');
      assert.equal(error.diagnostic.owner, 'core');
      assert.equal(error.diagnostic.stage, 'contract-validation');
      assert.equal(error.diagnostic.expectedCount, input.materials.length);
      assert.equal(error.diagnostic.actualCount, calls.length);
      assert.equal(
        error.diagnostic.distinctCount,
        new Set(calls.map((call) => call.callId)).size,
      );
      assert.equal(
        error.message,
        'binding plan must name every material callId exactly once',
      );
      return true;
    });
    assert.equal(model.calls, 1);
  }
});

test('binding pointer rejection and gap rejection remain contract errors rather than model errors', () => {
  const input = bindingPlanningFixture();
  const calls = globalThis.structuredClone(bindingPlan.calls);
  calls.find((call) => call.bindings.length).bindings[0].sourcePointer =
    '/not-declared';
  assert.throws(
    () => validateApiBindingAssignments({ ...input, calls }),
    (error) => {
      assert.equal(error.diagnostic.code, 'API_BINDING_VALIDATION_FAILED');
      assert.ok(error.cause instanceof Error);
      return true;
    },
  );
  assert.throws(
    () =>
      validateApiBindingGaps({
        ...input,
        plan: {
          calls: bindingPlan.calls,
          gaps: [
            {
              callId: input.materials[0].callId,
              targetPointer: '/not-declared',
              description: 'Required dependency',
            },
          ],
        },
      }),
    (error) => {
      assert.equal(error.diagnostic.code, 'API_BINDING_GAP_INVALID');
      return true;
    },
  );
});

test('overlapping targets and cyclic dependencies have distinct source-owned codes', () => {
  const input = bindingPlanningFixture();
  const overlapping = globalThis.structuredClone(bindingPlan.calls);
  const bound = overlapping.find((call) => call.bindings.length);
  bound.bindings.push(globalThis.structuredClone(bound.bindings[0]));
  assert.throws(
    () => validateApiBindingAssignments({ ...input, calls: overlapping }),
    (error) => error.diagnostic.code === 'API_BINDING_TARGET_OVERLAP',
  );
  const cyclic = globalThis.structuredClone(bindingPlan.calls);
  const detail = cyclic.find((call) => call.callId === 'detail');
  const price = cyclic.find((call) => call.callId === 'price');
  detail.bindings[0].sourceNodeId = 'price';
  price.bindings.find(
    (binding) => binding.targetPointer === '/query/id',
  ).sourceNodeId = 'detail';
  assert.throws(
    () => validateApiBindingAssignments({ ...input, calls: cyclic }),
    (error) => error.diagnostic.code === 'API_BINDING_CYCLE',
  );
});

test('invalid planner input fails before any model invocation', async () => {
  const model = bindingPlanningModel(bindingPlan);
  await assert.rejects(
    planApiBindings({ ...bindingPlanningFixture(), scenario: '', model }),
    (error) => error.diagnostic.code === 'PLANNING_INPUT_INVALID',
  );
  assert.equal(model.calls, 0);
});

test('structured-output setup and invoke failures are distinct, preserve cause, and never retry', async () => {
  for (const mode of ['configuration', 'invocation']) {
    const cause = Object.assign(new Error('secret URL and token'), {
      status: 503,
    });
    let calls = 0;
    const model = {
      withStructuredOutput() {
        if (mode === 'configuration') throw cause;
        return {
          async invoke() {
            calls++;
            throw cause;
          },
        };
      },
    };
    await assert.rejects(
      planApiBindings({ ...bindingPlanningFixture(), model }),
      (error) => {
        assert.equal(error.cause, cause);
        assert.equal(
          error.diagnostic.code,
          mode === 'configuration'
            ? 'MODEL_CONFIGURATION_FAILED'
            : 'MODEL_INVOCATION_FAILED',
        );
        assert.equal(
          error.diagnostic.httpStatus,
          mode === 'configuration' ? undefined : 503,
        );
        assert.equal(JSON.stringify(error).includes('secret'), false);
        return true;
      },
    );
    assert.equal(calls, mode === 'configuration' ? 0 : 1);
  }
});

test('only recognized output-parser exceptions are identified as model-output errors', async () => {
  for (const cause of [
    new OutputParserException('secret parser text'),
    new Error('timeout HTTP 400 secret-text'),
  ]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            throw cause;
          },
        };
      },
    };
    await assert.rejects(
      planApiBindings({ ...bindingPlanningFixture(), model }),
      (error) => {
        assert.equal(error.cause, cause);
        assert.equal(
          error.diagnostic.code,
          cause instanceof OutputParserException
            ? 'MODEL_OUTPUT_INVALID'
            : 'MODEL_INVOCATION_FAILED',
        );
        assert.equal(error.diagnostic.httpStatus, undefined);
        return true;
      },
    );
  }
});

test('canonical timeout and cancellation identities remain distinct, without name-string heuristics', async () => {
  for (const name of ['TimeoutError', 'AbortError']) {
    const cause = new globalThis.DOMException('private reason', name);
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            throw cause;
          },
        };
      },
    };
    await assert.rejects(
      planApiBindings({ ...bindingPlanningFixture(), model }),
      (error) => {
        assert.equal(
          error.diagnostic.code,
          name === 'TimeoutError' ? 'MODEL_TIMEOUT' : 'MODEL_ABORTED',
        );
        assert.equal(error.cause, cause);
        return true;
      },
    );
  }
});

test('diagnostics do not invoke status getters or infer statuses and timeout identity from alternate fields', async () => {
  for (const cause of [
    Object.assign(new Error('HTTP 400'), { status: '400', statusCode: 400 }),
    Object.assign(new Error('timeout'), { name: 'TimeoutError', status: 999 }),
    Object.defineProperty(new Error('private'), 'status', {
      get() {
        throw new Error('must not invoke');
      },
    }),
  ]) {
    const model = {
      withStructuredOutput() {
        return {
          async invoke() {
            throw cause;
          },
        };
      },
    };
    await assert.rejects(
      planApiBindings({ ...bindingPlanningFixture(), model }),
      (error) => {
        assert.equal(error.cause, cause);
        assert.equal(error.diagnostic.code, 'MODEL_INVOCATION_FAILED');
        assert.equal(error.diagnostic.httpStatus, undefined);
        return true;
      },
    );
  }
});

test('returned malformed structured output has a typed output error and the original Zod cause', async () => {
  const model = bindingPlanningModel({
    calls: 'private malformed value',
    gaps: [],
  });
  await assert.rejects(
    planApiBindings({ ...bindingPlanningFixture(), model }),
    (error) => {
      assert.equal(error.diagnostic.code, 'MODEL_OUTPUT_INVALID');
      assert.equal(error.cause.name, 'ZodError');
      assert.equal(JSON.stringify(error).includes('private'), false);
      return true;
    },
  );
});

test('API selection uses the same invocation diagnostic contract as binding planning', async () => {
  const cause = Object.assign(new Error('private upstream body'), {
    status: 400,
  });
  const model = {
    withStructuredOutput() {
      return {
        async invoke() {
          throw cause;
        },
      };
    },
  };
  const { context } = await apiSelectionExplanationsFixture();
  await assert.rejects(selectApiOperations({ ...context, model }), (error) => {
    assert.equal(error.diagnostic.operation, 'selectApiOperations');
    assert.equal(error.diagnostic.code, 'MODEL_INVOCATION_FAILED');
    assert.equal(error.diagnostic.httpStatus, 400);
    assert.equal(error.cause, cause);
    return true;
  });
});

test('existing planning error identities, failure payloads and causes stay compatible while JSON is safe', () => {
  for (const ErrorClass of [
    NativeNodePlanningError,
    WorkflowGraphPlanningError,
    ReviewableWorkflowGraphPlanningError,
  ]) {
    const cause = new Error('private cause');
    const failure = {
      stage: 'proposal-schema',
      output: { secret: 'private output' },
    };
    const error = new ErrorClass(failure, cause);
    assert.ok(error instanceof ErrorClass);
    assert.ok(error instanceof OpenApiFlowError);
    assert.equal(error.failure, failure);
    assert.equal(error.cause, cause);
    assert.equal(JSON.stringify(error).includes('private'), false);
    assert.equal(JSON.stringify(error).includes('output'), false);
  }
});

test('n8n public compilation boundaries preserve original exceptions without fabricating success', () => {
  for (const compile of [
    compileN8nWorkflowTemplate,
    compilePlannedN8nWorkflow,
  ]) {
    assert.throws(
      () => compile({}),
      (error) => {
        assert.equal(error.diagnostic.owner, 'n8n');
        assert.equal(error.diagnostic.code, 'N8N_COMPILATION_FAILED');
        assert.equal(error.diagnostic.operation, compile.name);
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
  }
});

test('valid binding planning keeps the original result and single-call behavior', async () => {
  const input = bindingPlanningFixture();
  const model = bindingPlanningModel(bindingPlan);
  assert.deepEqual(await planApiBindings({ ...input, model }), bindingPlan);
  assert.equal(model.calls, 1);
});

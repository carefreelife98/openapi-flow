import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { ChatOpenAI } from '@langchain/openai';
import { createNativeInstanceSelectionReview } from '@openapi-flow/core';
import {
  reviewNativeInstanceSelection,
  selectNativeNodeInstances,
  NativeInstanceSelectionReviewError,
} from '@openapi-flow/langchain';
import {
  nativeSelectionReviewFixture,
  nativeOutsideScopeReviewFixture,
} from './fixtures/native-instance-selection-review-fixture.mjs';
import { createNativeSelectionPlanningGraph } from '@openapi-flow/example-langgraph-workflow';

test('the actual strict LangChain wire supports outside-scope review without invented capability or API references', async () => {
  const { input, selection, reviewProposal } =
    await nativeOutsideScopeReviewFixture();
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const requests = [],
    failures = [];
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const wire = body.response_format.json_schema;
      assert.equal(wire.strict, true);
      assert.equal(wire.name, 'review_native_instance_selection');
      const ajv = new Ajv2020({ strict: false });
      assert.equal(ajv.validateSchema(wire.schema), true);
      const validate = ajv.compile(wire.schema);
      const context = JSON.parse(
        body.messages.find((message) => message.role === 'user').content,
      );
      const answer =
        context.reviewInstances === true
          ? {
              ...reviewProposal,
              coverageAssessment: {
                kind: 'needs-reselection',
                sourceQuote: input.scenario,
                reason:
                  'The selected comparison is not in the original request.',
              },
              instanceAssessments: Object.fromEntries(
                selection.instances.map((role) => [
                  role.id,
                  Object.values(reviewProposal.assessments)[0],
                ]),
              ),
            }
          : reviewProposal;
      assert.equal(validate(answer), true);
      const invalid = globalThis.structuredClone(answer);
      invalid.assessments[selection.gaps[0].id].callIds = ['metrics'];
      assert.equal(validate(invalid), false);
      if (context.reviewInstances === true) {
        const inventedRole = globalThis.structuredClone(answer);
        inventedRole.instanceAssessments.invented = Object.values(
          reviewProposal.assessments,
        )[0];
        assert.equal(validate(inventedRole), false);
      }
      assert.deepEqual(context.gaps, selection.gaps);
      assert.equal(context.context.scenario, input.scenario);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'local-outside-scope-review',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify(answer),
              },
            },
          ],
        }),
      );
    } catch (error) {
      failures.push(error.message);
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: { message: 'Invalid local outside-scope review request' },
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const before = globalThis.structuredClone(selection);
    const review = await reviewNativeInstanceSelection({
      ...input,
      selection,
      model,
    });
    assert.equal(review.status, 'needs-reselection');
    assert.deepEqual(review.proposal, reviewProposal);
    assert.deepEqual(selection, before);
    assert.deepEqual(failures, []);
    assert.equal(requests.length, 1, 'No hidden model retry or selection call');
    const complete = await reviewNativeInstanceSelection({
      ...input,
      selection,
      model,
      reviewInstances: true,
    });
    assert.equal(complete.status, 'needs-reselection');
    assert.equal(complete.reviewInstances, true);
    assert.equal(
      Object.keys(complete.proposal.instanceAssessments).length,
      selection.instances.length,
    );
    assert.equal(
      requests.length,
      2,
      'Gap and instance review share one explicit call',
    );
    assert.deepEqual(selection, before);
    assert.deepEqual(failures, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('actual LangChain sends strict source-bound review and explicit feedback, rejects unchanged invalid references and never retries or edits the old selection', async () => {
  const { input, selection, proposal, reviewProposal } =
    await nativeSelectionReviewFixture();
  const original = globalThis.structuredClone(selection);
  const invalid = globalThis.structuredClone(reviewProposal);
  invalid.assessments[selection.gaps[1].id].callIds = ['unknown-api'];
  const corrected = { instances: proposal.instances, gaps: [] };
  const requests = [],
    failures = [];
  const require = createRequire(
    new URL('../packages/core/package.json', import.meta.url),
  );
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const server = createServer(async (request, response) => {
    try {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw);
      requests.push(body);
      const wire = body.response_format.json_schema;
      assert.equal(wire.strict, true);
      const ajv = new Ajv2020({ strict: false });
      assert.equal(ajv.validateSchema(wire.schema), true);
      const validate = ajv.compile(wire.schema);
      const context = JSON.parse(
        body.messages.find((message) => message.role === 'user').content,
      );
      let answer;
      if (wire.name === 'review_native_instance_selection') {
        assert.equal(validate(reviewProposal), true);
        assert.equal(validate(invalid), false);
        assert.deepEqual(context.gaps, selection.gaps);
        assert.equal(context.context.scenario, input.scenario);
        assert.equal(context.selectionId, selection.id);
        answer = requests.length === 2 ? invalid : reviewProposal;
      } else {
        assert.equal(wire.name, 'select_native_node_instances');
        assert.equal(validate(corrected), true);
        if (context.selectionFeedback !== undefined) {
          assert.equal(context.selectionFeedback.selectionId, selection.id);
          assert.deepEqual(
            context.selectionFeedback.reportedGaps,
            selection.gaps,
          );
        }
        assert.equal(context.scenario, input.scenario);
        answer = context.selectionFeedback === undefined ? proposal : corrected;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: 'local-native-review',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: JSON.stringify(answer) },
            },
          ],
        }),
      );
    } catch (error) {
      failures.push(error.message);
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ error: { message: 'Invalid local review request' } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const model = new ChatOpenAI({
      model: 'gpt-4o',
      apiKey: 'local-fixture-only',
      maxRetries: 0,
      configuration: {
        baseURL: `http://127.0.0.1:${server.address().port}/v1`,
      },
    });
    const review = await reviewNativeInstanceSelection({
      ...input,
      selection,
      model,
    });
    assert.deepEqual(
      review,
      createNativeInstanceSelectionReview({
        ...input,
        selection,
        proposal: reviewProposal,
      }),
    );
    await assert.rejects(
      reviewNativeInstanceSelection({ ...input, selection, model }),
      (error) =>
        error instanceof NativeInstanceSelectionReviewError &&
        error.failure.output.assessments[selection.gaps[1].id].callIds[0] ===
          'unknown-api',
    );
    const newSelection = await selectNativeNodeInstances({
      ...input,
      model,
      feedback: { selection, review },
    });
    assert.equal(newSelection.gaps.length, 0);
    assert.deepEqual(selection, original);
    assert.deepEqual(failures, []);
    assert.equal(requests.length, 3);
    const { capabilities, ...source } = input;
    const result = await createNativeSelectionPlanningGraph({
      capabilities,
      model,
      now: Date.now,
      policy: {
        maxModelInvocations: 3,
        maxReselections: 1,
        deadlineMs: 30_000,
      },
    }).invoke({ source });
    assert.equal(result.status, 'ready');
    assert.equal(result.modelInvocations, 3);
    assert.deepEqual(result.selections[0], original);
    assert.equal(result.selections[1].gaps.length, 0);
    assert.deepEqual(failures, []);
    assert.equal(
      requests.length,
      6,
      'Three explicit structured calls, no hidden transport retry',
    );
    const finalContext = JSON.parse(
      requests[5].messages.find((message) => message.role === 'user').content,
    );
    assert.deepEqual(finalContext.selectionFeedback.previousSelections, [
      { id: selection.id, proposal },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

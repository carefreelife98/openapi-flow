import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { Command, MemorySaver } from '@langchain/langgraph';
import { createWorkflowDraftConversationGraph } from '@openapi-flow/example-langgraph-workflow';
import { WorkflowReviewSuggestionPlanningError } from '@openapi-flow/langchain';
import { apiResponseSourcesFixture } from '../test/fixtures/workflow-draft-api-response-sources-fixture.mjs';
import {
  draftClarificationRequest,
  draftClarificationModel,
  clarificationLimits,
} from '../test/fixtures/workflow-draft-clarification-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';
import {
  reviewSuggestionsConversationModel,
  ownerFollowUp,
} from '../test/fixtures/workflow-review-suggestions-conversation-fixture.mjs';
import { clarificationAnswerRevisionModel } from '../test/fixtures/workflow-clarification-answer-revision-fixture.mjs';

/** Explicit test-driver replies/reviews exercise the actual private host and public OSS. No answer or workflow is repaired. */
export async function verifyDraftClarification({
  model,
  label,
  collectReplies,
  reviewSuggestions,
  collectFollowUp,
  maxFollowUpInteractions,
  expectPlanningFollowUp = false,
  collectAnswerRevisions,
  expectTypedBindingAnswer = false,
}) {
  assert.equal(typeof model?.withStructuredOutput, 'function');
  assert.equal(typeof collectReplies, 'function');
  if (collectAnswerRevisions !== undefined)
    assert.equal(typeof collectAnswerRevisions, 'function');
  if (collectFollowUp !== undefined) {
    assert.equal(typeof collectFollowUp, 'function');
    assert.ok(
      Number.isSafeInteger(maxFollowUpInteractions) &&
        maxFollowUpInteractions > 0,
      'Follow-up test interactions require an explicit positive budget',
    );
  }
  if (expectPlanningFollowUp) assert.equal(typeof collectFollowUp, 'function');
  if (expectTypedBindingAnswer)
    assert.equal(typeof collectFollowUp, 'function');
  const runId = `${Date.now()}-${process.pid}`;
  const directory = new URL(
    `../.local-artifacts/draft-clarification/${runId}/`,
    import.meta.url,
  );
  const volume = `openapi-flow-draft-clarification-${runId}`;
  const image = 'n8nio/n8n:2.37.10';
  const requests = [],
    serverErrors = [],
    reviews = [];
  let created = false,
    phase = 'initialize';
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'GET');
      const url = new URL(request.url, 'http://fixture.invalid');
      requests.push({
        method: request.method,
        path: url.pathname,
        query: [...url.searchParams.entries()],
      });
      let body;
      if (url.pathname === '/seed/seed')
        body = {
          accountId: 'reply-member',
          email: 'reply@example.test',
          enabled: true,
        };
      else if (url.pathname === '/addresses') {
        assert.deepEqual(
          [...url.searchParams.entries()],
          [['owner', 'reply-member']],
        );
        body = { count: 0 };
      } else throw new Error(`Unexpected synthetic request ${url.pathname}`);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    } catch (error) {
      serverErrors.push(error.message);
      response.writeHead(422, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  try {
    await mkdir(directory, { recursive: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const fixture = await apiResponseSourcesFixture({ withNative: false });
    const context = { ...fixture.context, messages: [] };
    const graph = createWorkflowDraftConversationGraph({
      context,
      model,
      checkpointer: new MemorySaver(),
      name: 'Clarified member and address workflow',
      reviewPolicy: 'review',
      includeExplanations: false,
      clarification: { limits: clarificationLimits, includeSuggestions: false },
      ...(reviewSuggestions === undefined ? {} : { reviewSuggestions }),
      deployments: [
        ...new Set(
          context.operations.map((operation) => operation.key.documentId),
        ),
      ].map((documentId) => ({
        documentId,
        baseUrl: `http://host.docker.internal:${server.address().port}`,
      })),
    });
    const config = {
      configurable: { thread_id: `draft-clarification-${runId}` },
      recursionLimit: 200,
    };
    async function resume(state, response) {
      const boundary = state.__interrupt__?.[0]?.value;
      assert.ok(boundary, 'An explicit current UI boundary is required');
      reviews.push({
        kind: boundary.kind,
        phase: boundary.phase,
        action: response.action,
      });
      return graph.invoke(
        new Command({ resume: { token: boundary.token, ...response } }),
        config,
      );
    }
    phase = 'initial-clarification';
    let state = await graph.invoke(
      {
        input: {
          initialDraft: fixture.draft,
          request: {
            id: 'request-1',
            text: draftClarificationRequest,
            expectedRevision: 0,
          },
        },
      },
      config,
    );
    await writeFile(
      new URL('initial.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(
      state.__interrupt__?.[0]?.value.kind,
      'requirements-clarification',
      'The actual ambiguous request must produce its real question; no question is invented by the driver',
    );
    const questions = state.clarification.round.categories.flatMap(
      (category) => category.questions,
    );
    assert.ok(questions.length);
    phase = 'explicit-deferral';
    state = await resume(state, {
      action: 'answer-clarification',
      messageId: 'test-ui-defer',
      replies: questions.map((question) => ({
        kind: 'defer',
        questionId: question.id,
      })),
    });
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
    state = await resume(state, { action: 'approve' });
    await writeFile(
      new URL('independent-prepared.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(state.__interrupt__?.[0]?.value.kind, 'draft-questions');
    assert.equal(
      state.resolutions.length,
      1,
      'The independent original API must be planned, not globally blocked or replaced by dummy pending APIs',
    );
    assert.deepEqual(state.resolutions[0].values, { path: { seedId: 'seed' } });
    assert.deepEqual(state.draft.apiCalls, []);
    assert.deepEqual(requests, []);
    const oldPlanId = state.plan.id;
    phase = 'explicit-confirmation';
    const replies = await collectReplies({
      round: state.clarification.round,
      resolution: state.clarification.resolution,
    });
    await writeFile(
      new URL('explicit-test-ui-replies.json', directory),
      JSON.stringify(replies, null, 2),
    );
    state = await resume(state, {
      action: 'answer-clarification',
      messageId: 'test-ui-confirm',
      replies,
    });
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
    assert.notEqual(state.plan.id, oldPlanId);
    assert.equal(state.clarification.resolution.readyForPlanning, true);
    const confirmedEvidenceIds = [
      ...state.clarification.confirmedAnswerMessageIds,
    ];
    assert.ok(confirmedEvidenceIds.length);
    const retained = state.clarificationHistory.find(
      (item) => item.plan?.id === oldPlanId,
    );
    assert.equal(retained.resolutions.length, 1);
    const answerRevisionInteractions = [];
    if (collectAnswerRevisions !== undefined) {
      const responses = await collectAnswerRevisions({
        round: globalThis.structuredClone(state.clarification.round),
      });
      assert.ok(
        Array.isArray(responses) && responses.length > 0,
        'Answer revision verification requires explicit operator changes',
      );
      for (const response of responses) {
        assert.ok(
          ['revise-clarification', 'answer-clarification'].includes(
            response.action,
          ),
        );
        state = await resume(state, response);
        assert.deepEqual(state.issues, []);
        answerRevisionInteractions.push({
          response,
          phase: state.phase,
          planId: state.plan?.id,
          selectedApiCount: state.plan?.steps.filter(
            (step) => step.decision.kind === 'add-api-call',
          ).length,
          confirmedAnswerMessageIds:
            state.clarification.confirmedAnswerMessageIds,
        });
        assert.deepEqual(
          requests,
          [],
          'No prior candidate is executed during answer changes',
        );
      }
      assert.equal(state.__interrupt__?.[0]?.value.phase, 'selection');
      assert.equal(state.clarification.resolution.readyForPlanning, true);
      assert.equal(state.clarificationAnswerRevisions.length, 2);
      await writeFile(
        new URL('answer-revisions.json', directory),
        JSON.stringify(
          {
            interactions: answerRevisionInteractions,
            revisions: state.clarificationAnswerRevisions,
            inactiveMessageIds: state.inactiveClarificationMessageIds,
          },
          null,
          2,
        ),
      );
    }
    phase = 'candidate-review';
    state = await resume(state, { action: 'approve' });
    await writeFile(
      new URL('candidate.json', directory),
      JSON.stringify(state, null, 2),
    );
    const followUpInteractions = [];
    while (state.__interrupt__?.[0]?.value.phase !== 'candidate') {
      const boundary = state.__interrupt__?.[0]?.value;
      assert.ok(
        boundary,
        'An actual additional HITL boundary is required; never fabricate a pending question',
      );
      if (collectFollowUp === undefined)
        throw new Error(
          'Actual planning returned another HITL question; supply collectFollowUp to explicitly answer it. No candidate or automatic answer was fabricated.',
        );
      assert.ok(
        followUpInteractions.length < maxFollowUpInteractions,
        'Explicit follow-up test interaction budget exhausted',
      );
      const response = await collectFollowUp({
        boundary: globalThis.structuredClone(boundary),
      });
      followUpInteractions.push({ boundary, response });
      await writeFile(
        new URL('follow-up-interactions.json', directory),
        JSON.stringify(followUpInteractions, null, 2),
      );
      state = await resume(state, response);
      await writeFile(
        new URL(`follow-up-${followUpInteractions.length}.json`, directory),
        JSON.stringify(state, null, 2),
      );
    }
    if (expectPlanningFollowUp) {
      assert.ok(
        followUpInteractions.some(
          (interaction) => interaction.boundary.kind === 'draft-questions',
        ),
      );
      assert.ok(
        state.suggestionAdoptions.some(
          (adoption) => adoption.suggestion.kind === 'answer-question',
        ),
      );
    }
    if (expectTypedBindingAnswer) {
      assert(
        followUpInteractions.some(
          (interaction) =>
            interaction.response.action === 'answer-api-bindings',
        ),
      );
      assert(
        state.bundles.some((bundle) => bundle.bindingPlan?.answers?.length),
      );
      assert.equal(state.suggestionAdoptions.length, 0);
    }
    assert.equal(state.__interrupt__?.[0]?.value.phase, 'candidate');
    assert.deepEqual(state.draft.apiCalls, []);
    state = await resume(state, { action: 'approve' });
    await writeFile(
      new URL('complete.json', directory),
      JSON.stringify(state, null, 2),
    );
    assert.equal(state.phase, 'complete');
    assert.equal(state.draft.apiCalls.length, 2);
    assert.equal(state.draft.edges.length, 1);
    assert.equal(state.artifact.revision, state.draft.revision);
    assert.equal(state.artifact.triggerConnected, true);
    assert.ok(
      state.draft.requirements.every(
        (requirement) =>
          requirement.state === 'confirmed' &&
          requirement.origin.roundId === state.clarification.round.id,
      ),
    );
    assert.ok(
      confirmedEvidenceIds.every(
        (id) =>
          state.requestMessageIds.includes(id) &&
          state.messages.some((message) => message.id === id),
      ),
      'Previously confirmed original answers remain explicit evidence after any accepted follow-up',
    );
    const workflow = {
      ...state.artifact.workflow,
      id: `draft-clarification-${runId}`,
    };
    await writeFile(
      new URL('workflow.json', directory),
      JSON.stringify(workflow, null, 2),
    );
    await writeFile(
      new URL('workflow-guide.ko.md', directory),
      state.artifact.guide,
    );
    const made = await runDocker(['volume', 'create', volume]);
    assert.equal(made.code, 0, made.stderr);
    created = true;
    const runtime = [
      'run',
      '--rm',
      '-i',
      '--mount',
      `source=${volume},target=/home/node/.n8n`,
      '-e',
      'N8N_DIAGNOSTICS_ENABLED=false',
      image,
    ];
    const imported = await runDocker(
      [...runtime, 'import:workflow', '--input=/dev/stdin'],
      JSON.stringify([workflow]),
    );
    assert.equal(imported.code, 0, imported.stderr);
    phase = 'n8n-execution';
    const raw = await runDocker([
      ...runtime,
      'execute',
      `--id=${workflow.id}`,
      '--rawOutput',
    ]);
    const execution = readN8nExecution(raw.stdout);
    await writeFile(
      new URL('execution.json', directory),
      JSON.stringify(execution, null, 2),
    );
    assert.equal(
      execution.status,
      'success',
      JSON.stringify(execution.data.resultData.error),
    );
    assert.deepEqual(serverErrors, []);
    assert.deepEqual(requests, [
      { method: 'GET', path: '/seed/seed', query: [] },
      { method: 'GET', path: '/addresses', query: [['owner', 'reply-member']] },
    ]);
    await writeFile(
      new URL('report.json', directory),
      JSON.stringify(
        {
          status: 'passed',
          label,
          image,
          revision: state.draft.revision,
          reviews,
          questions: questions.map((question) => ({
            id: question.id,
            message: question.message,
          })),
          replies,
          followUpInteractions,
          suggestionAdoptions: state.suggestionAdoptions,
          answerRevisionInteractions,
          answerRevisionCount: state.clarificationAnswerRevisions.length,
          requests,
          businessApiCalls: 0,
          scope:
            'Actual clarification/semantic scope/material/SDK host; explicit simulated UI defer and confirm; independent work preserved as audit, no unvalidated reuse or automatic rebase; final import and exact response-owned request.',
        },
        null,
        2,
      ),
    );
    console.log(
      `draft-clarification: PASSED (${requests.length} actual HTTP requests; ${directory.pathname})`,
    );
    return directory;
  } catch (error) {
    await writeFile(
      new URL('failure.json', directory),
      JSON.stringify(
        {
          label,
          phase,
          errorType: error.name,
          httpStatus: error.status,
          ...(error instanceof assert.AssertionError
            ? { message: error.message }
            : {}),
          ...(error.name?.startsWith('WorkflowDraft') ||
          error instanceof WorkflowReviewSuggestionPlanningError
            ? { failure: error.failure }
            : {}),
          requests,
          serverErrors,
          reviews,
          businessApiCalls: 0,
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    if (created) {
      const removed = await runDocker(['volume', 'rm', volume]);
      assert.equal(removed.code, 0, removed.stderr);
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const withFollowUp = process.argv.includes('--with-follow-up');
  const withAnswerRevision = process.argv.includes('--with-answer-revision');
  const withBindingAnswers = process.argv.includes('--with-binding-answer');
  assert.ok(
    [withFollowUp, withAnswerRevision, withBindingAnswers].filter(Boolean)
      .length <= 1,
    'Choose one explicit synthetic operator scenario',
  );
  await verifyDraftClarification({
    model:
      withFollowUp || withBindingAnswers
        ? reviewSuggestionsConversationModel()
        : withAnswerRevision
          ? clarificationAnswerRevisionModel()
          : draftClarificationModel(),
    label:
      'Deterministic model fixture; explicit test UI defers then chooses address lookup; actual public OSS and private host',
    collectReplies: async ({ round }) =>
      round.categories
        .flatMap((category) => category.questions)
        .map((question) => ({
          kind: 'single-choice',
          questionId: question.id,
          choiceId: question.answer.choices[0].id,
        })),
    ...(withBindingAnswers
      ? {
          maxFollowUpInteractions: 4,
          expectTypedBindingAnswer: true,
          collectFollowUp: async ({ boundary }) => {
            if (boundary.phase === 'selection') return { action: 'approve' };
            assert.equal(boundary.kind, 'draft-questions');
            const question = boundary.questions.find(
              (question) => question.kind === 'api-binding',
            ).bindingQuestion;
            assert.equal(question.targetPointer, '/query/owner');
            const choice = question.choices[1];
            assert.equal(
              choice.sourcePointer,
              '/accountId',
              'The synthetic operator explicitly selects accountId, not the first alternative',
            );
            return {
              action: 'answer-api-bindings',
              messageId: 'test-ui-direct-account-choice',
              answers: [
                {
                  kind: 'choose-source',
                  questionId: question.id,
                  choiceId: choice.id,
                },
              ],
            };
          },
        }
      : {}),
    ...(withAnswerRevision
      ? {
          collectAnswerRevisions: async ({ round }) => {
            const [question] = round.categories.flatMap(
              (category) => category.questions,
            );
            assert.deepEqual(
              question.answer.choices.map((choice) => choice.label),
              ['주소 조회 추가', '원본 조회만'],
            );
            return [
              {
                action: 'revise-clarification',
                messageId: 'test-ui-replace-address',
                changes: [
                  {
                    kind: 'replace-answer',
                    reply: {
                      kind: 'single-choice',
                      questionId: question.id,
                      choiceId: question.answer.choices[1].id,
                    },
                  },
                ],
              },
              {
                action: 'revise-clarification',
                messageId: 'test-ui-reopen-address',
                changes: [{ kind: 'reopen-question', questionId: question.id }],
              },
              {
                action: 'answer-clarification',
                messageId: 'test-ui-restore-address',
                replies: [
                  {
                    kind: 'single-choice',
                    questionId: question.id,
                    choiceId: question.answer.choices[0].id,
                  },
                ],
              },
            ];
          },
        }
      : {}),
    ...(withFollowUp
      ? {
          reviewSuggestions: { limits: { maxSuggestions: 3 } },
          maxFollowUpInteractions: 4,
          expectPlanningFollowUp: true,
          collectFollowUp: async ({ boundary }) => {
            if (boundary.phase === 'selection') return { action: 'approve' };
            assert.equal(boundary.kind, 'draft-questions');
            const suggestion = boundary.reviewSuggestions.suggestions[1];
            assert.equal(
              suggestion.text,
              ownerFollowUp,
              'The explicit fixture operator chooses the second accountId alternative, not a production default',
            );
            return {
              action: 'adopt-suggestion',
              reviewId: boundary.reviewSuggestions.id,
              suggestionId: suggestion.id,
              messageId: 'test-ui-chosen-account-id',
            };
          },
        }
      : {}),
  });
}

import { isDeepStrictEqual } from 'node:util';
import {
  describeWorkflowConnectionGoals,
  replayWorkflowConnectionMaterialRepair,
  extendWorkflowConnectionSession,
  validateWorkflowConnectionRevision,
  validateWorkflowConnectionGoalReview,
} from '@openapi-flow/core';
import type { WorkflowConnectionSession } from '@openapi-flow/core';
import type {
  IncrementalConnectionDependencies,
  IncrementalConnectionState,
} from '../../types/incremental-connections.js';
import type { IncrementalConnectionSourceReplay } from '../../types/incremental-revisions.js';

export function assertIncrementalSessionContinuation(
  current: WorkflowConnectionSession,
  previous: WorkflowConnectionSession | undefined,
): void {
  if (
    previous !== undefined &&
    (current.id !== previous.id ||
      current.revision < previous.revision ||
      !isDeepStrictEqual(current.goals, previous.goals) ||
      !isDeepStrictEqual(
        current.history.slice(0, previous.history.length),
        previous.history,
      ))
  )
    throw new Error(
      'Connection source events cannot discard or replace the accepted session history',
    );
}

/** Replay actual Core receipts in order; never infer chronology from separate material arrays. */
export function replayIncrementalConnectionSourceEvents(
  dependencies: IncrementalConnectionDependencies,
  state: IncrementalConnectionState,
): IncrementalConnectionSourceReplay {
  if (
    !dependencies.revisionPlanning ||
    !state.sourceEvents ||
    !state.materialSourceFingerprint
  )
    throw new Error(
      'Revision source replay requires its explicit policy, source fingerprint and event ledger',
    );
  let source = dependencies.source();
  if (
    describeWorkflowConnectionGoals(source).sourceFingerprint !==
    state.materialSourceFingerprint
  )
    throw new Error('Original revision source changed; no automatic rebase');
  const epochs: IncrementalConnectionSourceReplay['epochs'] = new Map();
  const remember = () =>
    epochs.set(
      describeWorkflowConnectionGoals(source).sourceFingerprint,
      source,
    );
  remember();
  let lastSession: WorkflowConnectionSession | undefined;
  for (const event of state.sourceEvents) {
    switch (event.kind) {
      case 'material-repair':
        if (lastSession !== undefined)
          throw new Error(
            'Material repair after a session transition requires an accepted revision',
          );
        source = replayWorkflowConnectionMaterialRepair({
          source,
          receipt: event.receipt,
        });
        break;
      case 'native-extension': {
        assertIncrementalSessionContinuation(event.beforeSession, lastSession);
        const checked = extendWorkflowConnectionSession({
          ...source,
          session: event.beforeSession,
          expected: event.extension.previous,
          additionalNativeNodes: event.additionalNativeNodes,
        });
        if (!isDeepStrictEqual(checked, event.extension))
          throw new Error(
            'Native source event differs from its original Core extension',
          );
        source = {
          ...source,
          nativeNodes: [
            ...(source.nativeNodes === undefined ? [] : source.nativeNodes),
            ...event.additionalNativeNodes,
          ],
        };
        lastSession = checked.session;
        break;
      }
      case 'accepted-revision': {
        assertIncrementalSessionContinuation(event.beforeSession, lastSession);
        let after = source;
        for (const receipt of event.repairs)
          after = replayWorkflowConnectionMaterialRepair({
            source: after,
            receipt,
          });
        validateWorkflowConnectionRevision({
          before: { ...source, session: event.beforeSession },
          after,
          expected: event.revision.previous,
          proposal: event.revision.proposal,
          revision: event.revision,
        });
        source = { ...after, ...event.revision.sourceUpdate };
        if (dependencies.initialGoalReview && event.review === undefined)
          throw new Error(
            'Accepted revision requires its configured goal review',
          );
        if (event.review !== undefined) {
          validateWorkflowConnectionGoalReview({
            ...source,
            session: event.revision.session,
            review: event.review,
          });
          if (!event.review.accepted)
            throw new Error(
              'A rejected revision review cannot enter the accepted source ledger',
            );
        }
        lastSession = event.revision.session;
        break;
      }
      default:
        throw new Error('Unknown connection source event kind');
    }
    remember();
  }
  if (state.session)
    assertIncrementalSessionContinuation(state.session, lastSession);
  return {
    source,
    epochs,
    ...(lastSession === undefined ? {} : { lastSession }),
  };
}

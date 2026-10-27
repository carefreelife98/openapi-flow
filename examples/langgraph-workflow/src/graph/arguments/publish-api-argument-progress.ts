import type {
  ApiArgumentPlanningProgress,
  ApiArgumentPlanningObserver,
} from '../../types/api-argument-planning.js';

/** A slow observer cannot extend the declared run budget; its host receives the same cancellation signal. */
export async function publishApiArgumentProgress(
  progress: ApiArgumentPlanningProgress,
  signal: AbortSignal,
  observe?: ApiArgumentPlanningObserver,
): Promise<void> {
  signal.throwIfAborted();
  if (observe === undefined) return;
  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => observe(progress, signal))
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  signal.throwIfAborted();
}

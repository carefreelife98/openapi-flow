import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { IncrementalConnectionModelLease } from '../../types/incremental-connections.js';
import { IncrementalConnectionLimitError } from './check-incremental-connection-budget.js';

/** Host-only accounting for the public planners' structured invoke path. Not a provider adapter or a security sandbox. */
export function createMaterialRecoveryModelLease(
  model: BaseChatModel,
  limit: number,
  signal: AbortSignal,
): IncrementalConnectionModelLease {
  let used = 0;
  let closed = false;
  const reserve = (): void => {
    if (closed) throw new Error('Material recovery model lease is closed');
    if (used >= limit)
      throw new IncrementalConnectionLimitError({
        kind: 'model-invocations',
        limit,
        observed: used + 1,
      });
    used++;
  };
  const lease = new Proxy(model, {
    get(target, property) {
      if (property === 'withStructuredOutput')
        return new Proxy(target.withStructuredOutput, {
          apply(method, _receiver, args) {
            const result: unknown = Reflect.apply(method, target, args);
            if (typeof result !== 'object' || result === null)
              throw new Error(
                'Material recovery structured output must return a runnable',
              );
            return new Proxy(result, {
              get(runnable, key) {
                const member: unknown = Reflect.get(runnable, key, runnable);
                if (key === 'invoke') {
                  if (typeof member !== 'function')
                    throw new Error(
                      'Material recovery structured runnable.invoke must be a function',
                    );
                  return new Proxy(member, {
                    apply(invoke, _context, input) {
                      signal.throwIfAborted();
                      const config: unknown = input[1];
                      if (
                        config !== undefined &&
                        (typeof config !== 'object' ||
                          config === null ||
                          Array.isArray(config))
                      )
                        throw new Error(
                          'Material recovery runnable config must be an object when supplied',
                        );
                      const callerSignal: unknown =
                        config === undefined
                          ? undefined
                          : Reflect.get(config, 'signal');
                      if (
                        callerSignal !== undefined &&
                        !(callerSignal instanceof AbortSignal)
                      )
                        throw new Error(
                          'Material recovery runnable config.signal must be an AbortSignal',
                        );
                      const invocationSignal =
                        callerSignal === undefined
                          ? signal
                          : AbortSignal.any([signal, callerSignal]);
                      invocationSignal.throwIfAborted();
                      reserve();
                      const output: unknown = Reflect.apply(invoke, runnable, [
                        input[0],
                        {
                          ...(config === undefined ? {} : config),
                          signal: invocationSignal,
                        },
                      ]);
                      return Promise.resolve(output).then((value: unknown) => {
                        invocationSignal.throwIfAborted();
                        return value;
                      });
                    },
                  });
                }
                if (
                  ['stream', 'batch', 'streamEvents', 'pipe'].includes(
                    String(key),
                  )
                )
                  throw new Error(
                    'Material recovery model lease supports only structured runnable.invoke',
                  );
                if (typeof member === 'function')
                  throw new Error(
                    'Material recovery model lease supports only structured runnable.invoke',
                  );
                return member;
              },
            });
          },
        });
      if (
        [
          'invoke',
          'stream',
          'batch',
          'streamEvents',
          'generate',
          'generatePrompt',
          'bind',
          'bindTools',
          'pipe',
        ].includes(String(property))
      )
        throw new Error(
          'Material recovery model lease requires withStructuredOutput(...).invoke(...)',
        );
      const member: unknown = Reflect.get(target, property, target);
      if (typeof member === 'function')
        throw new Error(
          'Material recovery model lease requires withStructuredOutput(...).invoke(...)',
        );
      return member;
    },
  });
  return {
    model: lease,
    usedInvocations: () => used,
    close: () => {
      closed = true;
    },
  };
}

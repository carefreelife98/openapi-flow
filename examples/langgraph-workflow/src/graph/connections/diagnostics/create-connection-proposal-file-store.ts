import { open, mkdir, lstat, readFile, link, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { workflowConnectionProposalAttemptSchema } from '@openapi-flow/langchain';
import type { WorkflowConnectionProposalAttempt } from '@openapi-flow/langchain';

/** Host-private storage, deliberately separate from public observers and provider logs. */
export function createConnectionProposalFileStore(directory: string) {
  if (typeof directory !== 'string' || !isAbsolute(directory))
    throw new Error(
      'Connection proposal store.directory requires an absolute private directory',
    );
  return async (input: WorkflowConnectionProposalAttempt): Promise<void> => {
    const attempt = workflowConnectionProposalAttemptSchema.parse(input);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (
      !directoryStat.isDirectory() ||
      directoryStat.isSymbolicLink() ||
      (directoryStat.mode & 0o777) !== 0o700
    )
      throw new Error(
        'Connection proposal store.directory must be a real directory with mode 0700',
      );
    const destination = join(directory, attempt.id + '.json');
    const temporary = join(directory, '.' + randomUUID() + '.tmp');
    const file = await open(temporary, 'wx', 0o600);
    try {
      try {
        await file.writeFile(JSON.stringify(attempt, null, 2) + '\n');
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(temporary, destination);
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        )
          throw error;
        const stat = await lstat(destination);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          (stat.mode & 0o777) !== 0o600
        )
          throw new Error(
            'Connection proposal store record must be a real file with mode 0600',
            { cause: error },
          );
        const saved = workflowConnectionProposalAttemptSchema.parse(
          JSON.parse(await readFile(destination, 'utf8')),
        );
        if (!isDeepStrictEqual(saved, attempt))
          throw new Error(
            'Connection proposal store attempt ID conflicts with an existing original',
            { cause: error },
          );
      }
    } finally {
      await unlink(temporary);
    }
  };
}

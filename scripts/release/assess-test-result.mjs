import assert from 'node:assert/strict';

/** An explicit release exception never rewrites an actual test result. */
export function assessTestResult({ exitCode, output, acceptedFailureNames }) {
  assert.ok(Array.isArray(acceptedFailureNames));
  assert.ok(
    acceptedFailureNames.every((name) => typeof name === 'string' && name),
  );
  assert.equal(new Set(acceptedFailureNames).size, acceptedFailureNames.length);
  const failureNames = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(
    (match) => match[1].trimEnd(),
  );
  const counts = {};
  for (const field of [
    'tests',
    'pass',
    'fail',
    'cancelled',
    'skipped',
    'todo',
  ]) {
    const match = output.match(new RegExp(`^# ${field} (\\d+)$`, 'm'));
    if (!match)
      return {
        passed: false,
        decision: 'blocked',
        failureNames,
        reason: `Missing TAP summary: ${field}`,
      };
    counts[field] = Number(match[1]);
  }
  const complete =
    counts.tests > 0 &&
    counts.cancelled === 0 &&
    counts.skipped === 0 &&
    counts.todo === 0 &&
    counts.tests === counts.pass + counts.fail &&
    counts.fail === failureNames.length &&
    new Set(failureNames).size === failureNames.length;
  const passed = complete && exitCode === 0 && counts.fail === 0;
  const accepted =
    complete &&
    exitCode === 1 &&
    counts.fail > 0 &&
    failureNames.every((name) => acceptedFailureNames.includes(name));
  return {
    passed,
    decision: passed ? 'passed' : accepted ? 'accepted-limitation' : 'blocked',
    counts,
    failureNames,
  };
}

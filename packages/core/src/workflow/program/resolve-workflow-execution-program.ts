import { isDeepStrictEqual } from 'node:util';
import type {
  ResolveWorkflowExecutionProgramInput,
  ResolvedWorkflowExecutionProgram,
  ValidateWorkflowExecutionProgramInput,
  ReviseWorkflowExecutionProgramInput,
  WorkflowProgramRevision,
} from '../../types/workflow-execution-program.js';
import { workflowExecutionProgramSchema } from '../../schemas/workflow-execution-program-schema.js';
import { describeWorkflowExecutionProgram } from './describe-workflow-execution-program.js';
import { assertWorkflowProgramSize } from './assert-workflow-program-size.js';
import { compileWorkflowExecutionBlock } from './compile-workflow-execution-block.js';
import { validateWorkflowTopology } from '../validate-workflow-topology.js';

export function resolveWorkflowExecutionProgram(
  input: ResolveWorkflowExecutionProgramInput,
): ResolvedWorkflowExecutionProgram {
  const description = describeWorkflowExecutionProgram(input);
  assertWorkflowProgramSize(input.program, description.limits);
  const program = workflowExecutionProgramSchema.parse(input.program);
  const compiled = compileWorkflowExecutionBlock({
    source: input,
    description,
    body: program.body,
  });
  const plan = {
    nativeNodes: [
      ...structuredClone(input.nativeNodes!),
      ...compiled.generated,
    ],
    edges: compiled.edges,
    starts: compiled.roots,
    gaps: structuredClone(input.gaps!),
    blockedCalls: [],
  };
  if (input.materials!.some((m) => m.status !== 'ready') || input.gaps!.length)
    throw new Error(
      'Execution program source has unresolved materials or capability gaps',
    );
  const preserved = input.edges ?? [];
  if (
    preserved.some(
      (edge) =>
        !plan.edges.some((candidate) => isDeepStrictEqual(edge, candidate)),
    )
  )
    throw new Error('Execution program removed a protected source edge');
  validateWorkflowTopology({
    contracts: [...compiled.contracts.values()],
    apiIds: new Set(
      input.materials!.flatMap((material) =>
        material.status === 'ready' ? [material.arguments.callId] : [],
      ),
    ),
    edges: plan.edges,
    starts: plan.starts,
  });

  return {
    kind: 'resolved-execution-program',
    sourceFingerprint: description.sourceFingerprint,
    program,
    plan,
    generatedNodeIds: compiled.generated.map((n) => n.id),
  };
}

export function validateWorkflowExecutionProgram(
  input: ValidateWorkflowExecutionProgramInput,
): ResolvedWorkflowExecutionProgram {
  const replayed = resolveWorkflowExecutionProgram({
    ...input,
    program: input.result.program,
  });
  if (!isDeepStrictEqual(replayed, input.result))
    throw new Error(
      'Execution program receipt is stale or differs from its checked source',
    );
  return replayed;
}

/** A failed candidate never mutates the last checked revision. */
export function reviseWorkflowExecutionProgram(
  input: ReviseWorkflowExecutionProgramInput,
): WorkflowProgramRevision {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.current.revision !== input.expectedRevision
  )
    throw new Error(
      'Execution program expectedRevision does not match its current revision',
    );
  if (input.expectedRevision === Number.MAX_SAFE_INTEGER)
    throw new Error('Execution program revision exhausted');
  validateWorkflowExecutionProgram({
    ...input.previousSource,
    result: input.current.result,
  });
  const result = resolveWorkflowExecutionProgram(input);
  if (isDeepStrictEqual(result, input.current.result))
    throw new Error('Execution program revision makes no progress');
  return { revision: input.expectedRevision + 1, result };
}

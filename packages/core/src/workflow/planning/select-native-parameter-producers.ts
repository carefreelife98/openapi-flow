import type { WorkflowCapability } from '../../types/workflow-plan.js';
import type { WorkflowNativeParameterReference } from '../../types/native-parameter-reference.js';
import type {
  NativeParameterProducerCandidate,
  SelectNativeParameterProducersInput,
} from '../../types/native-producer-eligibility.js';
import { nativeParameterReferenceSourcesSchema } from '../../schemas/native-parameter-reference-sources-schema.js';

/** An explicit implementation protocol; absence never means all sources. */
export function requireNativeParameterReferenceSources(
  capability: WorkflowCapability,
): WorkflowNativeParameterReference['source'][] {
  const checked = nativeParameterReferenceSourcesSchema.safeParse(
    capability.parameterReferenceSources,
  );
  if (!checked.success)
    throw new Error(
      `Native capability ${capability.name}.parameterReferenceSources must explicitly declare distinct supported reference kinds for producer-choice planning`,
      { cause: checked.error },
    );
  return checked.data;
}

/** Only potential output kinds are exposed here, not fabricated future schemas. */
export function describePendingNativeProducer(
  nodeId: string,
  capability: WorkflowCapability,
): NativeParameterProducerCandidate {
  const referenceSources: WorkflowNativeParameterReference['source'][] = [];
  if (typeof capability.outputSchema === 'function')
    referenceSources.push('node-output');
  if (capability.exclusiveOutputPorts)
    referenceSources.push('exclusive-output');
  return { nodeId, referenceSources };
}

export function selectNativeParameterProducers(
  input: SelectNativeParameterProducersInput,
): string[] {
  const allowed = requireNativeParameterReferenceSources(input.capability);
  return [
    ...new Set(
      input.producers
        .filter(
          (producer) =>
            producer.nodeId !== input.nodeId &&
            producer.referenceSources.some((source) =>
              allowed.includes(source),
            ),
        )
        .map((producer) => producer.nodeId),
    ),
  ];
}

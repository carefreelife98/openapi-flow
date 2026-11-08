import type { WorkflowProgramPreparation } from '../../types/internal/workflow-execution-program.js';
import { registerPreparedConnectionSource } from '../connections/incremental/prepared-connection-source.js';
import type {
  WorkflowExecutionProgramSource,
  WorkflowExecutionProgramDescription,
} from '../../types/workflow-execution-program.js';
import { captureWorkflowExecutionProgramSource } from './describe-workflow-execution-program.js';
import { captureNativePlanningCapability } from '../planning/capture-native-planning-capability.js';

const preparations = new WeakMap<object, WorkflowProgramPreparation>();
const fields = {
  scenario: true,
  entrypoint: true,
  materials: true,
  nativeNodes: true,
  capabilities: true,
  gaps: true,
  edges: true,
  deferredApiInputIds: true,
  requirements: true,
  literalSourceMessages: true,
  reviewBoundary: true,
  editableEdgeIds: true,
  limits: true,
  controls: true,
} satisfies Record<keyof WorkflowExecutionProgramSource, true>;

/** Freeze owned JSON only. Executable schema instances and callbacks remain runtime dependencies. */
function freezeData(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    return;
  seen.add(value);
  for (const child of Object.values(value)) freezeData(child, seen);
  Object.freeze(value);
}
/** A prepared source is a captured immutable revision. Replaced fields require a new preparation. */
export function preparedWorkflowProgramDescription(
  input: WorkflowExecutionProgramSource,
): WorkflowExecutionProgramDescription | undefined {
  if (!Array.isArray(input.materials)) return undefined;
  const prepared = preparations.get(input.materials);
  if (prepared === undefined) return undefined;
  for (const field of Object.keys(
    fields,
  ) as (keyof WorkflowExecutionProgramSource)[])
    if (input[field] !== prepared.source[field])
      throw new Error(
        'Prepared execution program source.' +
          field +
          ' was replaced; prepare the new material revision explicitly',
      );
  return prepared.description;
}
/** Capture once per material revision; never place runtime capabilities or this view in checkpoint state. */
export function prepareWorkflowExecutionProgramSource(
  input: WorkflowExecutionProgramSource,
): Readonly<WorkflowExecutionProgramSource> {
  for (const field of [
    'materials',
    'nativeNodes',
    'capabilities',
    'gaps',
    'requirements',
  ] as const)
    if (!Array.isArray(input[field]))
      throw new Error(
        'Execution program source.' + field + ' must be an explicit array',
      );
  if (
    input.controls !== undefined &&
    (input.controls === null ||
      typeof input.controls.version !== 'string' ||
      !input.controls.version.trim() ||
      !Array.isArray(input.controls.capabilities) ||
      typeof input.controls.create !== 'function')
  )
    throw new Error(
      'Execution program controls require version, capabilities and create',
    );
  const data = structuredClone({
    scenario: input.scenario,
    entrypoint: input.entrypoint,
    materials: input.materials,
    nativeNodes: input.nativeNodes,
    gaps: input.gaps,
    edges: input.edges,
    deferredApiInputIds: input.deferredApiInputIds,
    requirements: input.requirements,
    literalSourceMessages: input.literalSourceMessages,
    reviewBoundary: input.reviewBoundary,
    editableEdgeIds: input.editableEdgeIds,
    limits: input.limits,
  } satisfies Record<
    Exclude<keyof WorkflowExecutionProgramSource, 'capabilities' | 'controls'>,
    unknown
  >);
  const capabilities = input.capabilities;
  if (!Array.isArray(capabilities))
    throw new Error(
      'Execution program source.capabilities must be an explicit array',
    );
  const capturedCapabilities = capabilities.map(
    captureNativePlanningCapability,
  );
  const controls =
    input.controls === undefined
      ? undefined
      : {
          version: input.controls.version,
          create: input.controls.create.bind(input.controls),
          capabilities: input.controls.capabilities.map(
            captureNativePlanningCapability,
          ),
        };
  const source = { ...data, capabilities: capturedCapabilities, controls };
  const captured = captureWorkflowExecutionProgramSource(source),
    description = captured.description;
  const { limits, controls: runtimeControls, ...materialData } = source;
  void limits;
  void runtimeControls;
  const materialSource = {
    ...materialData,
    capabilities: [...capturedCapabilities, ...(controls?.capabilities ?? [])],
  };
  freezeData(data);
  freezeData(capturedCapabilities);
  freezeData(controls);
  freezeData(description);
  freezeData(captured.connection);
  freezeData(materialSource);
  Object.freeze(source);
  registerPreparedConnectionSource(materialSource, captured.connection);
  preparations.set(source.materials!, {
    source,
    description,
    materialSource,
    materialDescription: captured.connection,
  });
  return source;
}

export function preparedWorkflowProgramMaterialSource(
  input: WorkflowExecutionProgramSource,
) {
  if (preparedWorkflowProgramDescription(input) === undefined) return undefined;
  return preparations.get(input.materials!)!.materialSource;
}

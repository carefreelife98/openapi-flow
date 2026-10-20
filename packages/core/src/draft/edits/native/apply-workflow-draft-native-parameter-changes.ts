import type { ApplyWorkflowDraftNativeParameterChangesInput } from '../../../types/workflow-draft-native-parameter-edit.js';
import type { WorkflowDraftValueEdit } from '../../../types/workflow-draft-edit-assembly.js';
import type { PlannedNativeNode } from '../../../types/workflow-plan.js';
import {
  hasPointer,
  pointerTokens,
  pointerValue,
} from '../../../bindings/json-pointer.js';
import { workflowDraftNativeNodeSchema } from '../../../schemas/workflow-draft-schema.js';
import { workflowDraftNativeParameterChangeSchema } from '../../../schemas/workflow-draft-edit-assembly-schema.js';
import { applyWorkflowDraftValueEdits } from '../values/apply-workflow-draft-value-edits.js';
import { orderWorkflowDraftValueEdits } from '../values/order-workflow-draft-value-edits.js';
import { createNativeRuntimeParametersSchema } from '../../../schemas/create-native-runtime-parameters-schema.js';
import { createSchemaResourceContext } from '../../../bindings/resources/create-schema-resource-context.js';
import { schemasAtPointer } from '../../../bindings/schema-at-pointer.js';
import { schemaAllowsContainer } from '../../../bindings/schema-allows-container.js';

/** The same explicit ownership/literal changes are used by planning and final assembly. */
export function applyWorkflowDraftNativeParameterChanges(
  input: ApplyWorkflowDraftNativeParameterChangesInput,
): PlannedNativeNode {
  const node = workflowDraftNativeNodeSchema.parse(input.node);
  const edits = workflowDraftNativeParameterChangeSchema
    .array()
    .parse(input.edits);
  const previous =
    node.runtimeParameters === undefined || node.runtimeParameters === true
      ? []
      : node.runtimeParameters.pointers;
  const seen: string[] = [];
  for (const edit of edits) {
    pointerTokens(edit.pointer);
    if (
      seen.some(
        (pointer) =>
          pointer === '' ||
          edit.pointer === '' ||
          pointer === edit.pointer ||
          pointer.startsWith(edit.pointer + '/') ||
          edit.pointer.startsWith(pointer + '/'),
      )
    )
      throw new Error(
        `${input.source}: duplicate or overlapping parameter targets`,
      );
    seen.push(edit.pointer);
    if (
      node.runtimeParameters === true &&
      (edit.kind !== 'set' || edit.pointer !== '')
    )
      throw new Error(
        `${input.source}: runtime-owned native parameters need an explicit whole-object literal replacement`,
      );
    const parentOwner = previous.find((pointer) =>
      edit.pointer.startsWith(pointer + '/'),
    );
    if (parentOwner !== undefined)
      throw new Error(
        `${input.source}${edit.pointer}: runtime-owned parent ${parentOwner} needs an explicit whole-parent replacement`,
      );
    if (edit.kind === 'remove' && edit.pointer === '')
      throw new Error(`${input.source}: cannot remove the parameter root`);
    if (
      edit.kind === 'defer' &&
      input.capability.supportsRuntimeParameters !== true
    )
      throw new Error(
        `${input.source}: capability does not support runtime-independent parameters`,
      );
  }
  const pointers = previous.filter(
    (pointer) =>
      !edits.some(
        (edit) =>
          edit.pointer === '' ||
          pointer === edit.pointer ||
          pointer.startsWith(edit.pointer + '/'),
      ),
  );
  pointers.push(
    ...edits
      .filter((edit) => edit.kind === 'defer')
      .map((edit) => edit.pointer),
  );
  const values: WorkflowDraftValueEdit[] = [];
  for (const edit of edits) {
    if (edit.kind === 'set') {
      values.push(edit);
      continue;
    }
    const parentPointer = edit.pointer.slice(0, edit.pointer.lastIndexOf('/'));
    const parent = pointerValue(node.parameters, parentPointer);
    let arrayParent = Array.isArray(parent);
    if (parent === undefined && edit.kind === 'remove' && previous.length) {
      const schema = createNativeRuntimeParametersSchema(input.capability);
      const resources = createSchemaResourceContext(schema);
      const projections = schemasAtPointer(
        resources.root,
        parentPointer,
        resources,
      );
      const kinds = (['object', 'array'] as const).filter((kind) =>
        projections.some((projection) =>
          schemaAllowsContainer(projection, kind),
        ),
      );
      if (kinds.length !== 1)
        throw new Error(
          `${input.source}${edit.pointer}: removal needs an explicit parent container`,
        );
      arrayParent = kinds[0] === 'array';
    }
    if (arrayParent && edit.kind === 'remove') {
      const tokens = pointerTokens(edit.pointer);
      const index = Number(tokens.at(-1));
      if (
        pointers.some((pointer) => {
          const owner = pointerTokens(pointer);
          return (
            owner.length >= tokens.length &&
            tokens
              .slice(0, -1)
              .every((token, position) => owner[position] === token) &&
            Number(owner[tokens.length - 1]) > index
          );
        })
      )
        throw new Error(
          `${input.source}${edit.pointer}: removal would shift a runtime-owned array index; explicitly replace the array`,
        );
    }
    if (hasPointer(node.parameters, edit.pointer))
      values.push({ kind: 'remove', pointer: edit.pointer });
    else if (
      edit.kind === 'remove' &&
      !previous.some(
        (pointer) =>
          pointer === edit.pointer || pointer.startsWith(edit.pointer + '/'),
      )
    )
      throw new Error(
        `${input.source}${edit.pointer}: cannot remove an absent value or owner`,
      );
  }
  let parameters = node.parameters;
  for (const edit of orderWorkflowDraftValueEdits(values)) {
    const parentPointer = edit.pointer.slice(0, edit.pointer.lastIndexOf('/'));
    const parent = pointerValue(parameters, parentPointer);
    if (
      edit.kind === 'remove' &&
      edits.some(
        (change) => change.kind === 'defer' && change.pointer === edit.pointer,
      ) &&
      Array.isArray(parent) &&
      Number(pointerTokens(edit.pointer).at(-1)) !== parent.length - 1
    )
      throw new Error(
        `${input.source}${edit.pointer}: deferral would create a sparse literal array; explicitly defer its suffix or whole array`,
      );
    const updated = applyWorkflowDraftValueEdits({
      value: parameters,
      edits: [edit],
      source: input.source,
    });
    parameters = workflowDraftNativeNodeSchema.shape.parameters.parse(updated);
  }
  return workflowDraftNativeNodeSchema.parse({
    id: node.id,
    capability: node.capability,
    parameters,
    ...(pointers.length ? { runtimeParameters: { pointers } } : {}),
  });
}

import type { NativeMaterialFeatureDefinition } from '../../../types/native-material-binding.js';
import {
  responseEvaluationParametersSchema,
  createResponseEvaluationPlanningSchema,
} from '../../../schemas/response-evaluation-schema.js';

export const responseEvaluationDefinition: NativeMaterialFeatureDefinition = {
  name: 'evaluate-responses',
  description:
    'Evaluate scenario-defined comparisons and return per-check normal/warning/abnormal/undetermined data plus counts; a valid adverse result does not throw. Read supplied OAS responses or actual native outputs without coercion. value evaluates once; array-items/object-values report every original entry with its escaped source pointer. Missing optional values and empty iterated collections are undetermined. array-length is an explicit separate measurement. unassessed records missing decision rules. Invalid contracts, identities, references and operator types remain errors. Join independent branches before evaluation. This reports checks; it does not invent health thresholds, paginate, invoke APIs or classify arbitrary business data.',
  parametersSchema: responseEvaluationParametersSchema,
  createPlanningParametersSchema: createResponseEvaluationPlanningSchema,
  referenceStructureSchema: responseEvaluationParametersSchema,
  parameterReferenceSources: ['response', 'node-output'],
  materialRequirements: [],
  parameterReferenceBindings: (value) =>
    responseEvaluationParametersSchema
      .parse(value)
      .checks.map((check, index) => ({
        nodeIdPointer: `/checks/${index}/source/nodeId`,
        valuePointer: `/checks/${index}/source/pointer`,
        reference: { ...check.source },
      })),
  inputPorts: () => ['main'],
  outputPorts: () => ['main'],
  waitsForAllInputs: false,
  exclusiveOutputPorts: false,
};

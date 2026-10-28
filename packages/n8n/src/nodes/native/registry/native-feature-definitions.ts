import { createIfCapability } from '../if-capability.js';
import { nativeValueCollectionDefinition } from '../collection/native-value-collection-definition.js';
import { createNativeValueCollectionCapability } from '../collection/create-native-value-collection-capability.js';
import { nativeOutputProjectionDefinition } from '../objects/native-output-projection-definition.js';
import { createNativeOutputProjectionCapability } from '../objects/create-native-output-projection-capability.js';
import { apiResponseKeyJoinDefinition } from '../key-join/api-response-key-join-definition.js';
import { createApiResponseKeyJoinCapability } from '../key-join/create-api-response-key-join-capability.js';
import { apiResponseMapEntryDefinition } from '../maps/api-response-map-entry-definition.js';
import { createApiResponseMapEntryCapability } from '../maps/create-api-response-map-entry-capability.js';
import { createMergeAppendCapability } from '../merge-append-capability.js';
import { createResponseAssertionCapability } from '../response-assertion-capability.js';
import { createResponseEvaluationCapability } from '../evaluation/create-response-evaluation-capability.js';
import { createStopAndErrorCapability } from '../stop-and-error-capability.js';
import { createPassThroughCapability } from '../create-pass-through-capability.js';
import { createExclusiveBranchMergeCapability } from '../create-exclusive-branch-merge-capability.js';
import { createJsonOutputCapability } from '../create-json-output-capability.js';
import { createResponseArrayCapability } from '../create-response-array-capability.js';
import { createResponseCollectionCapability } from '../create-response-collection-capability.js';
import { createNativeArrayCapability } from '../arrays/create-native-array-capability.js';
import { createItemJoinCapability } from '../item-join/create-item-join-capability.js';
import { createBoundNativeArrayCapability } from '../arrays/create-bound-native-array-capability.js';
import { createBoundItemJoinCapability } from '../item-join/create-bound-item-join-capability.js';
import { createMaterialPlanningCapability } from '../common/create-material-planning-capability.js';
import { responseArrayDefinition } from '../response-array-definition.js';
import { responseCollectionDefinition } from '../response-collection-definition.js';
import { apiResponseObjectDefinition } from '../objects/api-response-object-definition.js';
import { createApiResponseObjectCapability } from '../objects/create-api-response-object-capability.js';
import { apiResponseResultsDefinition } from '../results/api-response-results-definition.js';
import { createApiResponseResultsCapability } from '../results/create-api-response-results-capability.js';
import { nativeArrayDefinition } from '../arrays/native-array-definition.js';
import { itemJoinDefinition } from '../item-join/item-join-definition.js';
import { nativeFeatureMaterialRequirements } from './native-feature-material-requirements.js';
import { N8nNativeFeature } from '../../../types/native-feature-registry.js';
import type { N8nNativeFeatureDefinition } from '../../../types/native-feature-registry.js';

/** Material prerequisites belong to their actual factories, not model prompts. */
export const nativeFeatureDefinitions: Record<
  N8nNativeFeature,
  N8nNativeFeatureDefinition
> = {
  [N8nNativeFeature.CollectNativeOutputValues]: {
    requirements: nativeFeatureMaterialRequirements(
      nativeValueCollectionDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(
        nativeValueCollectionDefinition,
        (sources) =>
          createNativeValueCollectionCapability({
            sources: sources.nativeOutputs,
          }),
      ),
    create: (context) =>
      createNativeValueCollectionCapability({
        sources: context.nativeOutputSources!,
      }),
  },
  [N8nNativeFeature.ProjectNativeOutput]: {
    requirements: nativeFeatureMaterialRequirements(
      nativeOutputProjectionDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(
        nativeOutputProjectionDefinition,
        (sources) =>
          createNativeOutputProjectionCapability({
            sources: sources.nativeOutputs,
          }),
      ),
    create: (context) =>
      createNativeOutputProjectionCapability({
        sources: context.nativeOutputSources!,
      }),
  },
  [N8nNativeFeature.JoinApiResponseArraysByKey]: {
    requirements: nativeFeatureMaterialRequirements(
      apiResponseKeyJoinDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(
        apiResponseKeyJoinDefinition,
        (sources) =>
          createApiResponseKeyJoinCapability({
            materials: sources.apiMaterials,
          }),
      ),
    create: (context) =>
      createApiResponseKeyJoinCapability({ materials: context.apiMaterials! }),
  },
  [N8nNativeFeature.SelectApiResponseMapEntry]: {
    requirements: nativeFeatureMaterialRequirements(
      apiResponseMapEntryDefinition,
    ),
    createPlanning: (context) =>
      createMaterialPlanningCapability(
        apiResponseMapEntryDefinition,
        (sources) =>
          createApiResponseMapEntryCapability({
            materials: sources.apiMaterials,
            itemMode: context.itemMode,
          }),
      ),
    create: (context) =>
      createApiResponseMapEntryCapability({
        materials: context.apiMaterials!,
        itemMode: context.itemMode,
      }),
  },
  [N8nNativeFeature.If]: {
    requirements: [],
    create: createIfCapability,
  },
  [N8nNativeFeature.MergeAppend]: {
    requirements: [],
    create: createMergeAppendCapability,
  },
  [N8nNativeFeature.AssertResponses]: {
    requirements: [],
    create: createResponseAssertionCapability,
  },
  [N8nNativeFeature.EvaluateResponses]: {
    requirements: [],
    create: (context) =>
      createResponseEvaluationCapability({
        sources: {
          apiMaterials:
            context.apiMaterials === undefined ? [] : context.apiMaterials,
          nativeOutputs:
            context.nativeOutputSources === undefined
              ? []
              : context.nativeOutputSources,
        },
        itemMode: context.itemMode,
      }),
  },
  [N8nNativeFeature.StopAndError]: {
    requirements: [],
    create: createStopAndErrorCapability,
  },
  [N8nNativeFeature.PassThrough]: {
    requirements: [],
    create: createPassThroughCapability,
  },
  [N8nNativeFeature.RejoinExclusiveBranches]: {
    requirements: [],
    create: createExclusiveBranchMergeCapability,
  },
  [N8nNativeFeature.JsonOutput]: {
    requirements: [{ field: 'jsonOutput' }],
    create: (context) => createJsonOutputCapability(context.jsonOutput!),
  },
  [N8nNativeFeature.SplitApiResponseArray]: {
    requirements: nativeFeatureMaterialRequirements(responseArrayDefinition),
    createPlanning: (context) =>
      createMaterialPlanningCapability(responseArrayDefinition, (sources) =>
        createResponseArrayCapability({
          materials: sources.apiMaterials,
          itemMode: context.itemMode,
        }),
      ),
    create: (context) =>
      createResponseArrayCapability({
        materials: context.apiMaterials!,
        itemMode: context.itemMode,
      }),
  },
  [N8nNativeFeature.CollectApiResponses]: {
    requirements: nativeFeatureMaterialRequirements(
      responseCollectionDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(
        responseCollectionDefinition,
        (sources) =>
          createResponseCollectionCapability({
            materials: sources.apiMaterials,
          }),
      ),
    create: (context) =>
      createResponseCollectionCapability({ materials: context.apiMaterials! }),
  },
  [N8nNativeFeature.ComposeApiResponses]: {
    planningExposure: 'explicit-only',
    requirements: nativeFeatureMaterialRequirements(
      apiResponseObjectDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(apiResponseObjectDefinition, (sources) =>
        createApiResponseObjectCapability({ materials: sources.apiMaterials }),
      ),
    create: (context) =>
      createApiResponseObjectCapability({ materials: context.apiMaterials! }),
  },
  [N8nNativeFeature.GatherApiResponses]: {
    requirements: nativeFeatureMaterialRequirements(
      apiResponseResultsDefinition,
    ),
    createPlanning: () =>
      createMaterialPlanningCapability(
        apiResponseResultsDefinition,
        (sources) =>
          createApiResponseResultsCapability({
            materials: sources.apiMaterials,
          }),
      ),
    create: (context) =>
      createApiResponseResultsCapability({ materials: context.apiMaterials! }),
  },
  [N8nNativeFeature.SplitNativeOutputArray]: {
    requirements: nativeFeatureMaterialRequirements(nativeArrayDefinition),
    createPlanning: (context) =>
      createMaterialPlanningCapability(nativeArrayDefinition, (sources) =>
        createBoundNativeArrayCapability({
          sources: sources.nativeOutputs,
          itemMode: context.itemMode,
          runtime: { kind: 'compiled' },
        }),
      ),
    create: (context) =>
      createNativeArrayCapability({
        sources: context.nativeOutputSources!,
        itemMode: context.itemMode,
      }),
  },
  [N8nNativeFeature.JoinApiItems]: {
    requirements: nativeFeatureMaterialRequirements(itemJoinDefinition),
    createPlanning: () =>
      createMaterialPlanningCapability(itemJoinDefinition, (sources) =>
        createBoundItemJoinCapability({
          materials: sources.apiMaterials,
          scopes: sources.nativeOutputs,
          runtime: { kind: 'compiled' },
        }),
      ),
    create: (context) =>
      createItemJoinCapability({
        materials: context.apiMaterials!,
        scopes: context.nativeOutputSources!,
      }),
  },
};

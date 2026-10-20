import { createIfCapability } from '../if-capability.js';
import { createMergeAppendCapability } from '../merge-append-capability.js';
import { createResponseAssertionCapability } from '../response-assertion-capability.js';
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

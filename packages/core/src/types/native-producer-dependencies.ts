export interface NativeProducerDependencyTarget {
  nodeId: string;
  description: string;
  sourceNodeIds: string[];
}

export interface NativeProducerDependencySchemaInput {
  targets: NativeProducerDependencyTarget[];
  includeExplanations: boolean;
}

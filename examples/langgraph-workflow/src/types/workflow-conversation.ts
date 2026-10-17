import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { OrchestratedGraphDependencies } from './workflow-graph.js';
import type { conversationStateSchema } from '../schemas/conversation-state-schema.js';
import type { z } from 'zod';
import type { inputAnswersResponseSchema } from '../schemas/conversation-response-schema.js';

export interface ConversationalGraphDependencies extends OrchestratedGraphDependencies {
  checkpointer: BaseCheckpointSaver;
}

export type ConversationState = typeof conversationStateSchema.State;
export type ConversationUpdate = typeof conversationStateSchema.Update;
export type ConversationInputResponse = z.infer<
  typeof inputAnswersResponseSchema
>;

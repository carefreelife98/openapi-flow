import { z } from 'zod';

export const draftConversationWorkKindSchema = z.enum([
  'native-dependencies',
  'api-media',
  'api-binding-inputs',
  'api-bindings',
  'api-arguments',
  'api-input-targets',
  'api-input-values',
  'api-binding-edit',
  'native-addition',
  'native-addition-ownership',
  'native-targets',
  'native-values',
  'api-repair',
  'native-repair',
]);

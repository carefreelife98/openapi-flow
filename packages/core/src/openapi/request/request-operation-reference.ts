import { pointerSegment } from '../common/operation-reference.js';

export function requestOperationReference(path: string, key: string): string {
  return '#/paths/' + pointerSegment(path) + '/' + key;
}

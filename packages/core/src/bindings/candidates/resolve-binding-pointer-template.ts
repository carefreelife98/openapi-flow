import { isBindingPointerKeyAllowed } from './is-binding-pointer-key-allowed.js';
import type {
  BindingPointerSelections,
  BindingPointerTemplate,
} from '../../types/api-binding-candidates.js';

export function resolveBindingPointerTemplate(
  template: BindingPointerTemplate,
  selections: BindingPointerSelections,
): string {
  const tokens: string[] = [];
  let selected = 0;
  for (const segment of template.segments) {
    if (segment.kind === 'property') {
      tokens.push(segment.value);
      continue;
    }
    const key = 's' + selected++;
    if (!Object.hasOwn(selections, key))
      throw new Error(`Binding selection ${key} is missing`);
    const value = selections[key];
    if (segment.kind === 'index') {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < segment.minimum ||
        (segment.maximum !== undefined && value > segment.maximum)
      )
        throw new Error(
          `Binding selection ${key} must be an allowed array index`,
        );
      tokens.push(String(value));
    } else if (segment.kind === 'key') {
      if (
        typeof value !== 'string' ||
        !isBindingPointerKeyAllowed(segment, value)
      )
        throw new Error(
          `Binding selection ${key} must be an allowed object key`,
        );
      tokens.push(value);
    } else {
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.some((token) => typeof token !== 'string')
      )
        throw new Error(
          `Binding selection ${key} must contain explicit descendant tokens`,
        );
      tokens.push(...value);
    }
  }
  if (Object.keys(selections).length !== selected)
    throw new Error('Binding selections contain undeclared slots');
  return tokens.length
    ? '/' +
        tokens
          .map((token) => token.replaceAll('~', '~0').replaceAll('/', '~1'))
          .join('/')
    : '';
}

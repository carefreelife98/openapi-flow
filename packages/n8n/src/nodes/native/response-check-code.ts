import type { NativeCheck } from '../../types/native-capability.js';
import { javascriptJsonLiteral } from '../../utils/javascript-json-literal.js';
import { responseReferences } from './common/response-references.js';

/** Library-owned runtime, shared by IF expressions and assertion Code nodes. */
function responseCheckRuntime(): string {
  return `
function read(operand) {
  if (operand.source === 'literal') return operand.value;
  if (!Object.hasOwn(responses, operand.nodeId) || responses[operand.nodeId] === undefined)
    throw new Error('Missing response body: ' + operand.nodeId);
  let value = responses[operand.nodeId];
  if (operand.pointer === '') return value;
  for (const encoded of operand.pointer.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key))
      throw new Error('Missing response pointer: ' + operand.nodeId + operand.pointer);
    value = value[key];
  }
  return value;
}
function equal(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
function compare(check) {
  const left = read(check.left), right = read(check.right);
  switch (check.operator) {
    case 'equals': return equal(left, right);
    case 'notEquals': return !equal(left, right);
    case 'keysEqual':
      if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) || Array.isArray(right))
        throw new Error('keysEqual requires objects');
      return equal(Object.keys(left).sort(), Object.keys(right).sort());
    case 'greaterThan': case 'lessThan':
      if (typeof left !== 'number' || typeof right !== 'number') throw new Error('Numeric comparison requires numbers');
      return check.operator === 'greaterThan' ? left > right : left < right;
    default: throw new Error('Unknown comparison operator');
  }
}`;
}

export function responseCheckCode(responseReaderCode: string): string {
  return `${responseReaderCode}\n${responseCheckRuntime()}`;
}

export function conditionExpression(
  check: NativeCheck,
  names: Record<string, string>,
  linked = false,
): string {
  const declaredNames = Object.fromEntries(
    responseReferences([check]).map((ref) => [ref.nodeId, names[ref.nodeId]]),
  );
  // The preceding Code guard validates full responses. Keep IF expressions small.
  const reader = `const names=${javascriptJsonLiteral(declaredNames)};
const responses=Object.create(null);
for (const id of Object.keys(names)) {
  ${linked ? 'const envelope=$(names[id]).itemMatching(inputIndex);' : "const items=$(names[id]).all();if(items.length!==1)throw new Error('Response '+id+' requires an unambiguous single JSON item');const envelope=items[0];"}
  if (!envelope || !envelope.json || !Object.hasOwn(envelope.json, 'body'))
    throw new Error('Missing response body: '+id);
  responses[id]=envelope.json.body;
}
`;
  return `={{ (() => { ${linked ? 'const inputIndex=$itemIndex;' : ''}${responseCheckCode(reader)}; return compare(${javascriptJsonLiteral(check)}); })() }}`;
}

/** Compare JSON values without normalizing their types or object key order. */
export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right))
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        jsonValuesEqual(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

/** JSON Schema equality is structural; JavaScript prototypes are not JSON data. */
function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  )
    return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length !== right.length
  )
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

// Ajv standalone requires a CommonJS module's plain default field.
module.exports = { default: jsonValuesEqual };

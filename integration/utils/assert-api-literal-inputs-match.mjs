import assert from 'node:assert/strict';

const namedParameterLocations = new Set(['path', 'query', 'header', 'cookie']);

// Evaluation-only equivalence: an empty named-parameter map supplies no field.
// Body presence, individual parameter values and all other roots remain exact.
function suppliedLiteralFields(values) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([location, value]) =>
        !(
          namedParameterLocations.has(location) &&
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0
        ),
    ),
  );
}

export function assertApiLiteralInputsMatch(actual, expected) {
  assert.deepEqual(
    suppliedLiteralFields(actual),
    suppliedLiteralFields(expected),
  );
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { filterPropertiesForVersion } from '@n8n/workflow-sdk';
import { OpenApiFlowError } from '@openapi-flow/core';
import {
  createN8nOfficialNodePlanningCatalog,
  createN8nOfficialNodeChoiceSchema,
  resolveN8nOfficialNodeChoice,
} from '@openapi-flow/n8n';
import { z } from 'zod';
import { officialNodePlanningFixture } from './fixtures/official-node-planning-fixture.mjs';

test('official catalog preserves exact versions and delegates nested property filtering to the public SDK', () => {
  const input = officialNodePlanningFixture();
  const original = globalThis.structuredClone(input);
  const catalog = createN8nOfficialNodePlanningCatalog(input);
  assert.deepEqual(input, original);
  assert.deepEqual(
    catalog.materials.map((entry) => entry.selection),
    input.selections,
  );
  for (const material of catalog.materials) {
    const source = input.definitions.find(
      (definition) => definition.name === material.selection.nodeType,
    );
    assert.deepEqual(material.definition, source);
    assert.deepEqual(
      material.versionProperties,
      filterPropertiesForVersion(source.properties, material.selection.version),
    );
    assert.equal(Object.hasOwn(material, 'parameters'), false);
    assert.equal(Object.hasOwn(material, 'outputSchema'), false);
    assert.equal(Object.hasOwn(material, 'capability'), false);
  }
  const [old, current] = catalog.materials;
  assert.deepEqual(
    old.versionProperties.map((entry) => entry.name),
    ['mode', 'options'],
  );
  assert.equal(old.versionProperties[0].options.length, 1);
  assert.equal(old.versionProperties[1].options[0].values.length, 1);
  assert.equal(current.versionProperties.length, 3);
  assert.equal(current.versionProperties[0].options.length, 2);
  assert.equal(current.versionProperties[1].default, 'not-a-user-value');
  // Metadata defaults are preserved as metadata; no workflow request values are generated.
  assert.equal(old.definition.defaultVersion, 2);
  assert.equal(old.selection.version, 1);
});

test('dynamic port expressions remain unresolved; static zero/multiple/named ports retain original declarations', () => {
  const input = officialNodePlanningFixture();
  input.definitions[1].outputs.push({ type: 'main', displayName: 'Second' });
  const catalog = createN8nOfficialNodePlanningCatalog(input);
  assert.deepEqual(catalog.materials[0].inputs, {
    status: 'dynamic-expression',
    expression: input.definitions[0].inputs,
  });
  assert.deepEqual(catalog.materials[0].outputs, {
    status: 'declared',
    ports: ['main'],
  });
  assert.deepEqual(catalog.materials[2].inputs, {
    status: 'declared',
    ports: [],
  });
  assert.deepEqual(
    catalog.materials[2].outputs.ports,
    input.definitions[1].outputs,
  );
  input.definitions[0].outputs = '={{ $parameter.mode }}';
  assert.equal(
    createN8nOfficialNodePlanningCatalog(input).materials[0].outputs.status,
    'dynamic-expression',
  );
});

test('catalog and resolved choices are snapshots without aliases across versions, calls or source metadata', () => {
  const input = officialNodePlanningFixture();
  const original = globalThis.structuredClone(input);
  const catalog = createN8nOfficialNodePlanningCatalog(input);
  const expected = globalThis.structuredClone(catalog);
  const selected = resolveN8nOfficialNodeChoice(
    catalog,
    catalog.materials[0].definitionId,
  );
  selected.definition.properties[0].name = 'consumer mutation';
  selected.versionProperties[0].options[0].name = 'consumer mutation';
  selected.outputs.ports.push('consumer mutation');
  assert.deepEqual(catalog, expected);
  catalog.materials[0].definition.properties[0].name = 'catalog mutation';
  catalog.materials[0].versionProperties[0].name = 'projection mutation';
  assert.equal(catalog.materials[1].definition.properties[0].name, 'mode');
  assert.equal(catalog.materials[0].definition.properties[1].name, 'newOnly');
  assert.deepEqual(input, original);
  assert.deepEqual(createN8nOfficialNodePlanningCatalog(input), expected);
});

test('selection is exact: missing version/name, implicit latest, unknown version and duplicate source/choice fail at the input boundary', () => {
  for (const mutate of [
    (input) => {
      delete input.selections;
    },
    (input) => {
      delete input.selections[0].version;
    },
    (input) => {
      input.selections[0].version = '1';
    },
    (input) => {
      input.selections[0].version = Number.NaN;
    },
    (input) => {
      input.selections[0].nodeType = ' ';
    },
    (input) => {
      input.selections[0].nodeType = 'fixture.nodes.missing';
    },
    (input) => {
      input.selections[0].version = 999;
    },
    (input) => {
      input.selections.push(input.selections[0]);
    },
    (input) => {
      input.definitions.push(input.definitions[0]);
    },
    (input) => {
      input.definitions = undefined;
    },
  ]) {
    const input = officialNodePlanningFixture();
    mutate(input);
    const snapshot = globalThis.structuredClone(input);
    assert.throws(
      () => createN8nOfficialNodePlanningCatalog(input),
      (error) => {
        assert.ok(error instanceof OpenApiFlowError);
        assert.equal(error.diagnostic.code, 'PLANNING_INPUT_INVALID');
        assert.equal(error.diagnostic.stage, 'input-validation');
        assert.equal(
          error.diagnostic.operation,
          'createN8nOfficialNodePlanningCatalog',
        );
        assert.ok(error.cause instanceof Error);
        assert.match(error.message, /official node (selections|definitions)/);
        return true;
      },
    );
    assert.deepEqual(input, snapshot);
  }
});

test('missing consumed official fields fail rather than inventing a display name, port or empty property contract', () => {
  for (const [field, value] of [
    ['displayName', undefined],
    ['properties', undefined],
    ['inputs', undefined],
    ['inputs', ' '],
    ['inputs', [null]],
    ['outputs', [{ displayName: 'missing type' }]],
  ]) {
    const input = officialNodePlanningFixture();
    input.definitions[0][field] = value;
    assert.throws(
      () => createN8nOfficialNodePlanningCatalog(input),
      new RegExp(`fixture.nodes.combine@1\\.${field}`),
    );
  }
});

test('choice schema contains existing IDs only; repeating a definition for different planned roles is allowed', () => {
  const catalog = createN8nOfficialNodePlanningCatalog(
    officialNodePlanningFixture(),
  );
  const schema = createN8nOfficialNodeChoiceSchema(catalog);
  const json = z.toJSONSchema(schema);
  assert.deepEqual(
    json.enum,
    catalog.materials.map((entry) => entry.definitionId),
  );
  assert.equal(schema.safeParse('fixture.nodes.combine@999').success, false);
  const id = catalog.materials[0].definitionId;
  assert.deepEqual(z.array(schema).parse([id, id]), [id, id]);
  assert.deepEqual(
    resolveN8nOfficialNodeChoice(catalog, id),
    catalog.materials[0],
  );
  assert.throws(
    () => resolveN8nOfficialNodeChoice(catalog, 'invented'),
    (error) => {
      assert.equal(error.diagnostic.code, 'NATIVE_NODE_PLANNING_FAILED');
      assert.equal(error.diagnostic.stage, 'contract-validation');
      assert.equal(error.diagnostic.operation, 'resolveN8nOfficialNodeChoice');
      return true;
    },
  );
  catalog.materials.push(catalog.materials[0]);
  assert.throws(
    () => createN8nOfficialNodeChoiceSchema(catalog),
    /must be unique/,
  );
});

test('explicit empty allowlist stays empty with no default feature selection', () => {
  const catalog = createN8nOfficialNodePlanningCatalog({
    ...officialNodePlanningFixture(),
    selections: [],
  });
  assert.deepEqual(catalog, { materials: [] });
  assert.equal(
    createN8nOfficialNodeChoiceSchema(catalog).safeParse('anything').success,
    false,
  );
  assert.throws(
    () => resolveN8nOfficialNodeChoice(catalog, 'anything'),
    /not a supplied definitionId/,
  );
});

test('a large explicit version list is not truncated and definition IDs do not depend on selection order', () => {
  const { definitions } = officialNodePlanningFixture();
  const versions = Array.from({ length: 512 }, (_, index) => index + 1);
  definitions[0].version = versions;
  const selections = versions.map((version) => ({
    nodeType: definitions[0].name,
    version,
  }));
  const catalog = createN8nOfficialNodePlanningCatalog({
    definitions,
    selections,
  });
  const reversed = createN8nOfficialNodePlanningCatalog({
    definitions,
    selections: selections.toReversed(),
  });
  assert.equal(catalog.materials.length, 512);
  assert.deepEqual(reversed.materials.toReversed(), catalog.materials);
  assert.equal(
    z.toJSONSchema(createN8nOfficialNodeChoiceSchema(catalog)).enum.length,
    512,
  );
});

test('choice schema reports its own malformed catalog boundary without accepting fabricated empty IDs', () => {
  for (const catalog of [
    undefined,
    {},
    { materials: null },
    { materials: [null] },
    { materials: [{ definitionId: ' ' }] },
  ]) {
    assert.throws(
      () => createN8nOfficialNodeChoiceSchema(catalog),
      (error) => {
        assert.equal(error.diagnostic.code, 'PLANNING_INPUT_INVALID');
        assert.equal(
          error.diagnostic.operation,
          'createN8nOfficialNodeChoiceSchema',
        );
        assert.match(error.message, /official node catalog/);
        return true;
      },
    );
  }
});

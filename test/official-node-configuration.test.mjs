import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getSchemaBaseDirs,
  setSchemaBaseDirs,
  orchestrateGeneration,
  validateNodeConfig,
  workflow,
} from '@n8n/workflow-sdk';
import { OpenApiFlowError } from '@openapi-flow/core';
import {
  createN8nOfficialNodePlanningCatalog,
  validateN8nOfficialNodeConfiguration,
  createN8nOfficialNode,
} from '@openapi-flow/n8n';
import { officialNodePlanningFixture } from './fixtures/official-node-planning-fixture.mjs';

let directory;
let catalog;
before(async () => {
  directory = await realpath(
    await mkdtemp(join(tmpdir(), 'openapi-flow-official-config-')),
  );
  const fixture = officialNodePlanningFixture();
  const definitions = fixture.definitions.map((entry) => ({
    ...entry,
    name: entry.name.replace('fixture.nodes.', 'fixture.'),
  }));
  const generated = await orchestrateGeneration({
    nodes: definitions,
    outputDir: directory,
  });
  assert.equal(generated.nodeCount, definitions.length);
  catalog = createN8nOfficialNodePlanningCatalog({
    definitions,
    selections: [
      { nodeType: 'fixture.combine', version: 1 },
      { nodeType: 'fixture.trigger', version: 1 },
    ],
  });
});

function validationInput(parameters = { mode: 'append' }) {
  return {
    catalog,
    definitionId: 'fixture.combine@1',
    schemaDirectories: [directory],
    configuration: { parameters },
  };
}

function constructionInput(parameters = { mode: 'append' }) {
  return {
    ...validationInput(parameters),
    configuration: {
      id: 'combine-step',
      name: 'Combine step',
      position: [220, 40],
      parameters,
      notes: 'Host supplied note',
      notesInFlow: true,
    },
  };
}

test('public official configuration guard rejects unloaded schemas instead of inheriting SDK valid:true', () => {
  const previous = [...getSchemaBaseDirs()];
  try {
    setSchemaBaseDirs([]);
    assert.equal(
      validateNodeConfig('fixture.combine', 1, {
        parameters: { mode: 'invalid' },
      }).valid,
      true,
    );
    assert.throws(
      () =>
        validateN8nOfficialNodeConfiguration({
          ...validationInput(),
          schemaDirectories: [tmpdir()],
        }),
      (error) => {
        assert.ok(error instanceof OpenApiFlowError);
        assert.equal(
          error.diagnostic.operation,
          'validateN8nOfficialNodeConfiguration',
        );
        assert.match(
          error.message,
          /fixture.combine@1.*schema is not verified as loaded/,
        );
        assert.ok(error.cause instanceof Error);
        return true;
      },
    );
    assert.deepEqual(getSchemaBaseDirs(), []);
  } finally {
    setSchemaBaseDirs(previous);
  }
});

test('explicit schema scope validates values while restoring SDK paths and preserving input settings', () => {
  const previous = [...getSchemaBaseDirs()];
  const input = validationInput();
  const original = globalThis.structuredClone(input);
  try {
    setSchemaBaseDirs(['/explicit/unrelated-schema-root']);
    assert.deepEqual(validateN8nOfficialNodeConfiguration(input), {
      valid: true,
      errors: [],
    });
    assert.deepEqual(input, original);
    const invalid = validateN8nOfficialNodeConfiguration(
      validationInput({ mode: 'invalid' }),
    );
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.length > 0);
    assert.deepEqual(getSchemaBaseDirs(), ['/explicit/unrelated-schema-root']);
    assert.equal(validateN8nOfficialNodeConfiguration(input).valid, true);
    assert.deepEqual(getSchemaBaseDirs(), ['/explicit/unrelated-schema-root']);
  } finally {
    setSchemaBaseDirs(previous);
  }
});

test('missing paths, unknown versions and non-JSON parameters fail without defaults or global changes', () => {
  const previous = [...getSchemaBaseDirs()];
  assert.throws(
    () => validateN8nOfficialNodeConfiguration(undefined),
    /validation input is required/,
  );
  for (const mutate of [
    (input) => {
      delete input.schemaDirectories;
    },
    (input) => {
      input.schemaDirectories = [];
    },
    (input) => {
      input.schemaDirectories = ['relative/path'];
    },
    (input) => {
      input.definitionId = 'fixture.combine@999';
    },
    (input) => {
      delete input.configuration;
    },
    (input) => {
      delete input.configuration.parameters;
    },
    (input) => {
      input.configuration.parameters = null;
    },
    (input) => {
      input.configuration.parameters = [];
    },
    (input) => {
      input.configuration.parameters = { mode: Number.NaN };
    },
    (input) => {
      input.configuration.parameters = { mode: undefined };
    },
  ]) {
    const input = validationInput();
    mutate(input);
    assert.throws(
      () => validateN8nOfficialNodeConfiguration(input),
      OpenApiFlowError,
    );
    assert.deepEqual(getSchemaBaseDirs(), previous);
  }
});

test('SDK construction preserves the exact chosen node version, parameters and explicit node settings', () => {
  const input = constructionInput();
  const original = globalThis.structuredClone(input);
  const sdkNode = createN8nOfficialNode(input);
  const json = workflow('proof', 'Configuration proof').add(sdkNode).toJSON();
  assert.deepEqual(input, original);
  assert.deepEqual(json.nodes[0], {
    id: input.configuration.id,
    name: input.configuration.name,
    type: 'fixture.combine',
    typeVersion: 1,
    position: input.configuration.position,
    parameters: input.configuration.parameters,
    notes: input.configuration.notes,
    notesInFlow: true,
  });
  input.configuration.parameters.mode = 'mutated-after-construction';
  input.configuration.position[0] = 999;
  const second = workflow('proof-again', 'Same SDK node').add(sdkNode).toJSON();
  assert.deepEqual(
    second.nodes[0].parameters,
    original.configuration.parameters,
  );
  assert.deepEqual(second.nodes[0].position, original.configuration.position);
  assert.equal(Object.hasOwn(sdkNode, 'outputSchema'), false);
});

test('invalid SDK settings and missing identity cannot produce a node or invent a required value', () => {
  const previous = [...getSchemaBaseDirs()];
  assert.throws(
    () => createN8nOfficialNode(undefined),
    /configuration identity is invalid/,
  );
  assert.throws(
    () => createN8nOfficialNode(constructionInput({ mode: 'invalid' })),
    (error) => {
      assert.equal(error.diagnostic.code, 'N8N_COMPILATION_FAILED');
      assert.match(error.message, /configuration failed SDK validation/);
      return true;
    },
  );
  for (const field of ['id', 'name', 'position']) {
    const input = constructionInput();
    delete input.configuration[field];
    assert.throws(
      () => createN8nOfficialNode(input),
      /configuration identity is invalid/,
    );
  }
  assert.deepEqual(getSchemaBaseDirs(), previous);
});

test('an explicit empty object stays empty; official defaults are not inserted by validation or construction', () => {
  const input = constructionInput({});
  assert.equal(validateN8nOfficialNodeConfiguration(input).valid, true);
  const json = workflow('empty', 'Explicit empty settings')
    .add(createN8nOfficialNode(input))
    .toJSON();
  assert.deepEqual(json.nodes[0].parameters, {});
  assert.deepEqual(input.configuration.parameters, {});
  assert.equal(catalog.materials[0].definition.properties[0].default, 'append');
});

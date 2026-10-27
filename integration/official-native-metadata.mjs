import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  writeFile,
  readFile,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import console from 'node:console';
import {
  loadNodeTypes,
  orchestrateGeneration,
  getSchemaBaseDirs,
  setSchemaBaseDirs,
  validateNodeConfig,
  discoverOutputSchemaForNode,
  workflow,
} from '@n8n/workflow-sdk';
import {
  createN8nOfficialNodePlanningCatalog,
  createN8nOfficialNodeChoiceSchema,
  resolveN8nOfficialNodeChoice,
  validateN8nOfficialNodeConfiguration,
  createN8nOfficialNode,
} from '@openapi-flow/n8n';
import { z } from 'zod';
import { runDocker } from './utils/run-docker.mjs';

// Read a pinned, isolated public distribution. No user n8n instance or private OAS.
const image = 'n8nio/n8n:2.37.10';
const require = createRequire(import.meta.url);
const sdkVersion = require('@n8n/workflow-sdk/package.json').version;
const directory = new URL(
  `../.local-artifacts/official-native-metadata/${randomUUID()}/`,
  import.meta.url,
);
const cases = [
  {
    name: 'merge',
    version: 3.2,
    parameters: {
      mode: 'combine',
      combineBy: 'combineByFields',
      fieldsToMatchString: 'key',
      joinMode: 'keepEverything',
    },
    invalid: { mode: 'not-an-official-mode' },
  },
  {
    name: 'filter',
    version: 2.3,
    parameters: {
      conditions: {
        conditions: [
          {
            leftValue: 1,
            rightValue: 1,
            operator: { type: 'number', operation: 'equals' },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    invalid: { conditions: 'not-an-official-condition' },
  },
  {
    name: 'set',
    version: 3.5,
    parameters: {
      mode: 'manual',
      assignments: {
        assignments: [
          { id: 'original', name: 'value', type: 'number', value: 0 },
        ],
      },
      options: {},
    },
    invalid: { mode: 'not-an-official-mode' },
  },
  {
    name: 'splitOut',
    version: 1,
    parameters: {
      fieldToSplitOut: 'rows',
      include: 'noOtherFields',
      options: { destinationFieldName: 'item' },
    },
    invalid: { fieldToSplitOut: 17 },
  },
  {
    name: 'aggregate',
    version: 1,
    parameters: {
      aggregate: 'aggregateAllItemData',
      destinationFieldName: 'rows',
      options: {},
    },
    invalid: { aggregate: 17 },
  },
  {
    name: 'splitInBatches',
    version: 3,
    parameters: { batchSize: 2, options: {} },
    invalid: { batchSize: 'not-an-expression-or-number' },
  },
];
await mkdir(directory, { recursive: true });
const readDistribution = await runDocker([
  'run',
  '--rm',
  '--entrypoint',
  'node',
  image,
  '-e',
  `
const fs=require('node:fs'),path=require('node:path');
const req=require('node:module').createRequire('/usr/local/lib/node_modules/n8n/package.json');
const root=path.dirname(req.resolve('n8n-nodes-base/package.json'));
process.stdout.write(fs.readFileSync(root+'/dist/types/nodes.json','utf8'));
`,
]);
assert.equal(readDistribution.code, 0, readDistribution.stderr);
const inspectedImage = await runDocker([
  'image',
  'inspect',
  image,
  '--format',
  '{{.Id}}',
]);
assert.equal(inspectedImage.code, 0, inspectedImage.stderr);
const imageId = inspectedImage.stdout.trim();
assert.match(imageId, /^sha256:[a-f0-9]{64}$/);
const sourcePath = new URL('official-nodes.json', directory);
await writeFile(sourcePath, readDistribution.stdout);
const definitions = await loadNodeTypes(sourcePath.pathname, 'n8n-nodes-base');
const catalog = createN8nOfficialNodePlanningCatalog({
  definitions,
  selections: cases.map((entry) => ({
    nodeType: `n8n-nodes-base.${entry.name}`,
    version: entry.version,
  })),
});
const choiceSchema = createN8nOfficialNodeChoiceSchema(catalog);
const choiceJsonSchema = z.toJSONSchema(choiceSchema);
assert.deepEqual(
  choiceJsonSchema.enum,
  catalog.materials.map((entry) => entry.definitionId),
);
assert.equal(choiceSchema.safeParse('n8n-nodes-base.merge@999').success, false);
const selected = catalog.materials.map(
  (entry) =>
    resolveN8nOfficialNodeChoice(catalog, entry.definitionId).definition,
);
const previous = [...getSchemaBaseDirs()];
const isolatedRoot = await realpath(
  await mkdtemp(join(tmpdir(), 'openapi-flow-official-native-')),
);
// The official generator rewrites its package subfolder. Only a fresh owned temp root is passed.
console.log(
  JSON.stringify({
    status: 'started',
    directory: directory.pathname,
    nodes: selected.length,
  }),
);
try {
  setSchemaBaseDirs([]);
  const unloaded = cases.map((entry) =>
    validateNodeConfig(`n8n-nodes-base.${entry.name}`, entry.version, {
      parameters: entry.invalid,
    }),
  );
  assert.ok(
    unloaded.every((result) => result.valid),
    'Document the unloaded SDK path, not actual validation success',
  );
  const generated = await orchestrateGeneration({
    nodes: selected,
    outputDir: isolatedRoot,
  });
  assert.equal(generated.nodeCount, cases.length);
  setSchemaBaseDirs([isolatedRoot]);
  const checks = [];
  for (const [index, entry] of cases.entries()) {
    const nodeType = `n8n-nodes-base.${entry.name}`;
    const material = resolveN8nOfficialNodeChoice(
      catalog,
      catalog.materials[index].definitionId,
    );
    const parameters = globalThis.structuredClone(entry.parameters);
    const validationInput = {
      catalog,
      definitionId: material.definitionId,
      schemaDirectories: [isolatedRoot],
      configuration: { parameters },
    };
    const valid = validateN8nOfficialNodeConfiguration(validationInput);
    assert.equal(valid.valid, true, JSON.stringify(valid.errors));
    assert.deepEqual(
      parameters,
      entry.parameters,
      'Official config checking must not mutate original request settings',
    );
    const invalid = validateN8nOfficialNodeConfiguration({
      ...validationInput,
      configuration: { parameters: entry.invalid },
    });
    assert.equal(
      invalid.valid,
      false,
      `${nodeType}: prove the official schema actually loaded`,
    );
    assert.ok(invalid.errors.length > 0);
    assert.deepEqual(getSchemaBaseDirs(), [isolatedRoot]);
    assert.throws(
      () =>
        validateN8nOfficialNodeConfiguration({
          ...validationInput,
          schemaDirectories: [directory.pathname],
        }),
      /configuration schema is not verified as loaded/,
    );
    assert.deepEqual(getSchemaBaseDirs(), [isolatedRoot]);
    const configuration = {
      id: `official-${index}`,
      name: `Official ${entry.name}`,
      position: [index * 220, 0],
      parameters,
    };
    const sdkNode = createN8nOfficialNode({
      ...validationInput,
      configuration,
    });
    const json = workflow(`official-${index}`, 'Official configuration proof')
      .add(sdkNode)
      .toJSON();
    assert.equal(json.nodes[0].type, nodeType);
    assert.equal(json.nodes[0].typeVersion, entry.version);
    assert.deepEqual(json.nodes[0].parameters, entry.parameters);
    assert.deepEqual(configuration.parameters, entry.parameters);
    assert.throws(
      () =>
        createN8nOfficialNode({
          ...validationInput,
          configuration: { ...configuration, parameters: entry.invalid },
        }),
      /configuration failed SDK validation/,
    );
    const outputSchema = discoverOutputSchemaForNode(nodeType, entry.version);
    checks.push({
      nodeType,
      version: entry.version,
      definitionId: material.definitionId,
      propertyCount: material.versionProperties.length,
      inputs: material.inputs,
      outputs: material.outputs,
      validConfigurationAccepted: valid.valid,
      invalidConfigurationRejected: !invalid.valid,
      unloadedInvalidConfigurationAccepted: unloaded[index].valid,
      missingSchemaRejected: true,
      sdkNodeConstructed: true,
      invalidSdkNodeConstructionRejected: true,
      discoverableOutputValueSchema: outputSchema !== undefined,
    });
  }
  const report = {
    status: 'passed',
    image,
    imageId,
    sdkVersion,
    sourceSha256: createHash('sha256')
      .update(await readFile(sourcePath))
      .digest('hex'),
    scope:
      'Official metadata, fail-closed configuration validation and SDK node JSON construction. Not node execution, OAS output-contract inference, model parameter generation, original-five scenario generation or Qoopilot UI.',
    actualModelCalls: 0,
    businessApiCalls: 0,
    generatedTemporaryDirectory: isolatedRoot,
    choiceJsonSchema,
    checks,
  };
  await writeFile(
    new URL('report.json', directory),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      directory: directory.pathname,
      exactNodeVersions: checks.length,
      configurationChecks: checks.length * 2,
      missingSchemaGuards: checks.filter((entry) => entry.missingSchemaRejected)
        .length,
      sdkNodesConstructed: checks.filter((entry) => entry.sdkNodeConstructed)
        .length,
      dynamicInputDefinitions: checks.filter(
        (entry) => entry.inputs.status === 'dynamic-expression',
      ).length,
      discoverableOutputValueSchemas: checks.filter(
        (entry) => entry.discoverableOutputValueSchema,
      ).length,
    }),
  );
} finally {
  setSchemaBaseDirs(previous);
}

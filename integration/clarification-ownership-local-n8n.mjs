import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { pendingRequirementScopeModel } from '../test/fixtures/workflow-draft-requirement-scope-fixture.mjs';
import { verifyRequirementScope } from './requirement-scope-local-n8n.mjs';

const directory = await verifyRequirementScope({
  model: pendingRequirementScopeModel('api', { ownedConcerns: true }),
  label:
    'Two explicit planning-owned concerns retained; typed human answers, same plan, no semantic/binding/argument replay -> SDK -> isolated n8n. Deterministic model; zero business calls.',
});
const report = JSON.parse(
  await readFile(new URL('report.json', directory), 'utf8'),
);
assert.deepEqual(report.clarificationOwners, [
  { kind: 'planning-step', decisionIndex: 0, stage: 'api-arguments' },
  { kind: 'planning-step', decisionIndex: 1, stage: 'requirements' },
]);

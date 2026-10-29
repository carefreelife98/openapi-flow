import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  createResponseEvaluationWorkflow,
  createNativeResponseEvaluationWorkflow,
  evaluationBody,
} from '../test/fixtures/response-evaluation-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const workflow = await createResponseEvaluationWorkflow(
  'http://127.0.0.1:31399',
);
const nativeWorkflow = createNativeResponseEvaluationWorkflow();
const cases = [
  { name: 'mixed-outcomes', body: evaluationBody },
  {
    name: 'missing-optional',
    body: { ...evaluationBody, pools: { optional: {} }, records: [] },
  },
  {
    name: 'empty-collection',
    body: { ...evaluationBody, state: 'done', pools: {}, records: [] },
  },
  { name: 'adverse-outcome', body: { ...evaluationBody, state: 'aborted' } },
  {
    name: 'invalid-oas-value',
    body: { ...evaluationBody, state: 17 },
    invalid: true,
  },
];
// Isolated engine proof only: no external network, real service, mounts or published ports.
const runtime = `
const fs=require('node:fs'),http=require('node:http'),{spawn}=require('node:child_process');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));
function run(args){return new Promise((resolve,reject)=>{
 const child=spawn('/usr/local/bin/n8n',args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
 child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
});}
(async()=>{
 let active;const requests=[];
 const server=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  requests.push({method:req.method,path:req.url,...(raw?{body:JSON.parse(raw)}:{})});
  if(req.method==='GET'&&req.url==='/snapshot'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(active.body));return;}
  if(req.method==='POST'&&req.url==='/echo'){res.writeHead(200,{'content-type':'application/json'});res.end(raw);return;}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(31399,'127.0.0.1',resolve));
 try{
  fs.writeFileSync('/tmp/response-evaluation.json',JSON.stringify(payload.workflow));
  const imported=await run(['import:workflow','--input=/tmp/response-evaluation.json']);
  if(imported.code!==0)throw new Error('Import failed: '+imported.stdout+imported.stderr);
  const reports=[];
  for(const entry of payload.cases){
   active=entry;const before=requests.length;
   const result=await run(['execute','--id='+payload.workflow.id,'--rawOutput']);
   reports.push({name:entry.name,...result,requests:requests.slice(before)});
  }
  fs.writeFileSync('/tmp/native-response-evaluation.json',JSON.stringify(payload.nativeWorkflow));
  const nativeImported=await run(['import:workflow','--input=/tmp/native-response-evaluation.json']);
  if(nativeImported.code!==0)throw new Error('Native import failed: '+nativeImported.stdout+nativeImported.stderr);
  const beforeNative=requests.length;
  const nativeResult=await run(['execute','--id='+payload.nativeWorkflow.id,'--rawOutput']);
  reports.push({name:'native-two-checks',...nativeResult,requests:requests.slice(beforeNative)});
  process.stdout.write(JSON.stringify(reports));
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});`;
const raw = await runDocker(
  [
    'run',
    '--rm',
    '-i',
    '--network',
    'none',
    '--entrypoint',
    'node',
    '-e',
    'N8N_DIAGNOSTICS_ENABLED=false',
    '-e',
    'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
    image,
    '-e',
    runtime,
  ],
  JSON.stringify({ workflow, nativeWorkflow, cases }),
);
assert.equal(raw.code, 0, raw.stderr);
const reports = JSON.parse(raw.stdout);
const verified = [];
for (const [index, entry] of cases.entries()) {
  const report = reports[index];
  assert.equal(report.name, entry.name);
  const echo = report.requests.filter((request) => request.path === '/echo');
  if (entry.invalid) {
    assert.notEqual(
      report.code,
      0,
      'Invalid OAS value must fail, not become a health result',
    );
    assert.equal(echo.length, 0);
    assert.match(report.stdout + report.stderr, /snapshot|response|schema/i);
    verified.push({
      name: entry.name,
      invalidContractRejected: true,
      echoCalls: 0,
    });
    continue;
  }
  assert.equal(report.code, 0, report.stdout + report.stderr);
  const execution = readN8nExecution(report.stdout);
  assert.equal(
    execution.status,
    'success',
    JSON.stringify(execution.data.resultData.error),
  );
  const results = execution.data.resultData.runData.evaluate[0].data.main[0];
  assert.equal(results.length, 1);
  const result = results[0].json;
  assert.equal(echo.length, 1);
  assert.deepEqual(echo[0].body, result);
  assert.equal(report.requests.length, 2);
  assert.deepEqual(
    result.checks.find((check) => check.ruleIndex === 2).actualValue,
    entry.body.records,
  );
  assert.equal(
    result.checks.find((check) => check.ruleIndex === 2).measuredValue,
    entry.body.records.length,
  );
  assert.equal(
    result.checks.find((check) => check.ruleIndex === 3).reason,
    'no-rule',
  );
  assert.equal(
    Object.values(result.summary).reduce((sum, count) => sum + count, 0),
    result.checks.length,
  );
  if (entry.name === 'mixed-outcomes') {
    assert.deepEqual(result.summary, {
      normal: 1,
      warning: 2,
      abnormal: 1,
      undetermined: 1,
    });
    assert.equal(
      result.checks.find(
        (check) => check.source.pointer === '/pools/a~1b~0c/waiting',
      ).actualValue,
      2,
    );
    assert.equal(
      result.checks.find((check) => check.ruleIndex === 2).actualValue[0].id,
      '={{ original literal }}',
    );
  }
  if (entry.name === 'missing-optional') {
    const missing = result.checks.find((check) => check.ruleIndex === 1);
    assert.equal(missing.reason, 'missing-value');
    assert.equal(missing.status, 'undetermined');
    assert.equal(Object.hasOwn(missing, 'actualValue'), false);
  }
  if (entry.name === 'empty-collection')
    assert.equal(
      result.checks.find((check) => check.ruleIndex === 1).reason,
      'empty-collection',
    );
  if (entry.name === 'adverse-outcome')
    assert.equal(
      result.checks.find((check) => check.ruleIndex === 0).status,
      'abnormal',
    );
  verified.push({
    name: entry.name,
    status: execution.status,
    summary: result.summary,
    outputEchoPreserved: true,
  });
}
const nativeReport = reports[cases.length];
assert.equal(reports.length, cases.length + 1);
assert.equal(nativeReport.name, 'native-two-checks');
assert.equal(nativeReport.code, 0, nativeReport.stdout + nativeReport.stderr);
assert.deepEqual(nativeReport.requests, []);
const nativeExecution = readN8nExecution(nativeReport.stdout);
assert.equal(nativeExecution.status, 'success');
const nativeResult =
  nativeExecution.data.resultData.runData['evaluate-native'][0].data.main[0][0]
    .json;
assert.equal(nativeResult.summary.normal, 2);
assert.deepEqual(
  nativeResult.checks.map((check) => check.actualValue),
  [1, 'x'],
);
assert.deepEqual(
  nativeResult.checks.map((check) => check.source.pointer),
  ['/a', '/b'],
);
verified.push({
  name: nativeReport.name,
  status: nativeExecution.status,
  originalValuesPreserved: true,
  businessApiCalls: 0,
});
const directory = new URL(
  `../.local-artifacts/response-evaluation/${Date.now()}-${process.pid}/`,
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('report.json', directory),
  JSON.stringify(
    { image, network: 'none', modelCalls: 0, cases: verified },
    null,
    2,
  ),
);
await writeFile(
  new URL('workflow.json', directory),
  JSON.stringify(workflow, null, 2),
);
await writeFile(
  new URL('native-workflow.json', directory),
  JSON.stringify(nativeWorkflow, null, 2),
);
console.log(
  JSON.stringify({ cases: verified, artifacts: directory.pathname }, null, 2),
);

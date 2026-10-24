import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import {
  createApiResponseResultsFixture,
  responseResultsCalls,
} from '../test/fixtures/api-response-results-fixture.mjs';
import { runDocker } from './utils/run-docker.mjs';
import { readN8nExecution } from './utils/read-n8n-execution.mjs';

const image = 'n8nio/n8n:2.37.10';
const cases = [
  {
    name: 'strings',
    bodies: ['0007', '={{ literal text }}', '[false,0]'],
    callCount: 4,
  },
  { name: 'scalars', bodies: [0, false, null], callCount: 4 },
  {
    name: 'nested',
    bodies: [
      { rows: [null, false, 0, []] },
      [[1, null], []],
      { 'a.b': '0007', 'a/b~c': false },
    ],
    callCount: 4,
  },
  { name: 'empty', bodies: [{}, [], ''], callCount: 4 },
  { name: 'single-source', bodies: ['0007'], callCount: 1 },
];
const workflows = [];
for (const entry of cases) {
  const workflow = await createApiResponseResultsFixture(
    'http://127.0.0.1:31399',
    entry.callCount,
  );
  workflow.id = `api-results-${entry.name}`;
  workflows.push(workflow);
}
// One disposable container, loopback contract server and ephemeral filesystem only.
// No service URLs, credentials, host mounts, published ports or external network.
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
  const index=['/one','/two','/three'].indexOf(req.url);
  if(req.method==='GET'&&index>=0){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(active.bodies[index]));return;}
  if(req.method==='POST'&&req.url==='/echo'){res.writeHead(200,{'content-type':'application/json'});res.end(raw);return;}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(31399,'127.0.0.1',resolve));
 try{
  fs.writeFileSync('/tmp/api-response-results-workflows.json',JSON.stringify(payload.workflows));
  const imported=await run(['import:workflow','--input=/tmp/api-response-results-workflows.json']);
  if(imported.code!==0)throw new Error('Import failed: '+imported.stdout+imported.stderr);
  const reports=[];
  for(let i=0;i<payload.cases.length;i++){
   active=payload.cases[i];const before=requests.length;
   const result=await run(['execute','--id='+payload.workflows[i].id,'--rawOutput']);
   reports.push({name:active.name,...result,requests:requests.slice(before)});
  }
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
  JSON.stringify({ workflows, cases }),
);
assert.equal(raw.code, 0, raw.stderr);
const reports = JSON.parse(raw.stdout);
const verified = [];
for (let index = 0; index < cases.length; index += 1) {
  const entry = cases[index],
    report = reports[index];
  assert.equal(report.name, entry.name);
  assert.equal(report.code, 0, report.stdout + report.stderr);
  const execution = readN8nExecution(report.stdout);
  assert.equal(
    execution.status,
    'success',
    JSON.stringify(execution.data.resultData.error),
  );
  const expected = {
    results: responseResultsCalls
      .slice(0, entry.callCount)
      .map(({ callId, documentId, path }) => ({
        callId,
        documentId,
        method: 'GET',
        path,
        body: entry.bodies[['/one', '/two', '/three'].indexOf(path)],
      })),
  };
  const runData = execution.data.resultData.runData;
  assert.deepEqual(runData.results[0].data.main[0][0].json, expected);
  const echo = report.requests.filter((request) => request.path === '/echo');
  assert.equal(echo.length, 1);
  assert.deepEqual(echo[0].body, expected);
  assert.equal(report.requests.length, entry.callCount + 1);
  verified.push({
    name: entry.name,
    status: execution.status,
    apiCalls: entry.callCount,
    resultEntries: expected.results.length,
    echoPreserved: true,
  });
}
const directory = new URL(
  `../.local-artifacts/api-response-results/${Date.now()}-${process.pid}/`,
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
for (const [index, workflow] of workflows.entries())
  await writeFile(
    new URL(`${cases[index].name}.workflow.json`, directory),
    JSON.stringify(workflow, null, 2),
  );
console.log(
  JSON.stringify({ cases: verified, artifacts: directory.pathname }, null, 2),
);

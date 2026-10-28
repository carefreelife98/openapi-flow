import type { ResponseEvaluationParameters } from '../../../types/response-evaluation.js';
import { responseEvaluationStatusSchema } from '../../../schemas/response-evaluation-schema.js';
import { javascriptJsonLiteral } from '../../../utils/javascript-json-literal.js';
import { createComparisonEvaluationCode } from '../comparisons/create-comparison-evaluation-code.js';

/** Comparisons reuse the assertion/IF runtime; only the reporting behavior differs. */
export function createResponseEvaluationCode(
  parameters: ResponseEvaluationParameters,
  readerCode: string,
): string {
  return `${createComparisonEvaluationCode(readerCode)}
const parameters=${javascriptJsonLiteral(parameters)};
const checks=[];
const summary=${javascriptJsonLiteral(Object.fromEntries(responseEvaluationStatusSchema.options.map((status) => [status, 0])))};
function locate(value,pointer){
  for(const encoded of pointer===''?[]:pointer.slice(1).split('/')){
    const key=encoded.replace(/~1/g,'/').replace(/~0/g,'~');
    if(value===null||typeof value!=='object'||!Object.hasOwn(value,key))return {present:false};
    value=value[key];
  }
  return {present:true,value};
}
function escapeKey(key){return String(key).replaceAll('~','~0').replaceAll('/','~1');}
function emit(ruleIndex,rule,pointer,result){
  const entry={ruleIndex,source:{...rule.source,pointer},...result};
  if(rule.kind==='compare')entry.policy={measurement:rule.measurement,cases:rule.cases,otherwise:rule.otherwise};
  checks.push(entry);summary[entry.status]++;
}
function evaluate(ruleIndex,rule,value,pointer){
  const actual=locate(value,rule.valuePointer);
  const selectedPointer=pointer+rule.valuePointer;
  if(!actual.present){emit(ruleIndex,rule,selectedPointer,{status:'undetermined',reason:'missing-value'});return;}
  let measured=actual.value;
  if(rule.measurement==='array-length'){
    if(!Array.isArray(actual.value))throw new Error('Evaluation array-length requires an array: '+rule.source.nodeId+selectedPointer);
    measured=actual.value.length;
  }
  const index=rule.cases.findIndex(entry=>compareValues(entry.operator,measured,entry.expected));
  emit(ruleIndex,rule,selectedPointer,{status:index<0?rule.otherwise:rule.cases[index].status,reason:index<0?'unmatched':'matched-case',actualValue:actual.value,...(rule.measurement==='array-length'?{measuredValue:measured}:{}),...(index<0?{}:{matchedCaseIndex:index})});
}
for(const [ruleIndex,rule] of parameters.checks.entries()){
  const root=locate(responses[rule.source.nodeId],rule.source.pointer);
  if(!root.present){emit(ruleIndex,rule,rule.source.pointer,{status:'undetermined',reason:'missing-value'});continue;}
  if(rule.kind==='unassessed'){emit(ruleIndex,rule,rule.source.pointer,{status:'undetermined',reason:'no-rule'});continue;}
  if(rule.scope==='value'){evaluate(ruleIndex,rule,root.value,rule.source.pointer);continue;}
  const valid=rule.scope==='array-items'?Array.isArray(root.value):root.value!==null&&typeof root.value==='object'&&!Array.isArray(root.value);
  if(!valid)throw new Error('Evaluation '+rule.scope+' requires its declared collection: '+rule.source.nodeId+rule.source.pointer);
  const entries=Object.entries(root.value);
  if(!entries.length){emit(ruleIndex,rule,rule.source.pointer,{status:'undetermined',reason:'empty-collection'});continue;}
  for(const [key,value] of entries)evaluate(ruleIndex,rule,value,rule.source.pointer+'/'+escapeKey(key));
}
return {checks,summary};`;
}

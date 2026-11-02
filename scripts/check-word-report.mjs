// Run: node scripts/check-word-report.mjs
import assert from 'node:assert/strict';
import {monthlyData,buildMonthlyReport} from '../word-report.js';
const input={year:2026,month:1,branches:[{id:'a',name:'فرع تجريبي'},{id:'b',name:'فرع ورقي'}],entries:[{branchId:'a',date:'2026-02-01',amount:100},{branchId:'a',date:'2026-02-02',amount:0}],totals:[{branchId:'a',month:'2026-02',total:999},{branchId:'b',month:'2026-02',total:500}],expenses:[{branchId:'a',month:'2026-02',items:[{name:'إيجار',amount:200},{name:'غير مكتمل',amount:null}]}]};
const data=monthlyData(input);
assert.equal(data[0].income,100);assert.equal(data[0].net,-100);
assert.equal(data[1].income,500);assert.equal(data[1].paper,true);
assert.equal(monthlyData({...input,month:0})[0].income,0);
const blob=await buildMonthlyReport(input);
assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
const bytes=new Uint8Array(await blob.arrayBuffer());assert.equal(bytes[0],80);assert.equal(bytes[1],75);
console.log('PASS: monthly totals, zero entries, paper fallback, negative net and DOCX archive');

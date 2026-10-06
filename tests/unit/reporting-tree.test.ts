import test from 'node:test';
import assert from 'node:assert/strict';
import {reportingTree,type ReportingPerson} from '../../packages/ui/reporting-tree';
const person=(id:string,managerId?:string):ReportingPerson=>({id,managerId,firstName:id,lastName:'Person',employeeCode:id});
test('reporting chart keeps manager context when filtering a deep employee',()=>{
 const result=reportingTree([person('CEO'),person('Lead','CEO'),person('Engineer','Lead'),person('Other','CEO')],'Engineer');
 assert.deepEqual(result.roots.map(p=>p.id),['CEO']);assert.equal(result.visibleCount,3);
 assert.deepEqual(result.children.get('CEO')?.map(p=>p.id),['Lead']);assert.deepEqual([...result.matches],['Engineer']);
});
test('reporting chart preserves people with missing managers and breaks legacy cycles',()=>{
 const result=reportingTree([person('A','B'),person('B','A'),person('C','B'),person('Missing','Deleted')]);
 assert.deepEqual([...result.invalid].sort(),['A','B']);assert.equal(result.roots.length,3);
 assert.deepEqual(result.children.get('B')?.map(p=>p.id),['C']);assert.equal(result.visibleCount,4);
 assert.equal(reportingTree([person('A','A')]).roots.length,1);
});

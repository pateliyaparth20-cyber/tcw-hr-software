import test from 'node:test';
import assert from 'node:assert/strict';
import {planAllowsResource,planModuleFeatures} from '../../packages/plan-access';
test('Growth permits its licensed modules while Enterprise-only resources and aliases remain closed',()=>{
 for(const resource of ['dashboard','employees','organization','attendance','devices','workforce','leave','payroll','salary-contracts','recruitment','jobs','candidates','subscription','company','users'])assert.equal(planAllowsResource('GROWTH',resource),true,resource);
 for(const resource of ['performance','goals','courses','training-certificates','assets','expenses','travel','documents','exit','reports','field-work','ai','agent']){assert.equal(planAllowsResource('GROWTH',resource),false,resource);assert.equal(planAllowsResource('ENTERPRISE',resource),true,resource);}
 for(const plan of ['STARTER',undefined,'UNKNOWN']){assert.equal(planAllowsResource(plan,'payroll'),false);assert.equal(planAllowsResource(plan,'recruitment'),false);assert.equal(planAllowsResource(plan,'attendance'),true);assert.equal(planAllowsResource(plan,'subscription'),true);}
 assert.deepEqual(planModuleFeatures('GROWTH'),['Core HR','Attendance','Leave','Payroll','Recruitment']);assert.ok(planModuleFeatures('ENTERPRISE').includes('Reports'));
});

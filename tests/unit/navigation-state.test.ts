import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceReturnPath,workspaceSignInPath,selectedUrlTab,urlTabHref} from '../../packages/navigation-state';
test('refresh links retain main page, nested payroll sections and unrelated query filters',()=>{
 let href=urlTabHref('/payroll','employeeCode=TCW-01&tab=runs','tab','payments');
 href=urlTabHref('/payroll',href.split('?')[1],'payrollSection','settings');
 href=urlTabHref('/payroll',href.split('?')[1],'payrollTab','statutory');
 const query=href.split('?')[1];assert.equal(selectedUrlTab(query,'tab',['runs','payments'],'runs'),'payments');assert.equal(selectedUrlTab(query,'payrollSection',['payments','settings'],'payments'),'settings');assert.equal(selectedUrlTab(query,'payrollTab',['company','statutory'],'company'),'statutory');assert.equal(new URLSearchParams(query).get('employeeCode'),'TCW-01');
 assert.equal(workspaceReturnPath(href,'TENANT'),href);
});
test('expired sign-in returns to the requested page rather than resetting to dashboard',()=>{
 const target='/attendance?tab=monthly&month=2026-10';const href=workspaceSignInPath('TENANT',target);assert.ok(href.startsWith('/login?'));assert.equal(workspaceReturnPath(new URLSearchParams(href.split('?')[1]).get('next'),'TENANT'),target);
 assert.equal(workspaceSignInPath('PLATFORM','/companies?status=ACTIVE'),'/admin-login?next=%2Fcompanies%3Fstatus%3DACTIVE');
});
test('return navigation rejects external URLs, auth loops and cross-portal pages',()=>{
 for(const input of ['https://foreign.example','//foreign.example','/\\foreign.example','/login','/admin-login','/api/auth/logout','/payroll\n','/%2f%2fforeign.example','/login/../api','/payroll/../../login','/%ZZ'])assert.equal(workspaceReturnPath(input,'TENANT'),'/dashboard',input);
 assert.equal(workspaceReturnPath('/companies','TENANT'),'/dashboard');assert.equal(workspaceReturnPath('/payroll','PLATFORM'),'/dashboard');assert.equal(workspaceReturnPath('/payroll?tab=payments&proxy=1&token=private&access_token=private&next=%2Flogin','TENANT'),'/payroll?tab=payments');
});
test('invalid or newly restricted tabs fall back to permitted sections',()=>{
 assert.equal(selectedUrlTab('tab=rules','tab',['live'],'live'),'live');assert.equal(selectedUrlTab('tab=history','tab',['overview','history'],'overview'),'history');assert.equal(selectedUrlTab('','tab',['overview','history'],'overview'),'overview');
});

import {test,expect} from '@playwright/test';
import {totp} from '../../packages/auth/totp';
import {toXlsx} from '../../packages/reporting-engine';

test('report center filters its library, previews all columns and downloads real files',async({page})=>{
 await login(page);await page.setViewportSize({width:1440,height:1000});
 await page.route('**/api/reports/access',route=>route.fulfill({json:{available:true,maintenance:true}}));
 let previewQuery='';await page.route('**/api/reports/employees?preview=true&**',route=>{previewQuery=route.request().url();return route.fulfill({json:{total:51,items:[{id:'synthetic',employeeCode:'RPT-001',firstName:'Report',lastName:'Fixture',email:'fixture@example.test',phone:'9000000000',designation:'Designer',employmentType:'FULL_TIME',status:'ACTIVE',joiningDate:'2026-01-01',branchId:null}]}})});
 await page.goto('/reports');await expect(page.getByRole('heading',{name:'Turn HR records into useful insights.'})).toBeVisible();
 const cards=page.locator('.rc-card');await expect(cards).toHaveCount(9);
 await page.getByRole('button',{name:'Finance',exact:true}).click();await expect(cards).toHaveCount(3);await expect(page.getByRole('button',{name:'Finance',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'All reports',exact:true}).click();await page.getByRole('textbox',{name:'Search reports'}).fill('Employee directory');await expect(cards).toHaveCount(1);
 await page.getByRole('button',{name:'Last 7 days',exact:true}).click();await page.getByRole('button',{name:'Preview report',exact:true}).click();
 const preview=page.getByRole('region',{name:'Report preview'});await expect(preview).toContainText('Showing 1 of 51 records');await expect(preview.getByRole('columnheader',{name:'Joining Date',exact:true})).toBeVisible();expect(new URL(previewQuery).searchParams.has('from')).toBeTruthy();
 const filePromise=page.waitForEvent('download');await cards.getByRole('button',{name:'Download Employee directory as PDF',exact:true}).click();const file=await filePromise;expect(file.suggestedFilename()).toMatch(/tcw-hr-employees-.*\.pdf$/);expect(await file.failure()).toBeNull();
 const filePath=await file.path();const bytes=await (await import('node:fs/promises')).readFile(filePath!);expect(bytes.subarray(0,8).toString()).toBe('%PDF-1.4');
 await page.getByRole('textbox',{name:'Search reports'}).fill('no such report');await expect(page.getByRole('heading',{name:'No matching reports',exact:true})).toBeVisible();await page.getByRole('button',{name:'Clear search & category'}).click();await expect(cards).toHaveCount(9);
 await page.getByRole('button',{name:'Close report preview'}).click();await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await page.screenshot({path:'test-results/reports-library.png',fullPage:true,animations:'disabled'});
 await page.getByLabel('From date',{exact:true}).fill('2026-12-31');await page.getByLabel('To date',{exact:true}).fill('2026-01-01');await expect(page.locator('.rc-filter-panel').getByRole('alert')).toContainText('Choose a valid date range');await expect(cards.first().getByRole('button',{name:'Preview report'})).toBeDisabled();
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await page.getByRole('combobox',{name:'Branch',exact:true}).selectOption({index:1});await expect(page.locator('.rc-card').filter({has:page.getByRole('heading',{name:'Recruitment pipeline',exact:true})})).toContainText('Clear the branch filter');
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByRole('textbox',{name:'Search reports'})).toBeVisible();}
});

test('report downloads show errors and recover instead of navigating away',async({page})=>{
 await login(page);await page.route('**/api/reports/access',route=>route.fulfill({json:{available:true,maintenance:false}}));await page.route('**/api/reports/employees?**format=csv',route=>route.fulfill({status:403,json:{message:'Reports are Under Maintenance. Please try again later.'}}));
 await page.goto('/reports');await page.getByRole('button',{name:'Download Employee directory as CSV',exact:true}).click();await expect(page.getByText('Reports are Under Maintenance. Please try again later.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Download Employee directory as CSV',exact:true})).toBeEnabled();await expect(page).toHaveURL(/reports$/);
});

test('reports maintenance shows a blurred static layout without fetching report data on desktop and mobile',async({page})=>{
 await login(page);
 await page.route('**/api/reports/access',route=>route.fulfill({json:{available:false,maintenance:true}}));
 const requests:string[]=[];page.on('request',r=>{if(/\/api\/reports\/(?!access(?:\?|$))/.test(r.url()))requests.push(r.url())});
 await page.goto('/reports');await expect(page.getByRole('heading',{name:'Under Maintenance',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'CSV',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Preview',exact:true})).toHaveCount(0);
 expect(await page.locator('.reports-maintenance-backdrop').evaluate(el=>getComputedStyle(el).filter)).toBe('blur(6px)');
 await page.screenshot({path:'test-results/reports-maintenance.png',fullPage:true,animations:'disabled'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await expect(page.getByRole('heading',{name:'Under Maintenance',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(requests).toEqual([]);
});

test('software update starts directly with one click and never reloads automatically',async({page})=>{
 await login(page);const version='b'.repeat(40);let requested=false,updateCalls=0;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion:'a'.repeat(40),candidate:{version,title:'Synthetic payroll and attendance improvements'},available:true,updateRequested:requested,ready:requested,canUpdate:true,checkedAt:new Date().toISOString()}}));
 await page.route('**/api/releases/update',route=>{expect(route.request().postDataJSON()).toEqual({version});updateCalls++;requested=true;return route.fulfill({json:{updateRequested:true}})});
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'A software update is available'})).toBeVisible();expect(updateCalls).toBe(0);
 await expect(page.getByRole('button',{name:'Approve company update'})).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software update is starting'})).toBeVisible();expect(updateCalls).toBe(1);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/software-update$/);await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByRole('heading',{name:'Your software update is starting'})).toBeVisible();}
});

test('software update errors allow a retry and restricted users cannot start an update',async({page})=>{
 await login(page);const version='b'.repeat(40);let canUpdate=true;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion:'a'.repeat(40),candidate:{version,title:'Synthetic update'},available:true,updateRequested:false,ready:false,canUpdate,checkedAt:new Date().toISOString()}}));
 await page.route('**/api/releases/update',route=>route.fulfill({status:409,json:{message:'The available release changed. Check for updates again before updating.'}}));
 await page.goto('/software-update');await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByText('The available release changed. Check for updates again before updating.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toBeEnabled();await expect(page).toHaveURL(/software-update$/);
 canUpdate=false;await page.reload();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);await expect(page.getByText('Your HR/Admin can start software updates.',{exact:true})).toBeVisible();
});

test('update lookup outages keep the current version visible and never show approval or start controls',async({page})=>{
 await login(page);let unavailable=true;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion:'a'.repeat(40),candidate:null,available:false,updateRequested:false,canUpdate:true,checkUnavailable:unavailable}}));
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'Update check is temporarily unavailable',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Current software version',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Unable to load this view',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);await expect(page.getByText(/Pending approval|Approve company update/)).toHaveCount(0);
 unavailable=false;await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software is up to date',exact:true})).toBeVisible();
});

test('update action is hidden when current and appears only after a new version is available to this device',async({page})=>{
 await login(page);let currentVersion='a'.repeat(40),navigations=0;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion,available:false,updateRequested:false,canUpdate:true,checkedAt:new Date().toISOString()}}));
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Refresh this device',exact:true})).toHaveCount(0);
 await page.route('**/api/releases/assets',route=>route.fulfill({json:{version:'b'.repeat(40),files:[{url:'/_next/static/chunks/synthetic-update.js',bytes:2}]}}));await page.route('**/_next/static/chunks/synthetic-update.js',route=>route.fulfill({body:'hi',contentType:'application/javascript'}));
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++});currentVersion='b'.repeat(40);
 await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software update is live'})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(1);expect(navigations).toBe(0);
 await Promise.all([page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),page.getByRole('button',{name:'Update',exact:true}).click()]);
 await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);
});

for(const master of [{key:'departments',label:'Departments',singular:'department',field:'Department name',code:'Department code'},{key:'branches',label:'Branches',singular:'branch',field:'Branch name',code:'Branch code'},{key:'designations',label:'Designations',singular:'designation',field:'Designation name',code:'Designation code'},{key:'teams',label:'Teams',singular:'team',field:'Team name',code:'Team code'},{key:'locations',label:'Locations',singular:'location',field:'Location name',code:'Code'},{key:'cost-centers',label:'Cost centers',singular:'cost center',field:'Cost center',code:'Code'}])test('organization '+master.key+' supports create edit search list and protected directory actions',async({page})=>{
 await login(page);await page.goto('/organization?tab='+master.key);await expect(page.getByRole('heading',{name:master.label,exact:true})).toBeVisible();
 const unique=Date.now().toString(),name=({'departments':'Product Engineering','branches':'Ahmedabad Office','designations':'Operations Specialist','teams':'Product Team','locations':'Hybrid Workspace','cost-centers':'Business Operations'} as Record<string,string>)[master.key];await page.getByRole('button',{name:'Add '+master.singular,exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel(master.field).fill(name);await dialog.getByLabel(master.code).fill('ORG-'+unique);await dialog.getByLabel(master.key==='locations'?'Address':'Description').fill('Synthetic directory record');
 if(master.key==='branches'){await dialog.getByLabel('Location / area').fill('Test area');await dialog.getByLabel('City',{exact:true}).fill('Test city')}
 await dialog.getByRole('button',{name:'Create '+master.singular,exact:true}).click();await expect(dialog).not.toBeVisible();await page.getByRole('textbox',{name:'Search '+master.label.toLowerCase(),exact:true}).fill(name);await expect(page.locator('.org-card').filter({hasText:name})).toHaveCount(1);
 await page.getByRole('button',{name:'Edit '+name,exact:true}).click();await dialog.getByLabel(master.field).fill(name+' edited');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:name+' edited',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.org-list')).toContainText(name+' edited');await page.getByRole('button',{name:'Card view',exact:true}).click();
 await page.getByRole('textbox',{name:'Search '+master.label.toLowerCase(),exact:true}).fill('');await expect(page.locator('.org-results')).not.toContainText('Results for');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()}
 if(await page.getByRole('button',{name:'Dismiss notification',exact:true}).count())await page.getByRole('button',{name:'Dismiss notification',exact:true}).click();await page.evaluate(()=>{window.scrollTo(0,0);(document.activeElement as HTMLElement)?.blur?.()});
 if(master.key==='branches')await page.screenshot({path:'test-results/organization-mobile.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>window.scrollTo(0,0));if(master.key==='departments')await page.screenshot({path:'test-results/organization-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Delete '+name+' edited',exact:true}).click();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:name+' edited',exact:true})).not.toBeVisible();await page.getByRole('textbox',{name:'Search '+master.label.toLowerCase(),exact:true}).fill(name);await expect(page.getByRole('heading',{name:'No matching records',exact:true})).toBeVisible();
});

test('new login and signup design supports password visibility, consent and mobile forms',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('/login');
 const signIn=page.getByRole('form',{name:'Account sign in'});await expect(signIn).toBeVisible();
 await expect(page.getByRole('heading',{name:'Great teams start with better HR.'})).toBeVisible();
 await signIn.locator('input[name=password]').fill('SyntheticVisibility!2026');await signIn.getByRole('button',{name:'Show password'}).click();await expect(signIn.locator('input[name=password]')).toHaveAttribute('type','text');await signIn.getByRole('button',{name:'Hide password'}).click();await expect(signIn.locator('input[name=password]')).toHaveAttribute('type','password');
 await page.getByRole('link',{name:'Start a 3-day trial'}).click();await expect(page).toHaveURL(/signup/);
 const signup=page.getByRole('form',{name:'Company signup'});await signup.getByLabel('Company name',{exact:true}).fill('Synthetic Design Company');await signup.getByLabel('HR admin name',{exact:true}).fill('Synthetic Owner');await signup.getByLabel('Email address',{exact:true}).fill('design@example.test');await signup.getByLabel('Mobile number',{exact:true}).fill('9000000000');await signup.getByLabel('Trial plan',{exact:true}).selectOption('GROWTH');
 let submitted:any=null;await page.route('**/api/auth/signup',async route=>{submitted=route.request().postDataJSON();await route.fulfill({json:{ok:true}})});
 await signup.getByRole('button',{name:'Create trial workspace'}).click();await expect(signup.getByRole('alert')).toContainText('Accept the Terms');expect(submitted).toBeNull();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(signup.getByLabel('Company name',{exact:true})).toBeVisible();expect(await signup.getByLabel('Company name',{exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);}
 await signup.getByRole('checkbox',{name:'I agree to the Terms and Privacy notice.'}).check();await signup.getByRole('checkbox',{name:/may contact me/}).check();await signup.getByRole('button',{name:'Create trial workspace'}).click();
 await expect(page.getByRole('heading',{name:'Check your email for login details'})).toBeVisible();expect(submitted).toMatchObject({companyName:'Synthetic Design Company',ownerEmail:'design@example.test',plan:'GROWTH',acceptTerms:true,contactConsent:true});
 await page.getByRole('button',{name:'Continue to sign in'}).click();await expect(page.getByRole('form',{name:'Account sign in'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('attendance rules create and edit a night shift with mobile preview',async({page})=>{
 await login(page);await page.goto('/attendance');await page.getByRole('button',{name:'Attendance rules',exact:true}).click();
 await page.getByRole('button',{name:'Add Shift',exact:true}).first().click();
 const form=page.getByRole('form',{name:'Shift configuration'});await form.getByRole('button',{name:'Night shift preset',exact:true}).click();
 await form.getByRole('button',{name:'Create Shift',exact:true}).click();await expect(form.getByRole('alert')).toContainText('Enter a shift name');
 const name='Night browser '+Date.now();await form.getByLabel('Shift Name',{exact:true}).fill(name);await expect(form.getByLabel('Start Time',{exact:true})).toHaveValue('10:00 PM');await expect(form.getByLabel('End Time',{exact:true})).toHaveValue('07:00 AM');
 await form.getByLabel('Working Week Pattern',{exact:true}).selectOption('MON_FRI');await form.getByLabel('Late Grace in HH:MM',{exact:true}).click();await form.getByLabel('Late Grace minutes',{exact:true}).selectOption('15');await form.getByRole('dialog',{name:'Late Grace clock',exact:true}).getByRole('button',{name:'Done',exact:true}).click();
 await form.getByRole('button',{name:'Evening shift preset',exact:true}).click();await expect(form.getByLabel('Start Time',{exact:true})).toHaveValue('02:00 PM');await expect(form.getByLabel('End Time',{exact:true})).toHaveValue('11:00 PM');await expect(form.getByLabel('Working Week Pattern',{exact:true})).toHaveValue('MON_FRI');await expect(form.getByLabel('Late Grace in HH:MM',{exact:true})).toHaveValue('00:15');
 await form.getByRole('button',{name:'Morning shift preset',exact:true}).click();await expect(form.getByLabel('Start Time',{exact:true})).toHaveValue('09:00 AM');await form.getByRole('button',{name:'Night shift preset',exact:true}).click();
 for(const [label,hours] of [['Half Day Time','3'],['Overtime After','8']]){const field=form.getByLabel(label+' in HH:MM',{exact:true});await expect(field).toHaveAttribute('readonly','');await field.click();await form.getByLabel(label+' hours',{exact:true}).selectOption(hours);await form.getByLabel(label+' minutes',{exact:true}).selectOption('30');await form.getByRole('dialog',{name:label+' clock',exact:true}).getByRole('button',{name:'Done',exact:true}).click();}await form.getByLabel('Start Time',{exact:true}).click();await expect(form.getByRole('dialog',{name:'Start Time clock',exact:true})).toBeVisible();await form.getByRole('dialog',{name:'Start Time clock',exact:true}).getByRole('button',{name:'Done',exact:true}).click();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await expect(page.getByRole('heading',{name:'Shift Preview',exact:true})).toBeVisible();
 await form.getByRole('button',{name:'Create Shift',exact:true}).click();await expect(form).not.toBeVisible();
 await page.locator('.shift-v3-card').filter({hasText:name}).click();await expect(form.getByLabel('Working Week Pattern',{exact:true})).toHaveValue('MON_FRI');await expect(form.getByLabel('Half Day Time in HH:MM',{exact:true})).toHaveValue('03:30');await expect(form.getByLabel('Overtime After in HH:MM',{exact:true})).toHaveValue('08:30');for(const label of ['Regular','Morning','Evening','Night','Half Day'])await expect(form.getByRole('button',{name:label+' shift preset',exact:true})).toBeVisible();
 await form.getByLabel('Break Type',{exact:true}).selectOption('FLEXIBLE_PUNCH');await expect(form.getByLabel('Break Window Start',{exact:true})).not.toBeVisible();await form.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(form).not.toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Attendance rules',exact:true}).click();await page.locator('.shift-v3-card').filter({hasText:name}).click();await expect(form.getByLabel('Break Type',{exact:true})).toHaveValue('FLEXIBLE_PUNCH');
});
// Mutating browser tests are allowed only against the isolated local fixture.
test.beforeEach(async({baseURL,page})=>{
 expect(process.env.PEOPLEOS_E2E_ISOLATED).toBe('true');expect(baseURL).toBe('http://localhost:3000');
 await page.addInitScript(()=>localStorage.setItem('tcw_cookie_consent_v1','essential'));
});
async function login(page:any,admin=false){
 await page.goto(admin?'http://localhost:3001/login':'/login');
 if(!admin)await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE??'TCW-DEMO');
 await page.locator('input[name=username]').fill((admin?process.env.ADMIN_EMAIL:process.env.OWNER_EMAIL)!);
 await page.locator('input[name=password]').fill((admin?process.env.ADMIN_PASSWORD:process.env.OWNER_PASSWORD)!);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/dashboard/);
}
test('protected routes require login',async({page})=>{await page.goto('/employees');await expect(page).toHaveURL(/login/);await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()});
test('HR directory create edit search and delete',async({page})=>{
 await login(page);await page.getByRole('link',{name:'People',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Employee Directory'})).toBeVisible();
 await page.getByRole('button',{name:'Add Employee',exact:true}).first().click();
 const dialog=page.getByRole('dialog');const unique=Date.now().toString();
 await dialog.getByLabel('Employee ID').fill('E2E-'+unique);
 await dialog.getByLabel('First name').fill('Browser');await dialog.getByLabel('Last name').fill('Test');
 await dialog.locator('#field-email').fill('browser-'+unique+'@example.test');
 await dialog.getByLabel('Mobile number').fill('9000000000');
 await dialog.getByLabel('Department').selectOption({label:'E2E Engineering'});
 await dialog.getByLabel('Assigned shift').selectOption({label:'General shift'});
 await dialog.getByLabel('Designation').selectOption({label:'QA Engineer'});
 await dialog.getByLabel('Employment type').selectOption('FULL_TIME');
 await dialog.getByLabel('Joining date').fill('2026-01-01');await dialog.getByLabel('Employment status').selectOption('ACTIVE');
 await dialog.getByRole('combobox',{name:/^Work location/}).selectOption({label:'Employee Test Office'});await dialog.getByLabel('Emergency contact name').fill('Emergency Fixture');await dialog.getByLabel('Bank name',{exact:true}).fill('Synthetic bank');await dialog.getByLabel('HR notes').fill('Profile notes persist');
 await dialog.getByRole('button',{name:'Create employee'}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('textbox',{name:'Search people directory'}).fill('browser-'+unique);
 const row=page.getByRole('row').filter({hasText:'browser-'+unique});await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Edit employee'}).click();await page.getByRole('dialog').getByLabel('Designation').selectOption({label:'Senior QA'});await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(row).toContainText('Senior QA');
 await row.getByRole('button',{name:'View profile of Browser Test',exact:true}).click();await expect(dialog.getByRole('region',{name:'Overview',exact:true})).toContainText('Employee Test Office');await dialog.getByRole('button',{name:'Personal & emergency',exact:true}).click();await expect(dialog).toContainText('Emergency Fixture');await dialog.getByRole('button',{name:'Salary & bank',exact:true}).click();await expect(dialog).toContainText('Synthetic bank');await dialog.getByRole('button',{name:'Skills & notes',exact:true}).click();await expect(dialog).toContainText('Profile notes persist');await dialog.getByRole('button',{name:'Close dialog'}).click();
 await row.getByRole('button',{name:'Employee App Access for Browser Test',exact:true}).click();await expect(dialog).toContainText('Create Employee login');await dialog.getByRole('button',{name:'Create Employee App Access',exact:true}).click();await expect(dialog).toContainText('Temporary password');await dialog.getByRole('button',{name:'Back to access',exact:true}).click();await dialog.getByRole('button',{name:'Disable Employee App',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Disabled',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Enable Employee App',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Active',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Reset password',exact:true}).click();await expect(dialog).toContainText('Temporary password');await dialog.getByRole('button',{name:'Close dialog'}).click();
 await row.getByRole('button',{name:'Delete employee'}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm'}).click();await expect(row).not.toBeVisible();
});
test('command search and mobile navigation',async({page})=>{
 await login(page);await page.getByRole('button',{name:'Search workspace',exact:true}).click();await page.getByRole('textbox',{name:'Search pages and employees'}).fill('Calendar');await page.getByRole('dialog').getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.getByRole('heading',{name:'Calendar',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const shortcuts=page.getByRole('navigation',{name:'Mobile shortcuts'});
 const more=shortcuts.getByRole('button',{name:'Open menu'});await more.click();await expect(page.locator('.sidebar')).toHaveClass(/open/);
 await expect(page.locator('.mobile-scrim')).toBeVisible();
 await page.keyboard.press('Escape');await expect(shortcuts.getByRole('button',{name:'Open menu'})).toBeVisible();
 await shortcuts.getByRole('button',{name:'Open menu'}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Attendance',exact:true}).click();await expect(page.getByRole('heading',{name:'Attendance',exact:true}).first()).toBeVisible();
 await expect(shortcuts.getByRole('button',{name:'Open menu'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('platform company and sales pages',async({page})=>{
 await login(page,true);await expect(page.getByRole('heading',{name:/Welcome back/})).toBeVisible();await page.getByRole('link',{name:'Companies',exact:true}).click();await expect(page.getByRole('heading',{name:'Companies',exact:true})).toBeVisible();await page.getByRole('link',{name:'Sales pipeline',exact:true}).click();await expect(page.getByRole('heading',{name:'Sales pipeline',exact:true})).toBeVisible();
});

test('organization reporting chart searches and collapses manager relationships',async({page})=>{
 await login(page);await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Organization',exact:true}).click();
 await page.getByRole('button',{name:'Reporting chart',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Reporting chart',exact:true})).toBeVisible();
 const chart=page.locator('.organization-chart-tree');await expect(chart.getByRole('link',{name:'QA Member',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Collapse reports for Team Lead',exact:true}).click();await expect(chart.getByRole('link',{name:'QA Member',exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Expand reports for Team Lead',exact:true}).click();await expect(chart.getByRole('link',{name:'QA Member',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search reporting chart'}).fill('CHART-MEMBER');await expect(chart.getByRole('link',{name:'Team Lead',exact:true})).toBeVisible();await expect(chart.getByRole('link',{name:'QA Member',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search reporting chart'}).fill('no-such-person');await expect(page.getByRole('heading',{name:'No matching employees',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search reporting chart'}).fill('');await page.setViewportSize({width:390,height:844});await expect(chart.getByRole('link',{name:'QA Member',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('payroll shows paid and unverified transfers without opening the payout dialog',async({page})=>{
 await login(page);
 const now=new Date(),previous=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)),month=previous.toISOString().slice(0,7);
 const items=[{id:'item-paid',employeeId:'employee-paid',employeeName:'Synthetic Paid',employeeCode:'PAY-01',gross:100000,deductions:0,net:100000},{id:'item-unknown',employeeId:'employee-unknown',employeeName:'Synthetic Unverified',employeeCode:'PAY-02',gross:100000,deductions:0,net:100000}];
 await page.route(/\/api\/payroll(?:\?.*)?$/,route=>route.fulfill({json:{items:[{id:'synthetic-run',month,status:'LOCKED',totalGross:200000,totalNet:200000,items}]}}));
 await page.route('**/api/payroll/synthetic-run/payouts',route=>route.fulfill({json:{items:[{id:'payout-paid',employeeId:'employee-paid',status:'processed',utr:'SYNTHETIC-UTR',amount:100000},{id:'payout-unknown',employeeId:'employee-unknown',status:'UNKNOWN',error:'Verify synthetic transfer in provider dashboard.',amount:100000}],config:{provider:'RAZORPAYX',enabled:false,mode:'IMPS'}}}));
 await page.goto('/payroll');
 const status=page.locator('.payroll-v6-employee-status');
 await expect(status.getByRole('row').filter({hasText:'PAY-01'}).getByText('Paid',{exact:true})).toBeVisible();
 await expect(status.getByRole('row').filter({hasText:'PAY-02'}).getByText('Unverified',{exact:true})).toBeVisible();
 await expect(page.locator('.payroll-v6-payment-cards .paid strong')).toHaveText('1');
 await page.getByRole('button',{name:'Bank payout',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Each employee transfer is initiated once.');
 await expect(dialog).toContainText('Verify synthetic transfer in provider dashboard.');
 await dialog.getByRole('button',{name:'Close dialog'}).click();
 await expect(status.getByRole('row').filter({hasText:'PAY-01'}).getByText('Paid',{exact:true})).toBeVisible();
 await expect(page.locator('.payroll-v6-payment-cards .paid strong')).toHaveText('1');
});

test('HR sets a person-specific manual salary, keeps it on recalculation and restores automatic pay',async({page})=>{
 await login(page);await page.goto('/payroll');
 await page.getByRole('button',{name:'Prepare payroll',exact:true}).click();
 const run=page.locator('.payroll-v2-run'),row=run.getByRole('row').filter({hasText:'CHART-LEAD'});
 await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Set manual salary for Team Lead',exact:true}).click();
 let dialog=page.getByRole('dialog');
 await dialog.getByLabel('Final salary to pay (INR)').fill('25000');
 await dialog.getByLabel('Reason for manual salary').fill('Agreed salary for this month');
 await dialog.getByRole('button',{name:'Save manual salary',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(row.getByText('Manual',{exact:true})).toBeVisible();await expect(row).toContainText('₹25,000.00');
 await page.getByRole('button',{name:'Recalculate',exact:true}).click();await expect(row).toContainText('₹25,000.00');
 await page.reload();await expect(row.getByText('Manual',{exact:true})).toBeVisible();await expect(row).toContainText('₹25,000.00');
 await row.getByRole('button',{name:'Set manual salary for Team Lead',exact:true}).click();
 dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Reason for manual salary')).toHaveValue('Agreed salary for this month');
 await dialog.getByRole('button',{name:'Use calculated salary',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(row.getByText('Calculated',{exact:true})).toBeVisible();await expect(row).not.toContainText('₹25,000.00');
 await page.getByRole('button',{name:'Finalize payroll',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(row.getByRole('button',{name:'Set manual salary for Team Lead',exact:true})).not.toBeVisible();
});

test('employee Excel CSV import and lifecycle checklist work on desktop and mobile',async({page})=>{
 await login(page);await page.goto('/employees');await page.getByRole('button',{name:'Import employees',exact:true}).click();
 let dialog=page.getByRole('dialog');const suffix=Date.now();
 await dialog.getByLabel('Employee file').setInputFiles({name:'employees.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:toXlsx([{'Employee Code':`IMP-${suffix}`,'FIRST NAME':'Import','last_name':'Browser',EMAIL:`import-${suffix}@example.test`,Phone:'09000000000','JOINING DATE':46023,'Employment Type':'full time',Status:'active'}])});
 await dialog.getByRole('button',{name:'Preview file',exact:true}).click();await expect(dialog).toContainText('Ready to import');
 const preview=dialog.getByRole('region',{name:'Employee import preview'});await expect(preview).toContainText('2026-01-01');await expect(preview).toContainText('09000000000');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(await preview.evaluate(el=>el.scrollWidth>el.clientWidth)).toBeTruthy();await preview.evaluate(el=>{el.scrollLeft=el.scrollWidth});expect(await preview.evaluate(el=>el.scrollLeft>0)).toBeTruthy();await page.screenshot({path:`test-results/people-import-preview-${width}.png`,fullPage:true,animations:'disabled'});}
 await preview.evaluate(el=>{el.scrollLeft=0});await preview.focus();await page.keyboard.press('ArrowRight');await expect.poll(()=>preview.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);await page.setViewportSize({width:1440,height:1000});
 await dialog.getByRole('button',{name:'Import 1 employees',exact:true}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('textbox',{name:'Search people directory'}).fill('IMP-'+suffix);const row=page.getByRole('row').filter({hasText:'import-'+suffix+'@example.test'});await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Checklists for Import Browser',exact:true}).click();dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Start standard checklist',exact:true}).click();await expect(dialog).toContainText('0 of 5 tasks complete');
 await dialog.getByRole('checkbox',{name:/Verify identity/}).click();await expect(dialog).toContainText('1 of 5 tasks complete');await expect(dialog.getByRole('checkbox',{name:/Verify identity/})).toBeChecked();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await dialog.getByRole('button',{name:'Close dialog'}).click();
});

test('salary structures and two-stage policy settings persist',async({page})=>{
 await login(page);await page.goto('/payroll');await page.getByRole('button',{name:'Salary structures',exact:true}).click();
 await page.getByRole('textbox',{name:'Search employee name or code',exact:true}).fill('CHART-MEMBER');await page.getByRole('button',{name:/QA Member.*CHART-MEMBER/}).click();
 await page.getByRole('button',{name:'Add salary revision',exact:true}).click();const dialog=page.getByRole('dialog');
 const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'});
 await dialog.getByLabel('Effective month (YYYY-MM)').fill(month);await dialog.getByLabel('Basic salary').fill('20000');await dialog.getByLabel('HRA').fill('5000');await dialog.getByLabel('Other allowances').fill('1000');await dialog.getByLabel('Overtime rate per hour').fill('100');await dialog.getByLabel('Reason for salary revision').fill('Browser verified salary structure');
 await dialog.getByRole('button',{name:'Save salary revision',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('.hr-salary-detail')).toContainText('Browser verified salary structure');
 await page.goto('/settings');const policy=page.getByRole('combobox',{name:'expenses approval policy',exact:true});await policy.selectOption('MANAGER_HR');await expect(policy).toHaveValue('MANAGER_HR');await page.reload();await expect(policy).toHaveValue('MANAGER_HR');await policy.selectOption('SINGLE');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});

test('training participants record completion and issue a certificate',async({page})=>{
 await login(page);await page.goto('/courses');const card=page.locator('.record-card').filter({hasText:'E2E Operations Training'});await card.getByRole('button',{name:'Participants',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Enroll employee',exact:true}).click();await dialog.getByLabel('Employee').selectOption({label:'QA Member · CHART-MEMBER'});await dialog.getByRole('button',{name:'Enroll employee',exact:true}).last().click();
 const row=dialog.getByRole('row').filter({hasText:'CHART-MEMBER'});await expect(row).toBeVisible();await row.getByRole('button',{name:'Update progress',exact:true}).click();await dialog.getByLabel('Enrollment status').selectOption('COMPLETED');await dialog.getByLabel('Assessment score (optional)').fill('95');await dialog.getByRole('button',{name:'Save progress',exact:true}).click();await expect(row).toContainText('Completed');
 const download=page.waitForEvent('download');await row.getByRole('link',{name:'Certificate PDF',exact:true}).click();expect((await download).suggestedFilename()).toBe('training-certificate.pdf');
});

test('authenticator enrollment and recovery code sign-in work in the browser',async({page})=>{
 await login(page);await page.goto('/security');await page.getByRole('button',{name:'Set up authenticator',exact:true}).click();let dialog=page.getByRole('dialog');
 await dialog.getByLabel('Current password').fill(process.env.OWNER_PASSWORD!);await dialog.getByRole('button',{name:'Create setup key',exact:true}).click();const secret=(await dialog.locator('.hr-auth-key').textContent())!;
 await dialog.getByLabel('Current password').fill(process.env.OWNER_PASSWORD!);await dialog.getByLabel('Authenticator code').fill(totp(secret));await dialog.getByRole('button',{name:'Enable authenticator',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog).toContainText('Save your recovery codes');const codes=await dialog.locator('.hr-recovery-codes code').allTextContents();expect(codes).toHaveLength(10);await dialog.getByRole('button',{name:'Close dialog'}).click();
 const result=await page.evaluate(async()=>{const me=await (await fetch('/api/auth/me')).json();return (await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:'{}'})).status});expect(result).toBe(200);
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill(process.env.OWNER_EMAIL!);await page.locator('input[name=password]').fill(process.env.OWNER_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByLabel('Authenticator or recovery code')).toBeVisible();await page.getByLabel('Authenticator or recovery code').fill(codes[0]);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/dashboard/);
 await page.goto('/security');await page.getByRole('button',{name:'Disable authenticator',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Current password').fill(process.env.OWNER_PASSWORD!);await dialog.getByLabel('Authenticator or recovery code').fill(codes[1]);await dialog.getByRole('button',{name:'Disable authenticator',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByText('Two-factor authentication is off',{exact:true})).toBeVisible();
});

test('HR overview shows accurate snapshots, refreshes and fits desktop and mobile',async({page})=>{
 await login(page);await page.setViewportSize({width:1440,height:1050});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),day=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const employees=Array.from({length:6},(_,i)=>({id:'overview-'+i,firstName:['Asha','Ravi','Nisha','Karan','Diya','Arjun'][i],lastName:'Patel',status:'ACTIVE'}));
 const past=[3,4,2,5,3,4].flatMap((n,index)=>Array.from({length:n},(_,i)=>({employeeId:employees[i].id,date:day(index-6),status:'PRESENT'})));
 const fixture={company:{name:'TCW Design Studio',timezone:'Asia/Kolkata'},employees,attendance:[...past,...['PRESENT','HALF_DAY','INSUFFICIENT_HOURS','ABSENT','NOT_CLOCKED_IN','PAID_LEAVE'].map((status,i)=>({employeeId:employees[i].id,date:today,status,...(i===0?{lateMinutes:5,exceptionCode:'LATE'}:{})}))],leave:[{id:'leave-1',employeeId:employees[1].id,startDate:day(1),endDate:day(2),days:2,status:'PENDING'},{id:'leave-2',employeeId:employees[2].id,startDate:day(3),endDate:day(3),days:1,status:'PENDING'},{id:'leave-today',employeeId:employees[5].id,startDate:today,endDate:today,status:'APPROVED'}],devices:[{id:'online',status:'ONLINE'},{id:'offline',status:'OFFLINE'}],payroll:{month:today.slice(0,7),totalNet:299500,status:'DRAFT'},support:[{id:'ticket-1',status:'OPEN'}],unreadNotifications:3};
 let reads=0;await page.route('**/api/dashboard',route=>{reads++;return route.fulfill({json:fixture})});await page.route('**/api/calendar?**',route=>route.fulfill({json:{items:[{id:'event-1',title:'Team town hall',date:day(1),kind:'MEETING'},{id:'event-2',title:'Payroll review',date:day(3),kind:'PAYROLL'}],total:2}}));
 await page.goto('/dashboard');const overview=page.locator('.hr-overview');await expect(overview.getByRole('heading',{name:'Your people. Your day.',exact:true})).toBeVisible();await expect(overview.locator('.ov-metric').first()).toContainText('6');await expect(overview.locator('.ov-attendance-total')).toContainText('17%');await expect(overview.locator('.ov-breakdown')).toContainText('Half Day');await expect(overview.locator('.ov-breakdown')).toContainText('Insufficient Time');await expect(overview.getByRole('img',{name:'Present employees over the last seven days'})).toBeVisible();await expect(overview.getByText('Team town hall',{exact:true})).toBeVisible();
 const before=reads;await overview.getByRole('button',{name:'Refresh dashboard',exact:true}).click();await expect.poll(()=>reads).toBeGreaterThan(before);await expect(overview.getByRole('button',{name:'Refresh dashboard',exact:true})).toBeEnabled();
 await page.evaluate(()=>{window.scrollTo(0,0);(document.activeElement as HTMLElement)?.blur?.()});await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});await expect(overview.getByRole('heading',{name:'Workforce snapshot',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true,animations:'disabled'});
 await overview.locator('.ov-shortcut-grid').getByRole('link',{name:/Attendance/}).click();await expect(page).toHaveURL(/attendance$/);
});

test('HR overview hides restricted tools and payroll values and explains missing access',async({page})=>{
 await login(page);
 await page.route('**/api/auth/me',async route=>{const response=await route.fetch(),json=await response.json();json.user.permissions=['dashboard:VIEW','employees:VIEW'];await route.fulfill({response,json})});
 await page.route('**/api/dashboard',route=>route.fulfill({json:{company:{name:'Restricted workspace',timezone:'Asia/Kolkata'},employees:[],attendance:[],leave:[],devices:[],payroll:{totalNet:987654321,status:'DRAFT',month:'2026-10'}}}));
 await page.reload();const overview=page.locator('.hr-overview');await expect(overview.getByRole('heading',{name:'Your people. Your day.',exact:true})).toBeVisible();await expect(overview.getByText('Payroll access required',{exact:true})).toBeVisible();await expect(overview.getByRole('img',{name:'Present employees over the last seven days'})).toHaveCount(0);await expect(overview.locator('.ov-shortcut-grid').getByRole('link')).toHaveCount(1);await expect(overview.locator('.ov-shortcut-grid').getByRole('link',{name:/People directory/})).toBeVisible();await expect(overview.getByText('Attendance devices',{exact:true})).toHaveCount(0);
});


test('people directory filters retain totals and complete profiles fit desktop and mobile',async({page})=>{
 await login(page);await page.setViewportSize({width:1440,height:1050});
 const department={id:'people-department',name:'Engineering'},branch={id:'people-branch',name:'Ahmedabad office'},shift={id:'people-shift',name:'Morning shift'};
 const names=[['Aarav','Patel','Product designer'],['Diya','Shah','HR executive'],['Rohan','Mehta','Software engineer'],['Anaya','Joshi','QA engineer'],['Vivaan','Desai','Team lead'],['Isha','Trivedi','Operations analyst']];
 const people=names.map(([firstName,lastName,designation],i)=>({id:'people-fixture-'+i,employeeCode:'TCW-00'+(i+1),firstName,lastName,designation,email:firstName.toLowerCase()+'.'+lastName.toLowerCase()+'@example.test',phone:'9000000000',departmentId:department.id,departmentName:department.name,branchId:branch.id,branchName:branch.name,shiftId:shift.id,shiftName:shift.name,status:i===1?'PROBATION':i===3?'NOTICE':'ACTIVE',employmentType:'FULL_TIME',joiningDate:'2026-10-01',monthlySalary:4500000,managerName:'Vivaan Desai',personal:{city:'Ahmedabad',emergencyContact:'Emergency contact fixture',bankName:'Synthetic bank',accountNumber:'1234567890',ifsc:'TEST0000001',qualification:'B.Tech',notes:'Quarterly development discussion scheduled.'},updatedAt:new Date().toISOString()}));
 let lastQuery=new URLSearchParams();
 await page.route('**/api/employees?**',route=>{lastQuery=new URL(route.request().url()).searchParams;const rows=people.filter(p=>(!lastQuery.get('status')||p.status===lastQuery.get('status'))&&(!lastQuery.get('q')||JSON.stringify(p).toLowerCase().includes(lastQuery.get('q')!.toLowerCase())));return route.fulfill({json:{items:rows,total:rows.length,summary:{total:6,active:4,probation:1,notice:1,inactive:0,departments:1,joining:6},filters:{departments:[department],branches:[branch],shifts:[shift]}}})});
 await page.route('**/api/employees/people-fixture-*',route=>route.fulfill({json:people.find(p=>route.request().url().endsWith(p.id))}));
 await page.goto('/employees');const workspace=page.locator('.people-workspace');await expect(workspace.getByRole('heading',{name:'Your team, connected.',exact:true})).toBeVisible();await expect(workspace.locator('.pd-list tbody tr')).toHaveCount(6);await expect(page.getByRole('textbox',{name:'Search people directory'})).toBeVisible();
 await page.getByLabel('Filter by status',{exact:true}).selectOption('PROBATION');await expect(workspace.locator('.pd-list tbody tr')).toHaveCount(1);expect(lastQuery.get('status')).toBe('PROBATION');await expect(workspace.locator('.pd-stats').getByText('6',{exact:true})).toHaveCount(2);
 for(const [key,value] of [['departmentId',department.id],['branchId',branch.id],['shiftId',shift.id]]){await page.getByLabel('Filter by '+key.replace('Id',''),{exact:true}).selectOption(value);await expect.poll(()=>lastQuery.get(key)).toBe(value)}
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(workspace.locator('.pd-list tbody tr')).toHaveCount(6);await page.getByLabel('Sort people').selectOption('name');await expect.poll(()=>lastQuery.get('sort')).toBe('name');await page.getByRole('textbox',{name:'Search people directory'}).fill('absent fixture');await expect(page.getByRole('heading',{name:'No matching people',exact:true})).toBeVisible();await workspace.locator('.pd-clear').click();await expect(workspace.locator('.pd-list tbody tr')).toHaveCount(6);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/people-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'View profile of Aarav Patel',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('Morning shift');await expect(dialog).toContainText('Vivaan Desai');await dialog.getByRole('button',{name:'Personal & emergency',exact:true}).click();await expect(dialog).toContainText('Emergency contact fixture');await dialog.getByRole('button',{name:'Salary & bank',exact:true}).click();await expect(dialog).toContainText('₹45,000.00');await expect(dialog).toContainText('1234567890');await page.screenshot({path:'test-results/people-profile.png',fullPage:true,animations:'disabled'});await dialog.getByRole('button',{name:'Skills & notes',exact:true}).click();await expect(dialog).toContainText('Quarterly development discussion scheduled.');await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Card view',exact:true}).click();await expect(workspace.locator('.pd-card')).toHaveCount(6);await page.getByRole('button',{name:'List view',exact:true}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(workspace.getByRole('heading',{name:'Employee Directory',exact:true})).toBeVisible();if(width===390){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/people-mobile.png',fullPage:true,animations:'disabled'})}}
 await page.getByRole('button',{name:'View profile of Aarav Patel',exact:true}).click();await expect(dialog).toContainText('Morning shift');expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await dialog.getByRole('button',{name:'Close dialog'}).click();
});

test('read-only people permissions hide mutations app access and salary data',async({page})=>{
 await login(page);await page.route('**/api/auth/me',async route=>{const response=await route.fetch(),json=await response.json();json.user.permissions=['dashboard:VIEW','employees:VIEW'];await route.fulfill({response,json})});
 const person={id:'read-only-person',firstName:'Read',lastName:'Only',employeeCode:'VIEW-01',email:'readonly@example.test',status:'ACTIVE',monthlySalary:987654321,personal:{bankName:'Hidden bank fixture',accountNumber:'secret-bank-fixture'}};
 await page.route('**/api/employees?**',route=>route.fulfill({json:{items:[person],total:1,summary:{total:1,active:1,departments:0,joining:0},filters:{}}}));await page.route('**/api/employees/read-only-person',route=>route.fulfill({json:person}));
 await page.goto('/employees');const workspace=page.locator('.people-workspace');await expect(workspace.getByRole('heading',{name:'Employee Directory',exact:true})).toBeVisible();for(const name of ['Add Employee','Edit employee','Delete employee','Import employees'])await expect(workspace.getByRole('button',{name,exact:true})).toHaveCount(0);await expect(workspace.getByRole('button',{name:/Employee App Access/})).toHaveCount(0);
 await workspace.getByRole('button',{name:'View profile of Read Only',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:'Salary & bank',exact:true})).toHaveCount(0);await expect(dialog).not.toContainText('Hidden bank fixture');await expect(dialog).not.toContainText('secret-bank-fixture');await expect(dialog.getByRole('button',{name:'Edit profile'})).toHaveCount(0);
});


test('Add Employee sections scroll with wheel input and keep actions reachable',async({page})=>{
 await login(page);await page.goto('/employees');
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
  await page.setViewportSize(viewport);
  await page.getByRole('button',{name:'Add Employee',exact:true}).first().click();
  const dialog=page.getByRole('dialog'),scroll=dialog.locator('.record-form-fields');
  await expect(scroll).toBeVisible();
  await expect.poll(()=>scroll.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await scroll.evaluate(el=>{el.scrollTop=0});
  await scroll.hover();await page.mouse.wheel(0,350);
  await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});
  const notes=dialog.getByLabel('HR notes');await expect(notes).toBeInViewport();
  await notes.fill('Last section remains reachable');
  await expect(dialog.getByRole('button',{name:'Create employee',exact:true})).toBeInViewport();
  await expect(dialog.getByRole('button',{name:'Close dialog'})).toBeInViewport();
  await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).not.toBeVisible();
 }
});


test('a requested update follows server progress then downloads and opens only the consenting device',async({page})=>{
 await login(page);const version='b'.repeat(40);let requested=false,live=false,stage='verifying',calls=0,navigations=0;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion:live?version:'a'.repeat(40),candidate:{version,title:'Synthetic download update'},available:!live,updateRequested:requested&&!live,canUpdate:true,deployment:{version,stage},checkedAt:new Date().toISOString()}}));
 await page.route('**/api/releases/update',route=>{calls++;requested=true;return route.fulfill({json:{updateRequested:true}})});
 await page.route('**/api/releases/assets',async route=>{await new Promise(r=>setTimeout(r,150));return route.fulfill({json:{version,files:[{url:'/_next/static/chunks/synthetic-download.js',bytes:4096}]}})});
 await page.route('**/_next/static/chunks/synthetic-download.js',async route=>{await new Promise(r=>setTimeout(r,400));return route.fulfill({body:Buffer.alloc(4096,32),contentType:'application/javascript'})});
 await page.goto('/software-update');page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame())navigations++});
 await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByText('Verifying the requested release',{exact:true})).toBeVisible();expect(calls).toBe(1);expect(navigations).toBe(0);
 await expect(page.getByText('No app files are downloading during server preparation.',{exact:true})).toBeVisible();await expect(page.getByRole('progressbar',{name:'Server preparation'})).toBeVisible();expect(await page.getByRole('progressbar',{name:'Server preparation'}).getAttribute('value')).toBeNull();
 stage='deploying';await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByText('Building and starting the servers',{exact:true})).toBeVisible();
 live=true;await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('heading',{name:'Downloading your software update'})).toBeVisible();await expect(page.locator('.update-download-progress')).toContainText('4.00 KB');
 await expect.poll(()=>navigations).toBe(1);await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();expect(calls).toBe(1);
});

test('download failures retain the app and allow an explicit retry',async({page})=>{
 await login(page);let currentVersion='a'.repeat(40),fail=true;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion,available:false,canUpdate:true}}));
 await page.route('**/api/releases/assets',route=>route.fulfill({json:{version:'b'.repeat(40),files:[{url:'/_next/static/chunks/retry-update.js',bytes:2048}]}}));
 await page.route('**/_next/static/chunks/retry-update.js',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({body:Buffer.alloc(2048,32),contentType:'application/javascript'}));
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();currentVersion='b'.repeat(40);await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByRole('button',{name:'Update',exact:true}).click();
 await expect(page.locator('.update-center').getByRole('alert')).toContainText('A software file could not download');await expect(page.getByRole('button',{name:'Update',exact:true})).toBeEnabled();await expect(page).toHaveURL(/software-update$/);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
 fail=false;await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();
});


test('production download manifest contains readable build assets with exact decoded sizes',async({page})=>{
 const response=await page.request.get('/api/releases/assets');expect(response.ok()).toBeTruthy();const manifest=await response.json();expect(manifest.files.length).toBeGreaterThan(0);expect(manifest.files.some((file:any)=>file.url.includes('[[...path]]'))).toBeTruthy();
 for(const file of manifest.files.slice(0,3)){expect(file.url).toMatch(/^\/_next\/static\/.*\.(js|css)$/);const asset=await page.request.get(file.url);expect(asset.ok()).toBeTruthy();expect((await asset.body()).length).toBe(file.bytes);expect(asset.headers()['cache-control']).toContain('immutable');}
});


test('Update selects the latest release when both the opened device and server are behind it',async({page})=>{
 await login(page);let currentVersion='a'.repeat(40),requested=false,calls=0;const version='c'.repeat(40);
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion,candidate:{version,title:'Newest release'},available:true,canUpdate:true,updateRequested:requested}}));
 await page.route('**/api/releases/update',route=>{expect(route.request().postDataJSON()).toEqual({version});calls++;requested=true;return route.fulfill({json:{updateRequested:true}})});
 let manifests=0;await page.route('**/api/releases/assets',route=>{manifests++;return route.fulfill({status:503})});
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'A software update is available'})).toBeVisible();currentVersion='b'.repeat(40);await page.getByRole('button',{name:'Check for updates',exact:true}).click();await page.getByRole('button',{name:'Update',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Your software update is starting'})).toBeVisible();expect(calls).toBe(1);expect(manifests).toBe(0);await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);
});


test('support workspace filters tickets, opens replies and fits mobile',async({page})=>{
 await login(page);
 const tickets=Array.from({length:14},(_,i)=>({id:'support-'+i,ticketNumber:'TCW-'+i,subject:'Help request '+i,message:'Issue details '+i,category:i%2?'GENERAL':'ATTENDANCE',priority:i===0?'URGENT':'NORMAL',status:i===0?'RESOLVED':'OPEN',createdAt:'2026-10-06T08:00:00Z',updatedAt:'2026-10-06T09:00:00Z'}));
 await page.route('**/api/support?**',route=>route.fulfill({json:{items:tickets}}));
 await page.route('**/api/support/*/messages',route=>route.request().method()==='POST'?route.fulfill({status:500,json:{message:'Unable to send right now'}}):route.fulfill({json:{items:[{id:'message-1',authorName:'TCW Support',authorScope:'PLATFORM',message:'We are checking this request.',createdAt:'2026-10-06T09:00:00Z'}]}}));
 await page.goto('/support');await expect(page.getByRole('heading',{name:'Support center',exact:true})).toBeVisible();
 let attempts=0;await page.route('**/api/support',route=>{const body=route.request().postDataJSON();attempts++;return attempts===1?route.fulfill({status:500,json:{message:'Unable to create right now'}}):route.fulfill({json:{id:'new-ticket',ticketNumber:'TCW-NEW',status:'OPEN',createdAt:'2026-10-06T09:00:00Z',...body}})});
 await page.getByRole('button',{name:'New ticket',exact:true}).click();const request=page.getByRole('form',{name:'Support ticket request',exact:true});await request.getByRole('button',{name:'Attendance',exact:true}).click();await request.getByLabel('Ticket subject',{exact:true}).fill('My shift timing issue');await request.getByLabel('Describe the issue',{exact:true}).fill('Attendance has the wrong shift timing.');await request.getByLabel('New ticket priority',{exact:true}).selectOption('HIGH');await request.getByRole('button',{name:'Create ticket',exact:true}).click();await expect(request.getByRole('alert')).toContainText('Unable to create right now');await expect(request.getByLabel('Ticket subject',{exact:true})).toHaveValue('My shift timing issue');await request.getByRole('button',{name:'Create ticket',exact:true}).click();await expect(page.getByRole('heading',{name:'My shift timing issue',exact:true})).toBeVisible();await expect(page.locator('.support-ticket-context')).toContainText('Attendance');await page.locator('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();

 await expect(page.locator('.support-ticket')).toHaveCount(12);await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.support-ticket')).toHaveCount(1);
 await page.getByLabel('Search support tickets',{exact:true}).fill('Help request 2');await expect(page.locator('.support-ticket')).toHaveCount(1);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await page.getByLabel('Ticket category',{exact:true}).selectOption('ATTENDANCE');await expect(page.locator('.support-ticket')).toHaveCount(6);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await page.getByLabel('Ticket status',{exact:true}).selectOption('RESOLVED');await page.getByRole('button',{name:'Open ticket TCW-0: Help request 0',exact:true}).press('Enter');
 await expect(page.getByText('Sending a reply reopens this ticket.',{exact:true})).toBeVisible();await page.getByLabel('Ticket reply',{exact:true}).fill('The issue is still happening');await page.getByRole('button',{name:'Send reply',exact:true}).click();await expect(page.locator('.support-reply-error')).toContainText('Unable to send right now');await expect(page.getByLabel('Ticket reply',{exact:true})).toHaveValue('The issue is still happening');
 await page.locator('dialog').getByRole('button',{name:/Close/}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByLabel('Search support tickets',{exact:true})).toBeVisible();}
});

test('Time Off filters, exact server balances, retry-safe forms and mobile scrolling',async({page})=>{
 await login(page);
 const employee={id:'00000000-0000-4000-8000-000000000101',firstName:'Leave',lastName:'Tester',employeeCode:'QA-LEAVE',designation:'QA Engineer'};
 const type={id:'00000000-0000-4000-8000-000000000102',name:'Annual leave',annualDays:12,paid:true};
 let rows:any[]=[{id:'leave-qa-pending',employeeId:employee.id,employee,leaveTypeId:type.id,startDate:'2027-01-04',endDate:'2027-01-04',days:.5,status:'PENDING',reason:'Family appointment',createdAt:'2026-10-06T10:00:00Z'},{id:'leave-qa-approved',employeeId:employee.id,employee,leaveTypeId:type.id,startDate:'2026-09-07',endDate:'2026-09-07',days:1,status:'APPROVED',reason:'Personal leave',createdAt:'2026-09-01T10:00:00Z'}];
 await page.route('**/api/employees?**',r=>r.fulfill({json:{items:[employee],total:1}}));
 await page.route('**/api/leave-types**',r=>r.fulfill({json:{items:[type]}}));
 await page.route('**/api/leave/balances?**',r=>r.fulfill({json:{items:[{id:type.id,name:type.name,paid:true,annual:12,approved:2,pending:.5,remaining:9.5}],paidTaken:2,unpaidTaken:0}}));
 let attempts=0;const payloads:any[]=[];
 await page.route('**/api/leave',r=>{if(r.request().method()==='GET')return r.fulfill({json:{items:rows,total:rows.length,summary:{PENDING:rows.filter(x=>x.status==='PENDING').length,APPROVED:1}}});const body=r.request().postDataJSON();payloads.push(body);attempts++;if(attempts===1)return r.fulfill({status:500,json:{message:'Synthetic request failure'}});const created={id:'new-leave-qa',...body,employee,days:1,status:'PENDING',createdAt:'2026-10-07T10:00:00Z'};rows=[created,...rows];return r.fulfill({json:created})});
 await page.goto('/leave');await expect(page.getByRole('heading',{name:'Time Off',exact:true})).toBeVisible();
 await expect(page.locator('.timeoff-v3-balances')).toContainText('9.5 days remaining');await expect(page.locator('.timeoff-v3-employee-summary')).toContainText('9.5');
 await page.getByLabel('Filter leave year',{exact:true}).selectOption('2026');await expect(page.locator('.timeoff-v3-table tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();await page.getByRole('tab',{name:'Pending (1)',exact:true}).click();await expect(page.locator('.timeoff-v3-table tbody tr')).toHaveCount(1);
 await page.getByLabel('Search time off requests',{exact:true}).fill('unmatched-qa');await expect(page.getByText('No matching time off requests',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await page.locator('.timeoff-v3-table tbody tr').first().focus();await page.keyboard.press('Enter');await expect(page.locator('.timeoff-v3-detail')).toContainText('Family appointment');
 await page.getByRole('button',{name:'Request Time Off',exact:true}).first().click();const dialog=page.getByRole('dialog');
 await expect(dialog.locator('.record-form-section')).toHaveCount(3);await dialog.locator('#field-employeeId').selectOption(employee.id);await dialog.locator('#field-leaveTypeId').selectOption(type.id);await dialog.locator('#field-startDate').fill('2027-01-07');await dialog.locator('#field-endDate').fill('2027-01-07');await dialog.locator('#field-reason').fill('Request retained after failure');
 await dialog.getByRole('button',{name:'Submit Request',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Synthetic request failure');await expect(dialog.locator('#field-reason')).toHaveValue('Request retained after failure');await dialog.getByRole('button',{name:'Submit Request',exact:true}).click();await expect(dialog).not.toBeVisible();expect(payloads[0].requestKey).toBeTruthy();expect(payloads[1].requestKey).toBe(payloads[0].requestKey);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByRole('button',{name:'Request Time Off',exact:true}).first().click();await page.getByRole('dialog').locator('#field-reason').fill('Mobile scroll test');await expect(page.getByRole('dialog').getByRole('button',{name:'Submit Request',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();}
});

test('Performance creates, validates, completes, filters and deletes goals with mobile forms',async({page})=>{
 await login(page);await page.goto('/goals');await expect(page.getByRole('heading',{name:'Performance',exact:true})).toBeVisible();
 const title='Browser measurable goal '+Date.now();await page.getByRole('button',{name:'Create goal',exact:true}).first().click();let dialog=page.getByRole('dialog');await expect(dialog.locator('.record-form-section')).toHaveCount(2);await dialog.locator('#field-employeeId').selectOption({index:1});await dialog.locator('#field-title').fill(title);await dialog.locator('#field-target').fill('30');await dialog.locator('#field-progress').fill('10');await dialog.locator('#field-dueDate').fill('2027-01-04');await dialog.getByRole('button',{name:'Create goal',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.locator('.performance-goal').filter({hasText:title})).toContainText('33%');
 await page.getByRole('button',{name:'View '+title,exact:true}).click();await expect(page.getByRole('dialog')).toContainText('10 / 30 units');await page.getByRole('dialog').getByRole('button',{name:'Update goal',exact:true}).click();dialog=page.getByRole('dialog');await dialog.locator('#field-progress').fill('31');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Progress cannot exceed');await expect(dialog.locator('#field-progress')).toHaveValue('31');await dialog.locator('#field-progress').fill('30');await dialog.locator('#field-status').selectOption('COMPLETED');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('tab',{name:'Completed',exact:true}).click();await expect(page.locator('.performance-goal').filter({hasText:title})).toContainText('100%');await page.getByLabel('Search goal titles',{exact:true}).fill('unmatched-performance-qa');await expect(page.getByText('No matching goals',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByRole('button',{name:'Create goal',exact:true}).first().click();await page.getByRole('dialog').locator('#field-progress').fill('10');await expect(page.getByRole('dialog').getByRole('button',{name:'Create goal',exact:true})).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();}
 await page.getByRole('button',{name:'Delete '+title,exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.getByRole('button',{name:'View '+title,exact:true})).toHaveCount(0);
});

test('Flexible Break switches to Over Break and counts excess seconds without waiting for refresh',async({page})=>{
 await login(page);const now=new Date();await page.clock.setFixedTime(now);
 const since=new Date(+now-599000).toISOString(),row={id:'flex-live-fixture',employeeId:'flex-employee',employeeName:'Flexible Timer',employeeCode:'FLEX-QA',date:now.toISOString().slice(0,10),status:'INSUFFICIENT_HOURS',dayType:'WORKING',shiftName:'Flexible shift',shiftTimezone:'UTC',firstIn:new Date(+now-1200000).toISOString(),lastOut:since,workedSeconds:600,completedWorkedSeconds:600,workingNow:false,liveState:'BREAK',breakMode:'PUNCH_ANYTIME',breakSeconds:0,liveBreakSeconds:599,allowedBreakMinutes:10,allowedBreakSeconds:600,currentBreakSince:since,overBreakSeconds:0,overBreakMinutes:0,inCount:1,outCount:1,sessions:[],punchHistory:[]};
 let calls=0;await page.route('**/api/attendance?**',r=>{calls++;return r.fulfill({json:{items:[row]}})});await page.goto('/attendance');await expect(page.locator('.attendance-frozen-table tbody')).toContainText('Break');
 await page.locator('.attendance-status-trigger').click();await page.getByRole('option',{name:'Over Break',exact:true}).click();await expect(page.locator('.attendance-frozen-table tbody tr')).toHaveCount(0);
 await page.clock.setFixedTime(new Date(+now+2000));await expect(page.locator('.attendance-frozen-table tbody tr')).toHaveCount(1);await expect(page.locator('.attendance-frozen-table tbody')).toContainText('Over break');
 await page.getByRole('button',{name:'View attendance details',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('.attendance-view-metrics').getByText('00:00:01',{exact:true})).toBeVisible();await expect(dialog.locator('.attendance-view-metrics>div').filter({has:page.getByText('Break',{exact:true})}).getByText('00:10:00',{exact:true})).toBeVisible();await page.clock.setFixedTime(new Date(+now+3000));await expect(dialog.locator('.attendance-view-metrics').getByText('00:00:02',{exact:true})).toBeVisible();
});

for(const mode of ['PUNCH_SCHEDULED','AUTO_SCHEDULED'])test(`${mode} mid-window break counts from OUT, crosses entitlement and freezes on IN`,async({page})=>{
 await login(page);const now=new Date();await page.clock.setFixedTime(now);const since=new Date(+now-599000).toISOString(),automatic=mode==='AUTO_SCHEDULED',base=automatic?300:0,allowed=base+600;
 let row:any={id:'scheduled-live-fixture',employeeId:'scheduled-employee',employeeName:'Scheduled Timer',employeeCode:'BREAK-QA',date:now.toISOString().slice(0,10),status:'INSUFFICIENT_HOURS',dayType:'WORKING',shiftName:'Scheduled shift',shiftTimezone:'UTC',firstIn:new Date(+now-3600000).toISOString(),lastOut:since,workedSeconds:600,completedWorkedSeconds:600,workingNow:false,liveState:'BREAK',breakMode:mode,breakSeconds:base,liveBreakSeconds:base+599,allowedBreakMinutes:allowed/60,allowedBreakSeconds:allowed,currentBreakSince:since,breakWindowStartTime:new Date(+now-1200000).toISOString(),breakEntitlementEnd:new Date(+now+1000).toISOString(),overBreakSeconds:0,completedOverBreakSeconds:0,inCount:1,outCount:1,sessions:[],punchHistory:[]};
 await page.route('**/api/attendance?**',r=>r.fulfill({json:{items:[row]}}));await page.goto('/attendance');await page.getByRole('button',{name:'View attendance details',exact:true}).click();let dialog=page.getByRole('dialog');let breakMetric=dialog.locator('.attendance-view-metrics>div').filter({has:page.getByText('Break',{exact:true})});await expect(breakMetric.getByText(automatic?'00:14:59':'00:09:59',{exact:true})).toBeVisible();
 await page.clock.setFixedTime(new Date(+now+2000));await expect(dialog.locator('.attendance-view-metrics').getByText('00:00:01',{exact:true})).toBeVisible();await expect(breakMetric.getByText(automatic?'00:15:00':'00:10:00',{exact:true})).toBeVisible();
 row={...row,currentBreakSince:null,breakEntitlementEnd:null,breakSeconds:allowed,liveBreakSeconds:allowed,overBreakSeconds:1,completedOverBreakSeconds:1,workingNow:true,liveState:'WORKING',openSessionSince:new Date(+now+2000).toISOString()};await page.reload();await page.getByRole('button',{name:'View attendance details',exact:true}).click();dialog=page.getByRole('dialog');breakMetric=dialog.locator('.attendance-view-metrics>div').filter({has:page.getByText('Break',{exact:true})});await expect(breakMetric.getByText(automatic?'00:15:00':'00:10:00',{exact:true})).toBeVisible();await page.clock.setFixedTime(new Date(+now+62000));await expect(dialog.locator('.attendance-view-metrics>div').filter({has:page.getByText('Over break',{exact:true})}).getByText('00:00:01',{exact:true})).toBeVisible();
});

test('employee phone dashboard shows actual break and excess instead of checkout',async({page})=>{
 await page.route('**/api/attendance/face-profile',r=>r.fulfill({json:{enrolled:true}}));
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/dashboard/);
 const now=new Date();await page.clock.setFixedTime(now);let row:any={id:'phone-dashboard-row',employeeId:'phone-dashboard-employee',date:now.toISOString().slice(0,10),firstIn:new Date(+now-3600000).toISOString(),lastOut:new Date(+now-599000).toISOString(),workingNow:false,liveState:'BREAK',breakMode:'PUNCH_SCHEDULED',currentBreakSince:new Date(+now-599000).toISOString(),breakEntitlementEnd:new Date(+now+1000).toISOString(),breakSeconds:0,allowedBreakSeconds:600,completedOverBreakSeconds:0,status:'INSUFFICIENT_HOURS',workMinutes:20};
 await page.route('**/api/dashboard',r=>r.fulfill({json:{employees:[{id:row.employeeId,firstName:'Phone'}],attendance:[row],latestPunch:{punchType:'OUT',punchTime:row.lastOut},company:{timezone:'UTC'},leave:[]}}));await page.route('**/api/attendance?**',r=>r.fulfill({json:{items:[row]}}));await page.reload();const status=page.locator('.employee-work-status');await expect(status.locator('.employee-work-status-main strong')).toHaveText('Break');await expect(status.locator('.employee-work-clock strong')).toHaveText('00:09:59');await expect(status.getByRole('button',{name:'Check IN',exact:true})).toBeEnabled();
 await page.clock.setFixedTime(new Date(+now+2000));await expect(status.locator('.employee-work-status-main strong')).toHaveText('Over Break');await expect(status.locator('.employee-work-clock strong')).toHaveText('00:00:01');
 row={...row,workingNow:true,liveState:'WORKING',currentBreakSince:null,breakEntitlementEnd:null,lastOut:null};await page.reload();await expect(status.locator('.employee-work-status-main strong')).toHaveText('Working');await expect(status.getByRole('button',{name:'Check OUT',exact:true})).toBeEnabled();
});

test('device workspace creates edits filters maps and reviews nested tools on desktop and phone',async({page})=>{
 await login(page);await page.goto('/devices');await expect(page.getByRole('heading',{name:'Every punch. Connected.',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Attendance Sources',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Search attendance sources'}).fill('SpeedFace 5SE Lite');await dialog.locator('.dt-catalog button').first().click();
 const name='QA terminal '+Date.now();await page.getByLabel('Device Name',{exact:true}).fill(name);await page.getByLabel('Serial / Source ID',{exact:true}).fill('E2E-'+Date.now());await page.getByRole('button',{name:'Create Device',exact:true}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Native PUSH setup',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();await expect(page.getByRole('heading',{name:'Device details',exact:true})).toBeVisible();
 await page.getByLabel('Device Name',{exact:true}).fill(name+' edited');await page.getByRole('button',{name:'Refresh devices',exact:true}).click();await expect(page.getByLabel('Device Name',{exact:true})).toHaveValue(name+' edited');await expect(page.getByText('Unsaved changes · live status refresh keeps your edits.')).toBeVisible();await page.getByRole('button',{name:'Update Device',exact:true}).click();await expect(page.getByText('Unsaved changes · live status refresh keeps your edits.')).toHaveCount(0);await page.screenshot({path:'test-results/device-desktop.png',fullPage:true});
 await page.getByRole('textbox',{name:'Search devices'}).fill(name);await expect(page.locator('.device-v3-list-item')).toHaveCount(1);await page.getByRole('combobox',{name:'Device source type'}).selectOption('Mobile App');await expect(page.getByRole('heading',{name:'No matching devices'})).toBeVisible();await page.getByRole('combobox',{name:'Device source type'}).selectOption('');
 await page.getByRole('button',{name:/Map Employees/}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'The right punch. The right person.',exact:true})).toBeVisible();await dialog.getByRole('combobox',{name:'Mapping employee'}).selectOption({label:'Team Lead · CHART-LEAD'});await dialog.getByRole('textbox',{name:'Device user ID'}).fill('E2E-101');await dialog.getByRole('button',{name:'Save mapping',exact:true}).click();await expect(dialog.locator('tbody')).toContainText('E2E-101');await dialog.getByRole('button',{name:'Remove',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Remove employee mapping?',exact:true})}).getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog.getByRole('heading',{name:'No matching mappings',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Test Connection',exact:true}).click();await page.getByRole('button',{name:/Sync Log/}).click();dialog=page.getByRole('dialog');await expect(dialog.locator('.dt-timeline')).toContainText('Connection test');await dialog.getByRole('combobox',{name:'Log level'}).selectOption('WARN');await expect(dialog.locator('.dt-timeline')).toContainText('waiting for the device');await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:/Live Punches/}).click();dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'No matching punches',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Close dialog'}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();if(width===390)await page.screenshot({path:'test-results/device-mobile.png',fullPage:true});await page.getByRole('button',{name:'Device Setup',exact:true}).click();dialog=page.getByRole('dialog');expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();await dialog.getByRole('button',{name:'Close dialog'}).click();}
 await page.getByRole('button',{name:'Delete Device',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await expect(page.locator('.device-v3-list-item')).toHaveCount(0);
});

test('device modal filters seconds, log levels, pagination and read-only actions',async({page})=>{
 await login(page);const device={id:'device-read-fixture',name:'QA Read Device',vendor:'GENERIC',model:'QA',serialNumber:'READ-101',connectionMode:'MIDDLEWARE',host:'',port:5005,timezone:'UTC',status:'ONLINE',branchId:null,updatedAt:new Date().toISOString()};
 await page.route('**/api/auth/me',async route=>{const response=await route.fetch(),json=await response.json();json.user.permissions=['dashboard:VIEW','devices:VIEW'];await route.fulfill({response,json})});await page.route('**/api/devices?**',r=>r.fulfill({json:{items:[device],total:1}}));
 const punches=Array.from({length:18},(_,i)=>({id:'p-'+i,employeeId:'qa',employee:{firstName:'QA',lastName:'Person',employeeCode:'EMP-'+i},punchTime:new Date(Date.now()-i*60000).toISOString(),punchType:i%2?'OUT':'IN',verificationType:'FACE_DEVICE',processedAt:i?new Date().toISOString():null}));await page.route('**/api/devices/device-read-fixture/punches',r=>r.fulfill({json:{items:punches}}));await page.route('**/api/devices/device-read-fixture/mappings',r=>r.fulfill({json:{items:[{id:'map-fixture',deviceUserId:'42',active:true,employee:{firstName:'QA',lastName:'Person',employeeCode:'EMP-42'}}]}}));
 await page.goto('/devices');await expect(page.getByRole('button',{name:'Add Device',exact:true})).toHaveCount(0);await expect(page.getByLabel('Device Name',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:/Gateway Key/})).toHaveCount(0);
 await page.getByRole('button',{name:/Live Punches/}).click();let dialog=page.getByRole('dialog');await expect(dialog.locator('tbody tr')).toHaveCount(15);await dialog.getByRole('button',{name:'Next records',exact:true}).click();await expect(dialog.locator('tbody tr')).toHaveCount(3);await dialog.getByRole('combobox',{name:'Punch type'}).selectOption('IN');await expect(dialog.locator('tbody tr')).toHaveCount(9);await dialog.getByRole('textbox',{name:'Search punches'}).fill('EMP-10');await expect(dialog.locator('tbody tr')).toHaveCount(1);await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:/Map Employees/}).click();dialog=page.getByRole('dialog');await expect(dialog.locator('tbody')).toContainText('42');await expect(dialog.getByRole('button',{name:'Save mapping',exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Remove',exact:true})).toHaveCount(0);
});


test('company payment setup and manual salary recording work on desktop and mobile',async({page})=>{
 await login(page);await page.goto('/payroll');await page.getByRole('button',{name:'Payment settings',exact:true}).click();
 const settings=page.locator('.company-payments');await expect(settings.getByRole('heading',{name:'Company payment settings'})).toBeVisible();
 await settings.getByRole('combobox',{name:'Payment method',exact:true}).selectOption('BANK_FILE');await settings.getByLabel('Account label',{exact:true}).fill('Synthetic salary account');await settings.getByRole('checkbox',{name:'I am authorized to configure'}).check();await settings.getByRole('button',{name:'Save company payment settings'}).click();await expect(settings.locator('.payment-summary')).toContainText('Synthetic salary account');
 await settings.getByRole('combobox',{name:'Payment method',exact:true}).selectOption('BANK_API');await expect(settings).toContainText('No business bank connector is installed yet.');await expect(settings.getByRole('textbox',{name:'API key ID',exact:true})).toHaveValue('');
 await expect(settings.getByRole('checkbox',{name:'Enable live payments'})).toBeDisabled();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-bank-settings-${width}.png`,fullPage:true,animations:'disabled'});}
 await settings.getByRole('button',{name:/^Manual payment/}).click();await expect(settings.getByRole('combobox',{name:'Payment method',exact:true})).toHaveValue('MANUAL');await expect(settings.getByRole('textbox',{name:'API key ID',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Payroll',exact:true}).click();await page.getByLabel('Payroll month',{exact:true}).fill('2024-01');
 const center=page.locator('.payroll-payment-center');await expect(center.getByRole('heading',{name:'Salary payment controls',exact:true})).toBeVisible();await expect(center.getByRole('button',{name:'Schedule automatic salary',exact:true})).toBeDisabled();
 await center.getByRole('textbox',{name:'Search salary payments'}).fill('no-such-employee');await expect(center.getByText('No matching salary payments',{exact:true})).toBeVisible();await center.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(center.getByRole('button',{name:'Record manual payment',exact:true})).toBeVisible();
 await center.getByRole('combobox',{name:'Filter salary payments'}).selectOption('PAID');await expect(center.getByText('No matching salary payments',{exact:true})).toBeVisible();await center.getByRole('combobox',{name:'Filter salary payments'}).selectOption('ALL');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-payroll-payments-${width}.png`,fullPage:true,animations:'disabled'});}
 await center.getByRole('button',{name:'Record manual payment',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('UTR / cleared cheque / signed receipt reference',{exact:true}).fill('SYNTHETIC-MANUAL-UTR');await dialog.getByRole('checkbox',{name:'I confirm the full salary was actually paid'}).check();await dialog.getByRole('button',{name:'Record confirmed salary payment',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(center.locator('.payment-status').filter({hasText:/^Paid$/})).toBeVisible();await expect(page.locator('.payroll-v6-payment-cards .paid strong')).toHaveText('1');
 await page.getByRole('button',{name:'Salary Payment Challan',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('SYNTHETIC-MANUAL-UTR');
});

test('field workspace saves company policy and reviews locations, visits and routes on desktop and mobile',async({page})=>{
 await login(page);let policy={enabled:true,intervalSeconds:30,maxAccuracyMeters:100,maxSessionHours:10,employeeIds:[]};const id='11111111-1111-4111-8111-111111111111',point={id:'point',latitude:23.0225,longitude:72.5714,accuracy:12,capturedAt:new Date().toISOString(),receivedAt:new Date().toISOString()};
 const rows=[{id,firstName:'Field',lastName:'Employee',employeeCode:'FIELD-01',state:'LIVE',point},{id:'22222222-2222-4222-8222-222222222222',firstName:'GPS',lastName:'Delayed',employeeCode:'FIELD-02',state:'STALE',point}];let visits:any[]=[];
 await page.route('**/api/field-work',r=>r.fulfill({json:{items:rows,policy}}));await page.route('**/api/field-work/settings',r=>{if(r.request().method()==='PUT')policy=r.request().postDataJSON();return r.fulfill({json:{policy,retentionDays:30}})});
 await page.route('**/api/field-work/visits',r=>{if(r.request().method()==='POST')visits=[{...r.request().postDataJSON(),id:'visit',status:'PLANNED',createdAt:new Date().toISOString()},...visits];return r.fulfill({json:r.request().method()==='POST'?visits[0]:{items:visits}})});
 await page.route('**/api/field-work/history?**',r=>r.fulfill({json:{items:[point,{...point,id:'p2',latitude:23.023,longitude:72.572}],truncated:false}}));let faceRows:any[]=[{id:'face-review-fixture',employee:{firstName:'Field',lastName:'Employee',employeeCode:'FIELD-01'},updatedAt:new Date().toISOString(),preview:'/meghna-avatar.svg'}];await page.route('**/api/attendance/face-review',r=>{if(r.request().method()==='POST'){expect(r.request().postDataJSON().identityConfirmed).toBe(true);faceRows=[];return r.fulfill({json:{ok:true}})}return r.fulfill({json:{items:faceRows}})});
 await page.goto('/field-work');await expect(page.getByRole('heading',{name:'Your team in the field'})).toBeVisible();await expect(page.locator('.field-person-card')).toHaveCount(2);await expect(page.locator('.field-state.stale')).toHaveText('Delayed');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-field-live-${width}.png`,fullPage:true,animations:'disabled'});}
 await page.getByRole('button',{name:'Company settings',exact:true}).click();await page.getByLabel('Location update interval (seconds)',{exact:true}).fill('45');await page.getByRole('button',{name:'Save field settings',exact:true}).click();await expect(page.getByRole('status')).toContainText('Company field settings saved');expect(policy.intervalSeconds).toBe(45);
 await page.getByRole('button',{name:'Visits',exact:true}).click();await page.getByRole('combobox',{name:'Employee',exact:true}).selectOption(id);await page.getByLabel('Visit purpose',{exact:true}).fill('Customer inspection');await page.getByLabel('Customer / site',{exact:true}).fill('QA Customer');await page.getByLabel('Site latitude (optional)',{exact:true}).fill('23.0225');await page.getByLabel('Site longitude (optional)',{exact:true}).fill('72.5714');await page.getByRole('button',{name:'Plan visit',exact:true}).click();await expect(page.locator('.field-visit-card')).toContainText('Customer inspection');expect(visits[0].radiusMeters).toBe(200);
 await page.getByRole('button',{name:'Route history',exact:true}).first().click();await page.getByLabel('Route employee',{exact:true}).selectOption(id);await expect(page.getByRole('img',{name:'Route overview from shared GPS points'})).toBeVisible();await expect(page.locator('.field-route-preview')).toContainText('2 shared GPS points');await page.screenshot({path:'test-results/people-field-route-mobile.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Face approvals',exact:true}).click();await expect(page.getByRole('button',{name:'Approve identity',exact:true})).toBeDisabled();await page.getByLabel('I checked whether this face belongs to this employee.').check();await page.screenshot({path:'test-results/people-field-face-review-mobile.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'Approve identity',exact:true}).click();await expect(page.getByRole('heading',{name:'No face setups awaiting approval'})).toBeVisible();
});

test('employee field sharing requires consent, reports GPS and stops across page navigation',async({page,context})=>{
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:23.0225,longitude:72.5714,accuracy:10});await page.route('**/api/attendance/face-profile',r=>r.fulfill({json:{enrolled:true,status:'APPROVED',attendanceReady:true}}));
 const policy={enabled:true,intervalSeconds:15,maxAccuracyMeters:100,maxSessionHours:10,employeeIds:[]};let active:any=null,points=0;
 await page.route('**/api/field-work/session',r=>{const method=r.request().method();if(method==='POST'){expect(r.request().postDataJSON().consent).toBe(true);active={id:'11111111-1111-4111-8111-111111111111',expiresAt:new Date(Date.now()+3600000).toISOString()};}if(method==='DELETE')active=null;return r.fulfill({json:{session:active,policy,eligible:true}})});await page.route('**/api/field-work/point',r=>{points++;expect(r.request().postDataJSON().point.latitude).toBe(23.0225);return r.fulfill({json:{ok:true}})});await page.route('**/api/field-work',r=>r.fulfill({json:{items:[],policy}}));await page.route('**/api/field-work/visits',r=>r.fulfill({json:{items:[]}}));
 await page.goto('/login');await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);await page.locator('input[name=username]').fill('phone-employee@example.test');await page.locator('input[name=password]').fill(process.env.E2E_EMPLOYEE_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/dashboard/);await page.goto('/field-work');await page.setViewportSize({width:390,height:844});
 const start=page.getByRole('button',{name:'Start field work',exact:true});await expect(start).toBeDisabled();await page.getByLabel('I agree to share my location with my company during this field session.').check();await start.click();await expect(page.locator('.field-sharing-banner')).toContainText('Field location sharing is on');await expect.poll(()=>points).toBeGreaterThan(0);await page.screenshot({path:'test-results/people-field-employee-mobile.png',fullPage:true,animations:'disabled'});
 await page.goto('/profile');await expect(page.locator('.field-sharing-banner')).toBeVisible();await page.locator('.field-sharing-banner').getByRole('button',{name:'Stop sharing location'}).click();await expect(page.locator('.field-sharing-banner')).toHaveCount(0);expect(active).toBeNull();
});

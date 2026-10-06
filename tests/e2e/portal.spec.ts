import {test,expect} from '@playwright/test';
import {totp} from '../../packages/auth/totp';

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
 await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software update is queued'})).toBeVisible();expect(updateCalls).toBe(1);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/software-update$/);await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByRole('heading',{name:'Your software update is queued'})).toBeVisible();}
});

test('software update errors allow a retry and restricted users cannot start an update',async({page})=>{
 await login(page);const version='b'.repeat(40);let canUpdate=true;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion:'a'.repeat(40),candidate:{version,title:'Synthetic update'},available:true,updateRequested:false,ready:false,canUpdate,checkedAt:new Date().toISOString()}}));
 await page.route('**/api/releases/update',route=>route.fulfill({status:409,json:{message:'The available release changed. Check for updates again before updating.'}}));
 await page.goto('/software-update');await page.getByRole('button',{name:'Update',exact:true}).click();await expect(page.getByText('The available release changed. Check for updates again before updating.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toBeEnabled();await expect(page).toHaveURL(/software-update$/);
 canUpdate=false;await page.reload();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);await expect(page.getByText('Your HR/Admin can start software updates.',{exact:true})).toBeVisible();
});

test('update action is hidden when current and appears only after a new version is available to this device',async({page})=>{
 await login(page);let currentVersion='a'.repeat(40),navigations=0;
 await page.route('**/api/releases/status',route=>route.fulfill({json:{enabled:true,currentVersion,available:false,updateRequested:false,canUpdate:true,checkedAt:new Date().toISOString()}}));
 await page.goto('/software-update');await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Refresh this device',exact:true})).toHaveCount(0);
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++});currentVersion='b'.repeat(40);
 await page.getByRole('button',{name:'Check for updates',exact:true}).click();await expect(page.getByRole('heading',{name:'Your software update is live'})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(1);expect(navigations).toBe(0);
 await Promise.all([page.waitForEvent('framenavigated',frame=>frame===page.mainFrame()),page.getByRole('button',{name:'Update',exact:true}).click()]);
 await expect(page.getByRole('heading',{name:'Your software is up to date'})).toBeVisible();await expect(page.getByRole('button',{name:'Update',exact:true})).toHaveCount(0);
});

for(const master of [{key:'departments',label:'Departments',singular:'department',field:'Department name',code:'Department code'},{key:'branches',label:'Branches',singular:'branch',field:'Branch name',code:'Branch code'},{key:'designations',label:'Designations',singular:'designation',field:'Designation name',code:'Designation code'},{key:'teams',label:'Teams',singular:'team',field:'Team name',code:'Team code'},{key:'locations',label:'Locations',singular:'location',field:'Location name',code:'Code'},{key:'cost-centers',label:'Cost centers',singular:'cost center',field:'Cost center',code:'Code'}])test('organization '+master.key+' supports create edit search list and protected directory actions',async({page})=>{
 await login(page);await page.goto('/organization?tab='+master.key);await expect(page.getByRole('heading',{name:master.label,exact:true})).toBeVisible();
 const unique=Date.now().toString(),name=({'departments':'Product Engineering','branches':'Ahmedabad Office','designations':'Operations Specialist','teams':'Product Team','locations':'Hybrid Workspace','cost-centers':'Business Operations'} as Record<string,string>)[master.key];await page.getByRole('button',{name:'Add '+master.singular,exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel(master.field).fill(name);await dialog.getByLabel(master.code).fill('ORG-'+unique);await dialog.getByLabel('Description').fill('Synthetic directory record');
 if(master.key==='branches'){await dialog.getByLabel('Location / area').fill('Test area');await dialog.getByLabel('City',{exact:true}).fill('Test city')}
 await dialog.getByRole('button',{name:'Create '+master.singular,exact:true}).click();await expect(dialog).not.toBeVisible();await page.getByRole('textbox',{name:'Search '+master.label.toLowerCase(),exact:true}).fill(name);await expect(page.locator('.org-card').filter({hasText:name})).toHaveCount(1);
 await page.getByRole('button',{name:'Edit '+name,exact:true}).click();await dialog.getByLabel(master.field).fill(name+' edited');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:name+' edited',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'List view',exact:true}).click();await expect(page.locator('.org-list')).toContainText(name+' edited');await page.getByRole('button',{name:'Card view',exact:true}).click();
 await page.getByRole('textbox',{name:'Search '+master.label.toLowerCase(),exact:true}).fill('');await expect(page.locator('.org-results')).not.toContainText('Results for');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()}
 if(master.key==='branches')await page.screenshot({path:'test-results/organization-mobile.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1440,height:1000});if(master.key==='departments')await page.screenshot({path:'test-results/organization-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Delete '+name+' edited',exact:true}).click();await dialog.getByRole('button',{name:'Confirm',exact:true}).click();await expect(dialog).not.toBeVisible();await expect(page.getByRole('heading',{name:'No matching records',exact:true})).toBeVisible();
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
 await form.getByLabel('Working Week Pattern',{exact:true}).selectOption('MON_FRI');await form.getByLabel('Late Grace',{exact:true}).fill('15');
 await form.getByRole('button',{name:'Evening shift preset',exact:true}).click();await expect(form.getByLabel('Start Time',{exact:true})).toHaveValue('02:00 PM');await expect(form.getByLabel('End Time',{exact:true})).toHaveValue('11:00 PM');await expect(form.getByLabel('Working Week Pattern',{exact:true})).toHaveValue('MON_FRI');await expect(form.getByLabel('Late Grace',{exact:true})).toHaveValue('15');
 await form.getByRole('button',{name:'Morning shift preset',exact:true}).click();await expect(form.getByLabel('Start Time',{exact:true})).toHaveValue('09:00 AM');await form.getByRole('button',{name:'Night shift preset',exact:true}).click();
 await form.getByLabel('Half Day Time in HH:MM',{exact:true}).fill('03:30');await form.getByLabel('Half Day Time in HH:MM',{exact:true}).blur();await form.getByLabel('Overtime After in HH:MM',{exact:true}).fill('08:30');await form.getByLabel('Overtime After in HH:MM',{exact:true}).blur();
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
 await dialog.getByRole('button',{name:'Create employee'}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('textbox',{name:'Search people directory'}).fill('browser-'+unique);
 const row=page.getByRole('row').filter({hasText:'browser-'+unique});await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Edit employee'}).click();await page.getByRole('dialog').getByLabel('Designation').selectOption({label:'Senior QA'});await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(row).toContainText('Senior QA');
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
 await dialog.getByLabel('Employee file').setInputFiles({name:'employees.csv',mimeType:'text/csv',buffer:Buffer.from(`employeeCode,firstName,lastName,email,phone,joiningDate\nIMP-${suffix},Import,Browser,import-${suffix}@example.test,9000000000,2026-01-01`)});
 await dialog.getByRole('button',{name:'Preview file',exact:true}).click();await expect(dialog).toContainText('Ready to import');
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

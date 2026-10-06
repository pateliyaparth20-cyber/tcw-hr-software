import {test,expect} from '@playwright/test';
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
 await login(page);await page.keyboard.press('Control+k');await page.getByRole('textbox',{name:'Search pages and employees'}).fill('Calendar');await page.getByRole('dialog').getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.getByRole('heading',{name:'Calendar',exact:true})).toBeVisible();
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

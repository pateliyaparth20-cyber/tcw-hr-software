import {test,expect} from '@playwright/test';
async function login(page:any,admin=false){
 await page.addInitScript(()=>localStorage.setItem('tcw_cookie_consent_v1','essential'));
 await page.goto(admin?'http://localhost:3001/admin-login':'http://localhost:3000/login');
 if(!admin)await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);
 await page.locator('input[name=username]').fill(admin?process.env.ADMIN_EMAIL!:process.env.OWNER_EMAIL!);
 await page.locator('input[name=password]').fill(admin?process.env.ADMIN_PASSWORD!:process.env.OWNER_PASSWORD!);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page).toHaveURL(/dashboard/);
}
test('Super Admin opens a company through POST proxy handoff and returns with its platform session',async({page})=>{
 await login(page,true);await page.goto('http://localhost:3001/companies');
 await page.getByRole('button',{name:'Proxy login',exact:true}).first().click();
 await expect(page).toHaveURL(/localhost:3000\/dashboard/);await expect(page.locator('.company-proxy-banner')).toContainText('Super Admin proxy');
 await page.getByRole('link',{name:'People',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Your team, connected.'})).toBeVisible();await expect(page.locator('.company-proxy-banner')).toBeVisible();
 await page.screenshot({path:'test-results/people-company-proxy-desktop.png',fullPage:true,animations:'disabled'});
 await page.locator('.company-proxy-banner').getByRole('button',{name:'End proxy / Super Admin'}).click();await expect(page).toHaveURL(/localhost:3001\/companies/);await expect(page.getByRole('button',{name:'Proxy login',exact:true}).first()).toBeVisible();
});
test('Teams connect to employee dropdowns, work locations preserve choices and mobile profiles scroll',async({page})=>{
 await login(page);const me=await (await page.request.get('/api/auth/me')).json();
 const headers={'X-CSRF-Token':me.csrf};
 const team=await (await page.request.post('/api/teams',{headers,data:{name:'Browser Field Team',code:'BROWSER-FIELD'}})).json();
 await page.request.post('/api/locations',{headers,data:{name:'Browser Customer Site',code:'BROWSER-SITE'}});
 await page.goto('/employees?teamId='+team.id);await page.getByRole('button',{name:'Add Employee',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.locator('#field-teamId')).toHaveValue(team.id);await expect(dialog.getByRole('combobox',{name:/^Work location/}).getByRole('option',{name:'Browser Customer Site'})).toHaveCount(1);
 await dialog.getByRole('combobox',{name:/^Work location/}).selectOption({label:'Browser Customer Site'});await dialog.getByRole('button',{name:'Close dialog'}).click();
 await page.goto('/organization?tab=teams');await page.getByRole('button',{name:'Members (0)',exact:true}).first().click();await expect(page.getByRole('dialog')).toContainText('No employees assigned');await page.getByRole('dialog').getByRole('button',{name:'Close dialog'}).click();
 await page.goto('/employees');await page.setViewportSize({width:390,height:500});await page.getByRole('button',{name:/View profile of/}).first().click();
 const profile=page.locator('.pd-profile-modal'),scroll=profile.locator('.pd-profile');await expect(scroll).toBeVisible();expect(await scroll.evaluate(el=>el.scrollHeight>el.clientHeight)).toBeTruthy();await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});await expect(profile.getByRole('button',{name:'Close dialog'})).toBeVisible();expect(await profile.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.setViewportSize({width:1366,height:650});await expect.poll(()=>scroll.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});expect(await scroll.evaluate(el=>el.scrollTop>0)).toBeTruthy();await expect(profile.locator('.pd-profile-footer')).toBeVisible();await expect(profile.getByRole('button',{name:'Close dialog'})).toBeVisible();await page.screenshot({path:'test-results/people-profile-scroll-desktop.png',animations:'disabled'});await page.setViewportSize({width:390,height:500});
 await page.screenshot({path:'test-results/people-profile-scroll-mobile.png',fullPage:true,animations:'disabled'});await profile.getByRole('button',{name:'Close dialog'}).click();
});
test('Company profile and field workspace use the shared palette without horizontal overflow',async({page})=>{
 await login(page);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});await page.goto('/settings');await expect(page.getByRole('heading',{name:'Company Profile',exact:true})).toBeVisible();await expect(page.getByRole('group',{name:'Company identity'})).toBeVisible();
  if(width===1440){await page.getByRole('button',{name:'Save company profile',exact:true}).click();await expect(page.getByText('Company profile saved.',{exact:true})).toBeVisible();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-company-profile-${width}.png`,fullPage:true,animations:'disabled'});
  await page.goto('/field-work');await expect(page.getByRole('heading',{name:'Your team in the field'})).toBeVisible();expect(await page.locator('.field-hero').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('186, 230, 253');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`test-results/people-field-design-${width}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Company settings',exact:true}).click();await expect(page.getByRole('heading',{name:'Field work settings'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
});

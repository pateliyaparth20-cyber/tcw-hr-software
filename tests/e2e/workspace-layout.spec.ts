import {test,expect,type Page} from '@playwright/test';
test.use({serviceWorkers:'block'});
async function signIn(page:Page,employee=false){
 await page.addInitScript(()=>localStorage.setItem('tcw_cookie_consent_v1','essential'));
 if(employee)await page.route('**/api/attendance/face-profile',route=>route.fulfill({json:{enrolled:true,status:'APPROVED',attendanceReady:true}}));
 await page.goto('/login');
 await page.locator('input[name=companyCode]').fill(process.env.DEMO_COMPANY_CODE!);
 await page.locator('input[name=username]').fill(employee?'phone-employee@example.test':process.env.OWNER_EMAIL!);
 await page.locator('input[name=password]').fill(employee?process.env.E2E_EMPLOYEE_PASSWORD!:process.env.OWNER_PASSWORD!);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/dashboard/);
}
test('HR workspace aligns page actions and keeps wide tables inside their panels',async({page})=>{
 test.setTimeout(180000);await signIn(page);
 for(const width of [1440,820,390,320]){
  await page.setViewportSize({width,height:900});
  for(const path of ['dashboard','employees','attendance','leave','payroll']){
   await page.goto('/'+path);await expect(page.locator('.workspace-main')).toBeVisible();
   await expect(page.locator('.workspace-main').getByRole('heading').first()).toBeVisible();
   await expect(page.locator('.workspace-main .loading')).toHaveCount(0);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await expect.poll(()=>page.locator('.title-actions .btn').evaluateAll(elements=>elements.every(element=>{const rect=element.getBoundingClientRect();return rect.width===0||(rect.left>=-1&&rect.right<=innerWidth+1)}))).toBe(true);
   await page.screenshot({path:`test-results/people-hr-${path}-${width}.png`,fullPage:true,animations:'disabled'});
  }
 }
});
test('employee pages fit phones and desktops with readable check IN and profile initials',async({page})=>{
 test.setTimeout(180000);await signIn(page,true);
 for(const width of [1440,820,769,768,390,320]){
  await page.setViewportSize({width,height:900});await page.goto('/dashboard');
  await expect(page.locator('.employee-home-dashboard')).toBeVisible();
  const action=page.locator('.employee-home-face-button');await expect(action.locator('strong')).toBeVisible();
  await expect(action.locator('small')).toBeVisible();
  expect(await page.locator('.employee-home-person .avatar-initials').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(7, 89, 133)');
  expect(await page.locator('.employee-home-person .avatar-initials').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const text=range.getBoundingClientRect(),avatar=el.parentElement!.getBoundingClientRect();return Math.abs(text.x+text.width/2-avatar.x-avatar.width/2)<3&&Math.abs(text.y+text.height/2-avatar.y-avatar.height/2)<3})).toBe(true);
  await page.locator('.employee-home-person h1').evaluate(el=>{el.textContent='Alexandriawithalongfirstname'});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/people-employee-polished-${width}.png`,fullPage:true,animations:'disabled'});
 }
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  for(const path of ['attendance','leave','payroll','expenses','calendar','profile']){
   await page.goto('/'+path);await expect(page.locator('.employee-app-main')).toBeVisible();
   await expect(page.locator('.employee-app-main').getByRole('heading').first()).toBeVisible();
   await expect(page.locator('.employee-app-main .loading')).toHaveCount(0);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
   await page.screenshot({path:`test-results/people-employee-${path}-${width}.png`,fullPage:true,animations:'disabled'});
  }
 }
});

import {test,expect} from '@playwright/test';
import 'dotenv/config';
async function login(page:any,admin=false){
 await page.goto(admin?'http://localhost:3001/login':'/login');
 if(!admin)await page.getByLabel('Company code').fill(process.env.DEMO_COMPANY_CODE??'TCW-DEMO');
 await page.getByLabel('Email / User ID').fill((admin?process.env.ADMIN_EMAIL:process.env.OWNER_EMAIL)!);
 await page.getByLabel('Password',{exact:true}).fill((admin?process.env.ADMIN_PASSWORD:process.env.OWNER_PASSWORD)!);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page).toHaveURL(/dashboard/);
}
test('protected routes require login',async({page})=>{await page.goto('/employees');await expect(page).toHaveURL(/login/);await expect(page.getByRole('heading',{name:'Sign in',exact:true})).toBeVisible()});
test('HR directory create edit search and archive',async({page})=>{
 await login(page);await page.getByRole('link',{name:'People',exact:true}).click();
 await expect(page.getByRole('heading',{name:'People directory'})).toBeVisible();
 await page.getByRole('button',{name:'Add employee',exact:true}).first().click();
 const dialog=page.getByRole('dialog');const unique=Date.now().toString();
 await dialog.getByLabel('Employee ID').fill('E2E-'+unique);
 await dialog.getByLabel('First name').fill('Browser');await dialog.getByLabel('Last name').fill('Test');
 await dialog.getByLabel('Work email').fill('browser-'+unique+'@example.test');
 await dialog.getByLabel('Employment type').selectOption('FULL_TIME');
 await dialog.getByLabel('Joining date').fill('2026-01-01');await dialog.getByLabel('Employment status').selectOption('ACTIVE');
 await dialog.getByRole('button',{name:'Create employee'}).click();await expect(dialog).not.toBeVisible();
 await page.getByRole('textbox',{name:'Search people directory'}).fill('browser-'+unique);
 const row=page.getByRole('row').filter({hasText:'browser-'+unique});await expect(row).toBeVisible();
 await row.getByRole('button',{name:'Edit employee'}).click();await page.getByRole('dialog').getByLabel('Designation').fill('Browser verified');await page.getByRole('dialog').getByRole('button',{name:'Save changes'}).click();
 await expect(row).toContainText('Browser verified');
 await row.getByRole('button',{name:'Archive employee'}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm'}).click();await expect(row).not.toBeVisible();
});
test('command search and mobile navigation',async({page})=>{
 await login(page);await page.keyboard.press('Control+k');await page.getByRole('textbox',{name:'Search pages and employees'}).fill('Calendar');await page.getByRole('dialog').getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.getByRole('heading',{name:'Company calendar'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 const more=page.getByRole('button',{name:'Open menu'});await more.click();await expect(page.getByRole('button',{name:'Close menu'})).toBeVisible();
 await page.getByRole('button',{name:'Close menu'}).click();await expect(page.getByRole('button',{name:'Open menu'})).toBeVisible();
 await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('link',{name:'Attendance',exact:true}).click();await expect(page.getByRole('heading',{name:'Attendance',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Open menu'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
test('platform company and sales pages',async({page})=>{
 await login(page,true);await expect(page.getByRole('heading',{name:'Platform overview'})).toBeVisible();await page.getByRole('link',{name:'Companies',exact:true}).click();await expect(page.getByRole('heading',{name:'Companies',exact:true})).toBeVisible();await page.getByRole('link',{name:'Sales pipeline',exact:true}).click();await expect(page.getByRole('heading',{name:'Sales pipeline',exact:true})).toBeVisible();
});

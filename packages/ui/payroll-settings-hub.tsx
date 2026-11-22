'use client';
import {useApp,Empty} from './core';
import {PayrollSettingsPage} from './workforce-settings';
export function PayrollSettingsHub({initial}:{initial?:string}){
 const {can}=useApp();
 return can('payroll','MANAGE')?<section className="payroll-settings-hub"><PayrollSettingsPage/></section>:<Empty title="Payroll settings access required" description="Your payroll administrator manages these settings."/>;
}

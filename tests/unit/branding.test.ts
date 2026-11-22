import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PRODUCT_LOGO,normalizeLogo,effectiveCompanyLogo} from '../../packages/branding';
test('companies inherit the platform default without overwriting custom logos',()=>{
 const product='data:image/png;base64,new-default',custom='data:image/png;base64,company';for(const value of [null,undefined,'','/tcw-logo.png'])assert.equal(effectiveCompanyLogo(value,product),product);assert.equal(effectiveCompanyLogo(custom,product),custom);assert.equal(effectiveCompanyLogo(null,null),DEFAULT_PRODUCT_LOGO);
});

test('legacy logo paths and empty values never revive the bundled logo',()=>{for(const logo of ['/tcw-logo.png','https://hr.techcyberwarrior.in/tcw-logo.png?v=1','',null,DEFAULT_PRODUCT_LOGO])assert.equal(normalizeLogo(logo),null);assert.equal(effectiveCompanyLogo('/tcw-logo.png','/tcw-logo.png'),'/logo-placeholder.svg')});

 test('legacy loading appearances do not reappear before new settings are saved',async()=>{const {publicLoading}=await import('../../apps/api/src/loading-branding');const db:any={platformSetting:{findUnique:async()=>({value:{title:'Old loader',message:'Old message',animation:'ORBIT',logo:'/tcw-logo.png',accent:'#7c3aed',background:'#f7f4fc'},updatedAt:new Date()})}};const loading=await publicLoading(db);assert.equal(loading.title,'Loading workspace');assert.equal(loading.animation,'SPINNER');assert.equal(loading.logo,null);});

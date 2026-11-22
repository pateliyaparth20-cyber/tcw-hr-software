import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveCompanyLogo} from '../../packages/branding';
test('companies inherit the platform default without overwriting custom logos',()=>{
 const product='data:image/png;base64,new-default',custom='data:image/png;base64,company';for(const value of [null,undefined,'','/tcw-logo.png'])assert.equal(effectiveCompanyLogo(value,product),product);assert.equal(effectiveCompanyLogo(custom,product),custom);assert.equal(effectiveCompanyLogo(null,null),'/tcw-logo.png');
});

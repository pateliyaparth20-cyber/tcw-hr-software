import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('sales-ready UI and security contracts stay enabled',()=>{
  const faceUi=read('packages/ui/face.tsx');
  const workflows=read('apps/api/src/workflows.ts');
  const payments=read('apps/api/src/subscription-payments.ts');
  const config=read('packages/ui/config.ts');
  const portal=read('packages/ui/portal.tsx');
  const core=read('packages/ui/core.tsx');
  const styles=read('packages/ui/styles.css');
  const dashboard=read('packages/ui/dashboard.tsx');

  assert.match(faceUi,/TURN_AND_RETURN/);
  assert.match(faceUi,/frames:\[first\.frame,turned\.frame,returned\.frame\]/);
  assert.doesNotMatch(faceUi,/Rechecking face/);
  assert.match(workflows,/Face Scan security was upgraded/);
  assert.match(workflows,/new Set\(frameHashes\)\.size!==3/);

  assert.match(payments,/upi_link:true/);
  assert.doesNotMatch(payments,/checkout:\{method:\{upi:true/);

  assert.match(config,/'platform-users'/);
  assert.match(config,/SUPPORT_AGENT/);
  assert.match(portal,/password-visibility/);
  assert.doesNotMatch(portal,/body\.style\.overflow\s*=\s*['\"]hidden['\"]/);
  assert.doesNotMatch(portal,/html\.style\.overflow\s*=\s*['\"]hidden['\"]/);
  assert.doesNotMatch(portal,/body\.style\.touchAction\s*=\s*['\"]none['\"]/);
  assert.match(core,/passwordVisible/);
  assert.match(styles,/Sales-ready product polish/);
  assert.match(styles,/safe-area-inset-bottom/);
  assert.match(dashboard,/ALL-IN-ONE HR SOFTWARE/);
  assert.match(dashboard,/LiveClock/);
});

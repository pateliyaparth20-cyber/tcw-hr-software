import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const read=(path:string)=>readFileSync(join(process.cwd(),path),'utf8');

test('employee face attendance requires live multi-frame identity verification',()=>{
  const profile=read('apps/api/src/face-profile.ts');
  const workflows=read('apps/api/src/workflows.ts');
  const ui=read('packages/ui/face.tsx');
  assert.match(profile,/FACE_MATCH_THRESHOLD=0\.48/);
  assert.match(profile,/FACE_MATCH_MAX_THRESHOLD=0\.54/);
  assert.match(profile,/FACE_SCAN_SAMPLE_COUNT=3/);
  assert.match(profile,/strongMatches>=2/);
  assert.match(workflows,/frames:z\.array\([^\n]+\)\.length\(3\)/);
  assert.match(workflows,/descriptors:z\.array\([^\n]+\)\.length\(3\)/);
  assert.match(workflows,/challenge:z\.literal\('TURN_AND_RETURN'\)/);
  assert.match(workflows,/Face Scan security was upgraded/);
  assert.match(workflows,/new Set\(frameHashes\)\.size!==3/);
  assert.match(ui,/Turn your head clearly to either side/);
  assert.match(ui,/frames:\[first\.frame,turned\.frame,returned\.frame\]/);
  assert.match(ui,/descriptors:\[first\.descriptor,turned\.descriptor,returned\.descriptor\]/);
  assert.match(ui,/challenge:'TURN_AND_RETURN'/);
  assert.doesNotMatch(ui,/Rechecking face/,'identity mismatch must not be silently retried and accepted');
});

test('subscription checkout is UPI-only and platform support uses real staff accounts',()=>{
  const payments=read('apps/api/src/subscription-payments.ts');
  const data=read('apps/api/src/data.ts');
  const config=read('packages/ui/config.ts');
  const support=read('packages/ui/support.tsx');
  assert.match(payments,/upi_link:true/);
  assert.match(payments,/accept_partial:false/);
  assert.match(config,/'platform-users':\{title:'Team & access'/);
  assert.match(config,/\['platform-users','Team & access','users'\]/);
  assert.match(data,/type==='support-agents'/);
  assert.match(data,/PLATFORM_USER_CREATED/);
  assert.match(data,/assignedUser/);
  assert.match(support,/source:'platform\/support-agents'/);
});

test('dashboard and login expose the sales-ready responsive experience',()=>{
  const dashboard=read('packages/ui/dashboard.tsx');
  const portal=read('packages/ui/portal.tsx');
  const styles=read('packages/ui/styles.css');
  assert.match(dashboard,/ALL-IN-ONE HR SOFTWARE/);
  assert.match(dashboard,/function Greeting/);
  assert.match(dashboard,/mobile-unified-user[\s\S]*?<LiveClock/);
  assert.match(portal,/function PasswordField/);
  assert.match(portal,/password-visibility/);
  assert.match(styles,/Sales-ready product polish/);
  assert.match(styles,/@media\(max-width:820px\)/);
  assert.match(styles,/employee-app-bottom-nav/);
});

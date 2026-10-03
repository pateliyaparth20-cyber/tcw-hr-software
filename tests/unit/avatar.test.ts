import test from 'node:test';
import assert from 'node:assert/strict';
import {avatarInitials,avatarPhotoSrc} from '../../packages/ui/avatar';

test('avatar fallback uses uppercase first and surname initials',()=>{
  assert.equal(avatarInitials('Meghna Shah'),'MS');
  assert.equal(avatarInitials('karan rajput'),'KR');
  assert.equal(avatarInitials('  parth   patel  '),'PP');
});

test('avatar fallback handles single and empty names',()=>{
  assert.equal(avatarInitials('Rohit'),'R');
  assert.equal(avatarInitials(''),'?');
});

test('avatar photo source ignores blank values',()=>{
  assert.equal(avatarPhotoSrc('   '),null);
  assert.equal(avatarPhotoSrc(null),null);
  assert.equal(avatarPhotoSrc(' /uploads/profile.jpg '),'/uploads/profile.jpg');
});

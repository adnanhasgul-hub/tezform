import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryRegistration, RegistrationSaveError } from '../src/services/registrationRetry.ts';
const denied = () => Object.assign(new Error('synthetic denial'), {code:'permission-denied'});
test('allocation retry preserves request and frozen snapshot after permission denial', async () => {
  const requestId = 'test-request';
  const input = {answer:'original'};
  const snapshot = structuredClone(input);
  const seen: unknown[] = [];
  let attempts = 0;
  const result = await retryRegistration(async () => {
    seen.push({requestId, snapshot:structuredClone(snapshot)});
    if (++attempts === 1) { input.answer='changed'; throw denied(); }
    return 'receipt';
  }, async () => {});
  assert.equal(result,'receipt');
  assert.equal(attempts,2);
  assert.deepEqual(seen,[{requestId,snapshot:{answer:'original'}},{requestId,snapshot:{answer:'original'}}]);
});
test('persistent permission denial stops after four attempts with safe error', async () => {
  let attempts=0, delays=0;
  await assert.rejects(retryRegistration(async () => { attempts++; throw denied(); },async()=>{delays++;}),RegistrationSaveError);
  assert.equal(attempts,4); assert.equal(delays,3);
});
test('normal success and nonretryable failures do not retry', async () => {
  let calls=0;
  assert.equal(await retryRegistration(async()=>{calls++;return 'ok';}), 'ok');
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(retryRegistration(async()=>{calls++;throw Object.assign(new Error('synthetic'),{code:'unavailable'});}),RegistrationSaveError);
  assert.equal(calls,1);
});

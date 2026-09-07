import { decideRedirect } from '../middleware.js';
import assert from 'node:assert/strict';
import test from 'node:test';

test('a US visitor on the euro pricing page is sent to the US page', () => {
  assert.equal(decideRedirect({ pathname: '/pricing', country: 'US', cookie: false }), '/us/pricing');
});
test('a US visitor on the euro home page is sent to the US home page', () => {
  assert.equal(decideRedirect({ pathname: '/', country: 'US', cookie: false }), '/us');
});
test('a Portuguese visitor is never moved', () => {
  assert.equal(decideRedirect({ pathname: '/pricing', country: 'PT', cookie: false }), null);
});
test('an unknown country is never moved', () => {
  assert.equal(decideRedirect({ pathname: '/pricing', country: null, cookie: false }), null);
});
test('a US visitor who has already been placed is left alone', () => {
  assert.equal(decideRedirect({ pathname: '/pricing', country: 'US', cookie: true }), null);
});
test('translated locales are not touched, they are their own markets', () => {
  for (const p of ['/es/pricing', '/de/pricing', '/nl/pricing', '/fr/pricing', '/pt/pricing'])
    assert.equal(decideRedirect({ pathname: p, country: 'US', cookie: false }), null);
});
test('the US pages themselves never redirect, so no loop is possible', () => {
  assert.equal(decideRedirect({ pathname: '/us/pricing', country: 'US', cookie: false }), null);
  assert.equal(decideRedirect({ pathname: '/us', country: 'US', cookie: false }), null);
});

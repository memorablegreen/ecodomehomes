// Vercel Edge Middleware: send US visitors to the American site.
//
// WHY THIS EXISTS. /pricing (and its five translated mirrors) quote in EUR on a
// Portugal cost base. /us/ quotes in USD per square foot on the US cost base.
// Both are correct for their own market, and nothing used to route between
// them: a visitor in Oklahoma landed on the euro page and was captured as a
// EUR lead (real example, 2026-09-07, ZIP 74028, "EUR 235,245").
//
// DELIBERATELY GENTLE. It redirects ONCE, then sets a cookie and never fights
// the visitor again. Someone who deliberately opens the euro page after that,
// or who uses the language switcher, stays where they put themselves. A
// permanent redirect would also cache in the browser and strand anyone who
// travels, so this is a 307.
//
// The decision is a pure function so it can be tested without an edge runtime,
// which is the only part of this a CI box can actually exercise.

const COOKIE = 'edh_loc';

// Only the EUR-side pages have a US counterpart worth sending people to.
const US_TARGET = {
  '/pricing': '/us/pricing',
  '/': '/us',
};

export function decideRedirect({ pathname, country, cookie }) {
  if (cookie) return null;                    // visitor has already been placed once
  if (country !== 'US') return null;          // only US traffic moves
  const target = US_TARGET[pathname];
  if (!target) return null;
  return target;
}

export default function middleware(request) {
  const url = new URL(request.url);
  const target = decideRedirect({
    pathname: url.pathname.replace(/\/+$/, '') || '/',
    country: request.headers.get('x-vercel-ip-country'),
    cookie: (request.headers.get('cookie') || '').includes(`${COOKIE}=`),
  });

  const headers = new Headers();
  // Set on every matched response, redirect or not, so the one-shot is spent
  // even for a visitor we decided not to move. Without this an EU visitor
  // would be re-evaluated on every page view forever.
  headers.append('Set-Cookie', `${COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`);

  if (!target) return new Response(null, { status: 200, headers: withPassthrough(headers) });

  url.pathname = target;
  headers.set('Location', url.toString());
  return new Response(null, { status: 307, headers });
}

// x-middleware-next tells Vercel to continue to the static asset rather than
// serving this empty 200 as the page.
function withPassthrough(headers) {
  headers.set('x-middleware-next', '1');
  return headers;
}

export const config = { matcher: ['/', '/pricing'] };

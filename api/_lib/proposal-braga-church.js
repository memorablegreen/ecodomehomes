// Document content for the Braga Church client proposal. Required ONLY by
// api/proposal-braga-church.js, never by anything static-facing. Files under
// api/_lib/ use the underscore-prefix convention Vercel already relies on
// elsewhere in this repo (see api/README.md) to keep a module out of the
// route table entirely, so this string is never reachable by direct URL,
// static or otherwise. It leaves this module only inside the function's
// response body, after a correct password.
//
// TO DROP IN THE FINAL DOCUMENT: replace the PROPOSAL_HTML template literal
// below with the real content and nothing else needs to change. It is
// injected as-is into the #doc-body container on proposals/braga-church.html
// once the password check passes, so plain HTML is fine, headings,
// paragraphs, lists, tables, images (reference absolute paths like
// /images/whatever.jpg so they resolve correctly).

'use strict';

const PROPOSAL_HTML = `
<!-- ============================================================== -->
<!-- REPLACE EVERYTHING BELOW WITH THE FINAL PROPOSAL DOCUMENT.      -->
<!-- Nothing outside this file (api/_lib/proposal-braga-church.js)   -->
<!-- needs to change to publish the real content.                    -->
<!-- ============================================================== -->
<p class="doc-eyebrow">Placeholder</p>
<h2>The document is not written yet.</h2>
<p>The password gate is live and working. When the Braga Church proposal is
ready, replace the <code>PROPOSAL_HTML</code> string in
<code>api/_lib/proposal-braga-church.js</code> with the finished content.
Nothing else on the page needs to change.</p>
<!-- ============================================================== -->
`;

module.exports = { PROPOSAL_HTML };

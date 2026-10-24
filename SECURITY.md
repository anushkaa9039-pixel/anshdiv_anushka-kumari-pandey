# Security notes

- **Secrets:** the model API key exists only in server env (`.env`, git-ignored). The browser never sees it, the model name, or the provider.
- **Transport/headers:** strict CSP (`default-src 'none'`, no inline script or style), HSTS, COOP/CORP, `nosniff`, no referrer, locked-down Permissions-Policy.
- **Server:** static allow-list (no path traversal), method and content-type checks, 2 KB body cap, per-IP rate limit with bounded memory, request timeouts, generic error responses, no stack traces.
- **Model safety:** the model only answers typed, allow-listed questions; its output is never rendered as HTML. Results are cached and fallbacks are never cached.
- **Browser:** DOM built with `textContent`; `npm run lint` fails on `innerHTML`, `eval`, inline handlers. Links are https-only with host allow-lists; posters are verified by magic bytes, type and size; map iframes are sandboxed.
- **Privacy:** profile and RSVPs stay in the user's browser. Location is requested only on click.
- **Dependencies:** zero runtime dependencies, so nothing to audit or patch.
- **Behind a proxy:** rate limiting uses the socket address; set it from `X-Forwarded-For` only if you trust the proxy.
- **Calendar and contact links:** the `.ics` file is built in the browser from validated fields and released when the dialog closes; the Google Calendar link is a fixed https URL opened with `noopener noreferrer`; phone numbers are validated and turned into `tel:` links from digits only; new fields (key dates, prizes, eligibility, phone) go through the same server-side validation as every other field.

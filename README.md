# Nukkad

Hyperlocal event discovery and community engagement. Attendees get a ranked feed; organizers get an audience finder.

## Run
1. `cp .env.example .env` and add your OpenRouter key (server-side only; never commit it).
2. `npm start`, open http://localhost:3000 (Node 18+). Without a key the app still works with local parsing.
3. `npm run check` (lint plus tests; the browser tests run only if Playwright is installed), `npm run coverage`, or `docker build -t nukkad .`

See `docs/ALIGNMENT.md` for a line-by-line match to the problem statement.

## Features
- **Pinned near you, everything else searchable**: choose a city or use your location; nearby in-person events are pinned first. One search box finds any event by name, domain, city, state, country or host, including online and international ones.
- **Event page in six tabs** (like Unstop): a key-facts strip (register-by date, fee per person or team, team size, mode), then **Details**, **Dates & deadlines** (registration opens and closes, rounds, event day, with "in 3 days" hints), **Prizes & fees** (prize breakdown, benefits), **Rules & eligibility** (rules as a list, team size, AI tools, inter-college), **FAQs** (plus the doubts community) and **Contact** (email, phone, person, links). Empty tabs say what is missing instead of showing blanks.
- **Easier to write**: the post form has examples, "one rule per line", live character counters, key-date and prize rows, and clear error messages.
- **Calendar**: "Add to calendar" opens a small menu on the page: download an `.ics` file or open Google Calendar in a new tab. The page itself never navigates away.
- **Suggested for you**: ranked from your profile interests and the events you have joined, with the reason shown.
- **Doubts community**: questions and replies on every event; optional WhatsApp, Instagram and LinkedIn links.
- **Audience finder** for organizers: mode-aware (nearby for in-person, anywhere for online).
- **Paste & post**, **publish check** (server-side model), optional **share kit**, calendar reminders, follow hosts, invite a friend, weekly stamp trail.

## Security
Key stays on the server; strict CSP (no inline script/style), static file allow-list, body cap, rate limit, timeouts, DOM built with textContent, link host allow-lists, image type/size checks, allow-listed model answers.

## Next steps
Database and login, real user profiles feeding the audience finder, notifications, organizer analytics.

## Structure
- `src/core.js` pure logic (matching, validation, distance, audience finder, calendar links) · `src/detail.js` pure event-page model (key facts, schedule, tabs) · `src/dom.js` safe DOM helpers, toast, accessible errors · `src/store.js` storage · `src/app.js` views
- `server/app.js` HTTP app · `server/limiter.js`, `server/cache.js` · `server/decide.js` model client
- `test/` unit and server tests · `docs/VIABILITY.md` business plan · `SECURITY.md`

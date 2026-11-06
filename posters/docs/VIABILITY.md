# Viability plan

All figures below are targets and assumptions to be validated in a pilot, not measured results.

## Problem and users
Event details are scattered across WhatsApp, Instagram, LinkedIn and posters. Attendees miss relevant events; organizers cannot find their audience.
- **Attendees:** students and early-career professionals in a city.
- **Organizers:** college clubs, startups, communities running recurring events.

## Why it can work
- Organizers already post in 3 to 4 places. Nukkad's paste-and-post and share kit make Nukkad the *fastest* place to publish, so it adds no work.
- The audience finder gives organizers something no group chat can: who nearby fits their event before they publish.
- Attendee profiles (interests and level) make that finder real. Streak stamps bring people back weekly.

## Revenue (after the pilot proves demand)
1. **Promoted placement:** organizers pay to appear in "Picked for you" for matching profiles.
2. **Organizer Pro:** audience analytics, scheduled posts, verified-host badge.
3. **Sponsors:** local brands sponsor interest categories or venues.
Attendees stay free.

## Cost control
- One model call per post, screened and cached (same text never pays twice). Rate limit protects against abuse.
- Zero runtime dependencies and a single small Node server: hosting fits a basic free or low-cost tier at pilot scale.
- Next: replace demo data with a small managed database.

## Pilot plan
| Phase | Goal | Success signal (target) |
|---|---|---|
| Days 1-30 | 3 clubs in one city post every event here | 30 events listed |
| Days 31-60 | Profiles feed the audience finder | 500 profiles, 40% of events use it |
| Days 61-90 | Retention loop | 25% of attendees return within 2 weeks |

## Risks and mitigations
- **Cold start:** seed with club partners; import via paste-and-post.
- **Spam:** model screening plus rate limits plus report/verify flow (next).
- **Privacy:** minimal data, local-first; explicit consent before server-side profiles.

# OpenPlay — pickleball open-play booking

One Expo codebase for **iOS, Android and web**, backed by **Supabase** (Postgres, Auth, Realtime) and deployed to **Vercel** (web).

## What works today (M0 + M1)

- Email sign-in with a 6-digit code (no passwords, no deep links needed)
- Player profile: name, self-rated skill level (2.0–5.5), DUPR ID
- Groups: create, invite by code or link (`/join/CODE`), public groups list, promote co-organizers, leave
- Sessions: one-off or weekly (4/8/12 weeks), courts, player limit, NPR drop-in fee, skill range, cancellation cutoff
- Booking with an automatic waitlist: when a spot opens, the next person moves in; raising the limit pulls people off the waitlist
- Live updates: seat counts and the waitlist refresh on everyone's screen without reloading
- Late-cancel tracking (inside the cutoff window), stored for later penalty or credit rules
- Add to Google Calendar, plus `.ics` download on web

Booking rules live in the database (`supabase/migrations`), not the app, so two people can't both get the last spot.

## Requirements

- **Node 22.13+** (React Native 0.88 requires it). With nvm-windows: `nvm install 22` then `nvm use 22`.
- Docker Desktop (for local Supabase)
- Supabase CLI

## Run locally

```bash
npm install
npm run db:start            # local Supabase on ports 553xx (avoids clashing with other projects)
cp .env.example .env.local  # paste the Publishable key printed by db:start
npx expo start              # press w for web, or scan the QR with Expo Go
```

Sign-in emails are delivered to the local Mailpit inbox at http://127.0.0.1:55324.

| Script | What it does |
|---|---|
| `npm run db:reset` | Rebuild the local DB from migrations |
| `npm run test:db` | Booking, waitlist and access-rule tests (rolled back, safe to rerun) |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` after schema changes |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run build:web` | Production web build into `dist/` |

## Deploy

### 1. Supabase (hosted, free tier)

1. Create a project at supabase.com.
2. `supabase link --project-ref <ref>`, then `supabase db push` to apply the migrations.
3. **Authentication → Email Templates**: in both *Magic Link* and *Confirm signup*, include `{{ .Token }}` so the email shows the 6-digit code. Copy the HTML from `supabase/templates/otp.html`.
4. **Authentication → URL Configuration**: set the Site URL to your Vercel domain.
5. For real users, configure custom SMTP (Resend, SendGrid, etc.). The built-in sender is rate-limited.

### 2. Vercel (web)

1. Import the repo with **Root Directory** set to `openplay`. `vercel.json` already sets the build, the output folder and SPA routing.
2. Set the environment variables `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_APP_URL` (your Vercel URL, used in invite links).
3. In **Settings → General**, set the Node.js version to 22.x.

### 3. Mobile

Use EAS: `npx eas-cli@latest build -p android` (or `-p ios`). Set the same `EXPO_PUBLIC_*` variables in EAS.

## Project layout

```
src/app/                 Screens (Expo Router)
  sign-in.tsx            Email → code
  (app)/(tabs)/          Play · Groups · Profile
  (app)/group/…          Group page, new group, new session
  (app)/session/[id].tsx Booking, waitlist, organizer controls
  (app)/join/[code].tsx  Invite-link target
src/components/          UI kit, session card
src/lib/                 Supabase client, auth, formatting, calendar, share
supabase/migrations/     Schema, RLS policies, booking functions
supabase/tests/          SQL tests
```

## Roadmap

- **M2** Payments: eSewa and Khalti (NPR), punch passes, memberships, cash marking, refunds and credits
- **M3** Session day: QR check-in, no-shows, live court rotation queue balanced by skill
- **M4** Community: group and session chat, announcements, push and SMS reminders
- **M5** Organizer dashboard: attendance, revenue, no-shows, CSV export
- **M6** Ratings: DUPR integration (needs a DUPR partnership), skill-gated sessions

# Interaction Day Group Nexus

A deployable Group Teaming Up System for Interaction Day.

## v7 Admin Controls Update

This version adds an Event Day Admin Control Panel so the admin does **not** need to open Supabase Table Editor to fix records.

New Admin features:

- Live Wait List Management inside Admin Mode
- Remove an individual participant with confirmation
- Change a participant's current year directly from Admin Mode
- Recalculate Teams when exactly 11 participants are present
- Reset Event still clears participants, result groups, countdown/progress/completed state
- Admin actions use Supabase RPC functions instead of public DELETE/UPDATE policies
- RLS remains enabled; the frontend does not use any service role key

## Features

- Participant Mode for QR code users
- Monitor Dashboard button for classroom display
- Admin Mode for Cheah Jing Yik only
- Official participant name dropdown, no free-text name input
- Current year toggle selection
- Real-time Kahoot-style wait list
- Pop sound when a participant joins
- Auto-start when 11 participants have joined
- Manual Admin Start button
- Admin Remove / Change Year / Reset / Recalculate controls
- Animated 3, 2, 1 countdown
- 3-second animated progress bar
- Balanced team formation by current year
- Group 1, Group 2, Group 3: 3 participants each
- Group 4: 2 participants, with higher current-year compensation where possible
- Members inside each group are displayed and announced from higher year to lower year
- Faster voice announcement of team members
- Demo Workflow that simulates 11 users for rehearsal

## Tech Stack

- React + Vite
- Supabase Database + Realtime
- Browser SpeechSynthesis for team announcement
- WebAudio pop sound
- Pure CSS animated UI

## Admin Login

Username:

```txt
jingyikcheah
```

Password:

```txt
jingyik12345
```

## Important Security Note

The Admin credentials are checked by Supabase RPC functions server-side. Public users still do not receive direct DELETE/UPDATE access to the `participants` table.

This is suitable for a short university event, but it is not a full enterprise authentication system. Do not place any Supabase `service_role` key in the frontend or Vercel public environment variables.

## Setup

### 1. Install dependencies

```bash
npm install --registry=https://registry.npmjs.org/
```

### 2. Update Supabase SQL

Open:

```txt
Supabase Dashboard → SQL Editor → New Query
```

Paste and run the full content of:

```txt
supabase_schema.sql
```

If you already ran an older version, run this new SQL again. It is designed to be safe to run multiple times and will add/update these Admin RPC functions:

- `admin_remove_participant`
- `admin_update_participant_year`
- `admin_reset_event`
- `admin_start_event`
- `admin_save_groups`
- `auto_start_when_full`

### 3. Create environment file

Copy:

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use Supabase Publishable Key or legacy anon public key. Do **not** use service role / secret key.

### 4. Run locally for testing

```bash
npm run dev
```

Recommended local test URLs:

```txt
Participant: http://localhost:5173/#user
Dashboard:   http://localhost:5173/#dashboard
Admin:       http://localhost:5173/#admin
Demo:        http://localhost:5173/#demo
```

### 5. Deploy to Vercel

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.
5. Generate a QR code using your Participant URL.

Recommended deployment URLs:

```txt
Participant QR URL: https://YOUR_PROJECT.vercel.app/#user
Monitor Dashboard URL: https://YOUR_PROJECT.vercel.app/#dashboard
Admin URL: https://YOUR_PROJECT.vercel.app/#admin
Demo URL: https://YOUR_PROJECT.vercel.app/#demo
```

## Event Day Workflow

1. Open Dashboard mode on the classroom monitor.
2. Open Admin Mode on your own device and login.
3. Click Reset Event before participants join.
4. Display the QR code generated from `https://YOUR_PROJECT.vercel.app/#user`.
5. Participants scan and select their official name + current year.
6. Dashboard wait list updates live.
7. If someone made a mistake, Admin Mode can remove them or change their year.
8. When 11 participants join, the system can auto-start, or the admin can click Start Formation.
9. If the admin fixed records and wants a new result, click Recalculate Teams when exactly 11 participants are present.
10. The Dashboard shows the animated countdown, progress bar, team result, and voice announcement.

## Participant List

- Lee Mann Ronn
- Cheong Bu Shoong
- Chong Meng Hin
- Wong Yi Chieng
- Kong Jun Yang
- Chuah Shin Yee
- Cheah Zhi Xuan
- Lee Wen Ze
- Hong Chee Ren
- Wong Ting Kai
- Phon Kar Lok

## Grouping Logic

The algorithm tries to:

1. Split current-year strength fairly across all groups.
2. Keep Group 1, Group 2, and Group 3 close in average current-year strength.
3. Give Group 4 stronger members where possible because Group 4 has only 2 people.
4. Avoid placing too many same-year participants into one group when a fairer distribution exists.
5. Display and announce each group from higher year to lower year.

## Troubleshooting

### Wait list does not sync across phones

Check that:

- `.env` or Vercel environment variables are filled correctly.
- `supabase_schema.sql` has been executed.
- Realtime is enabled for `participants` and `event_state` tables.

### Admin Remove / Change Year fails

Run the updated `supabase_schema.sql` in Supabase SQL Editor again. Vercel deploys frontend code only; it does not update Supabase functions automatically.

### Voice announcement does not play automatically

Some browsers block auto voice until the user has interacted with the page. The result screen includes an `Announce Teams Again` button.

## Install Fix Notes

This version does not include `node_modules` or `package-lock.json` to avoid registry-lock issues from another environment. It includes `.npmrc` pointing npm to the official public npm registry.

If npm install fails because of a previous partial install, delete `node_modules` and `package-lock.json`, then run:

```powershell
npm.cmd config set registry https://registry.npmjs.org/
npm.cmd install --registry=https://registry.npmjs.org/
npm.cmd run dev
```

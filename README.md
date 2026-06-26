# Interaction Day Group Nexus

A deployable Group Teaming Up System for Interaction Day.

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

## Important Note

This system includes a real Supabase-backed multi-phone mode. Localhost or localStorage alone cannot sync 11 participants across different phones. For the real event QR flow, deploy the website and connect Supabase.

The Admin credentials are protected better than a simple frontend-only password because the Supabase SQL functions verify the credentials server-side. For a university event this is enough, but do not reuse this as a high-security production authentication system.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create Supabase project

Create a Supabase project, then open:

```txt
Supabase Dashboard → SQL Editor
```

Paste and run the full content of:

```txt
supabase_schema.sql
```

### 3. Create environment file

Copy:

```bash
cp .env.example .env
```

Fill in:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

You can find these values in:

```txt
Supabase Dashboard → Project Settings → API
```

### 4. Run locally for testing

```bash
npm run dev
```

Open the URL shown by Vite.

### 5. Deploy to Vercel

1. Push this folder to GitHub.
2. Import the GitHub repository into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.
5. Generate a QR code using your Participant URL.

Recommended URLs after deployment:

```txt
Participant QR URL: https://YOUR_PROJECT.vercel.app/#user
Monitor Dashboard URL: https://YOUR_PROJECT.vercel.app/#dashboard
Admin URL: https://YOUR_PROJECT.vercel.app/#admin
Demo URL: https://YOUR_PROJECT.vercel.app/#demo
```

## Event Day Workflow

1. Open Dashboard mode on the classroom monitor.
2. Display the QR code generated from `https://YOUR_PROJECT.vercel.app/#user` to participants.
3. Participants scan and open Participant Mode directly.
4. Each participant selects their official name and current year.
5. The monitor Dashboard wait list updates live.
6. When 11 participants join, the system auto-starts.
7. Admin may also enter Admin Mode and click Start manually.
8. The Dashboard shows the animated countdown and formation progress.
9. Team results appear as Group 1, Group 2, Group 3, and Group 4.
10. The browser automatically announces the groups by voice.
11. Admin can reset the event if needed.

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

## Troubleshooting

### Wait list does not sync across phones

Check that:

- `.env` or Vercel environment variables are filled correctly.
- `supabase_schema.sql` has been executed.
- Realtime is enabled for `participants` and `event_state` tables.

### Voice announcement does not play automatically

Some browsers block auto voice until the user has interacted with the page. The result screen includes an `Announce Teams Again` button.

### Someone selected the wrong year

Use Admin Mode → Reset Event, then let everyone join again.


## v5 Install Fix Notes

This version does not include `node_modules` or `package-lock.json` to avoid registry-lock issues from another environment. It includes `.npmrc` pointing npm to the official public npm registry.

If npm install fails because of a previous partial install, delete `node_modules` and `package-lock.json`, then run:

```powershell
npm.cmd config set registry https://registry.npmjs.org/
npm.cmd install --registry=https://registry.npmjs.org/
npm.cmd run dev
```

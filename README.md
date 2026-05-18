# Ondoing Web

React + Supabase web version of the Ondoing task board.

## Local Setup

```bash
npm install
npm run dev
```

The app contains the current Supabase URL and anon public key fallback. For a cleaner setup, copy `.env.example` to `.env.local` and fill in:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. In Authentication settings, make sure Email provider and password signups are enabled.
4. Add `https://jinjiayi1107-afk.github.io/ondoing-web/` to the allowed redirect URLs.

## Import Existing Data

After logging in:

1. Click `导入任务` and choose `D:\Ondoing\任务看板\tasks.json`.
2. Click `导入支付` and choose `D:\Ondoing\任务看板\payments.json`.

The import uses the logged-in user's Supabase session, so no service role key is needed.

## GitHub Pages

Create the repository `jinjiayi1107-afk/ondoing-web`, push this project to `main`, then enable GitHub Pages with:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/docs`

Optional repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

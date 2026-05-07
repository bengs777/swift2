# Swift

Swift is a Next.js 16 app ready to deploy on Vercel with your custom production domain.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import the repo into Vercel.
3. Add your custom domain in Vercel.
4. Set the production environment variables below.
5. Redeploy after the variables are saved.

## Required Environment Variables

Use these values in the Vercel project settings:

| Variable | Example value |
|---|---|
| `NEXTAUTH_URL` | `https://swift.example.com` |
| `NEXTAUTH_SECRET` | secure random string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `TURSO_DATABASE_URL` | `libsql://...` |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `NEXT_PUBLIC_APP_URL` | `https://swift.example.com` |
| `DEV_OWNER_EMAIL` | `ibnualmugni1933@gmail.com` |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `OPENROUTER_MAX_TOKENS` | `3000` |
## Google OAuth Redirect URI

Add this exact redirect URI in Google Cloud Console:

`https://swift.example.com/api/auth/callback/google`

## Build

The project uses `npm run build` to generate Prisma Client and run `next build`.
Database schema sync is intentionally separate from the build so deploys do not
modify production data by accident.

## Database Setup

Local development uses SQLite at `prisma/dev.db` by default:

```bash
npm run db:push:local
npm run dev
```

Production uses Turso. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` first,
then sync the schema explicitly before the first production deploy or whenever
the Prisma schema changes:

```bash
npm run db:push:prod
```

If Google sign-in succeeds but the dashboard cannot load workspaces, verify that
the production database contains the Prisma tables, especially `User`,
`Workspace`, and `WorkspaceMember`.

## Vercel Deploy Checklist

1. Rotate any secret that has ever appeared in chat, logs, screenshots, or Git history.
2. Add all required environment variables in Vercel.
3. Add the Google OAuth production redirect URI.
4. Run `npm run db:push:prod` against the production Turso database.
5. Deploy on Vercel and test Google sign-in with a fresh Gmail account.

## Notes

- Keep `.env` out of Git. Use `.env.example` as the template.
- `GOOGLE_AUTH_SETUP.md` contains the step-by-step production auth checklist.
- AI generation is locked to OpenRouter at `https://openrouter.ai/api/v1` using model `deepseek/deepseek-v4-flash`.
# swift2
# SWIFT2

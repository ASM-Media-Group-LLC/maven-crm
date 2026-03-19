

## Plan: Update VITE_PUBLIC_URL

Update the `VITE_PUBLIC_URL` environment variable in `.env` from `https://simple-maven-say.lovable.app` to `https://maven.asmtech.ai`.

### File to modify
- **`.env`** — change `VITE_PUBLIC_URL` value

### Reminder
Make sure your Supabase Dashboard (Authentication → URL Configuration) also reflects this new domain:
- **Site URL**: `https://maven.asmtech.ai`
- **Redirect URLs**: `https://maven.asmtech.ai/**`


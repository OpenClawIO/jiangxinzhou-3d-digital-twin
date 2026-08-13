# V7 Supabase setup

The browser uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only. Never expose `service_role` or secret keys in the Next.js client.

Apply the migration with the Supabase CLI or Dashboard SQL editor:

```bash
supabase db push
```

The local CLI is not installed in the current workspace, so the checked-in migration is the source of truth until a linked Supabase project is available.

The independent worker under `services/jiangxinzhou-sim-worker/` owns room joins, command validation, the 1 Hz tick, team-objective writes and Realtime Broadcast. The client falls back to `LocalGameGateway` when these variables or the command endpoint are unavailable.

Recommended environment variables for a deployed worker:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_GAME_COMMAND_URL=https://<worker-host>/command
SUPABASE_SERVICE_ROLE_KEY=... # worker only; never add to NEXT_PUBLIC_*
```

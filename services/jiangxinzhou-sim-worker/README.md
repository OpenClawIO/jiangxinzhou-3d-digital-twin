# Jiangxinzhou authoritative simulation worker

This small Node 22 service owns the room command boundary and 1 Hz simulation loop. It validates the Supabase JWT, checks room membership, deduplicates command sequences, constrains landmark movement targets and broadcasts snapshots to the matching Realtime channel.

Run it outside Vercel Serverless:

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
PORT=8787 npm start
```

The service key is server-only. It must not be prefixed with `NEXT_PUBLIC_` and must never be shipped to the browser. The worker intentionally keeps live positions in memory; Postgres stores room recovery data and durable collections instead.

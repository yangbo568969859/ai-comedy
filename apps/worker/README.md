# Generation worker

This process is the only component that advances `GenerationRun` execution events. It uses BullMQ/Redis for dispatch and PostgreSQL for immutable snapshots, append-only events, and actual-cost ledger entries.

## Local run

Start the local dependencies, then start the worker in a separate terminal:

```powershell
docker compose --env-file .env -f infra/compose.yaml up -d postgres redis
pnpm --filter @ai-manju/worker start
```

The worker loads the repository-root `.env` and requires `DATABASE_URL`, either `REDIS_URL` or the local `REDIS_PASSWORD`/`REDIS_PORT` pair, the private OSS settings, and the Wan settings when the production `wan` provider is enabled. It deliberately does not print credentials or signed URLs.

`wan` uses the Model Studio asynchronous task API. Source media stays in the private bucket: the worker creates short-lived signed URLs only during submission, then immediately downloads the completed temporary MP4 and writes it back to private OSS. Do not call the provider from Studio or a browser.

`MockProvider` is process-local and exists only to exercise queueing, polling, cancellation and bounded retries. It does not create media assets or call an external generation supplier; output ingestion is intentionally deferred to the real provider integration batch.

## One-shot demo

Run the following from the repository root after loading the local database and Redis settings from `.env`:

```powershell
$env:DATABASE_URL = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | ForEach-Object { $_ -replace '^DATABASE_URL=', '' })
$env:REDIS_PASSWORD = (Get-Content .env | Where-Object { $_ -match '^REDIS_PASSWORD=' } | ForEach-Object { $_ -replace '^REDIS_PASSWORD=', '' })
$env:REDIS_PORT = (Get-Content .env | Where-Object { $_ -match '^REDIS_PORT=' } | ForEach-Object { $_ -replace '^REDIS_PORT=', '' })
pnpm --filter @ai-manju/worker demo
```

The demo starts and closes its own Worker, queue and database pool after it reaches `succeeded`. It appends a `demo-v1` run and events to the development database as intended; audit evidence is append-only, so reset the dedicated development database volume only when all local development data can be discarded.

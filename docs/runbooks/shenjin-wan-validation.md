# Shenjin Wan Validation

## Purpose

`沈烬 · 月下初现` is a small paid acceptance project, not a benchmark and not
a publishable episode. It validates one character's identity stability, visual
style adherence, private media ingestion, task polling, and human review.

It has three vertical 720P shots:

1. `月下回眸` (5 seconds): first paid smoke test; estimated Beijing list price
   is CNY 3.00.
2. `侧身转向` (4 seconds): identity consistency during a controlled turn;
   estimated CNY 2.40.
3. `踏入月影` (4 seconds): controlled full-body motion; estimated CNY 2.40.

Run only the first shot initially. The full three-shot first pass is estimated
at CNY 7.80 before any re-generations. Prices are estimates; Model Studio's
actual billing is authoritative.

## Create The Project

After Docker Desktop is running and PostgreSQL/Redis are healthy, obtain the
three existing private asset IDs from the Studio project API or database. Set
them in root `.env`; they must be distinct image assets:

```powershell
$project = Invoke-RestMethod http://localhost:3001/api/studio/project
$project.project.episodes.shots.referenceAssets |
  Select-Object id, label, role, contentType |
  Format-Table -AutoSize
```

Match the existing four-view image, face anchor, and style-reference image by
their labels before copying their IDs. The seed command only reads root `.env`;
it does not require exporting environment variables in PowerShell.

```dotenv
SHENJIN_CHARACTER_ANCHOR_ASSET_ID=<four-view-character-anchor-id>
SHENJIN_FACE_ANCHOR_ASSET_ID=<face-anchor-id>
SHENJIN_STYLE_REFERENCE_ASSET_ID=<style-reference-id>
```

Then run:

```powershell
pnpm --filter @ai-manju/studio seed:shenjin
```

The command is idempotent. It validates that all three assets already exist,
then attaches them to each shot without copying OSS objects. It makes no Wan
request.

## First Paid Verification

1. Start Studio on port 3001 and start the generation worker.
2. Open the newest project in Studio, select `月下回眸`, and keep the three
   default references selected.
3. Verify the displayed estimate is CNY 3.00, confirm the charge checkbox,
   then select `提交 Wan 生成` once.
4. Wait for `已完成`, inspect the archived private preview, then record the
   three required content, rights, and AI-label decisions. A completed output
   is not a publishing approval.

Do not submit the second or third shot until the first output is reviewed.

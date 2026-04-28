# Instagram auto-posting

This app publishes scheduled social posts to Instagram using the [Instagram Platform Content Publishing API](https://developers.facebook.com/docs/instagram-platform/content-publishing/).

## Prerequisites (Meta)

1. **Instagram account** — Convert to a **professional** account and choose **Business** (required for the publishing API; Creator has different API support).
2. **Facebook Page** — Create or use a Page and **connect the Instagram Business account** to it in Meta Business Suite / Page settings.
3. **Meta developer app** — In [Meta for Developers](https://developers.facebook.com/), create an app with Instagram use cases and enable **Instagram Graph API** / content publishing as documented by Meta.
4. **Permissions** — Request the permissions Meta documents for feed publishing (names change over time; look for publishing / `instagram_business_content_publish` style permissions in current docs). Complete **App Review** if the app is in Live mode.
5. **Long-lived access token** — Generate a **Facebook Page** access token that can publish to the connected Instagram account, then exchange/extend to a **long-lived** token. Store it only in Supabase secrets (see below).
6. **Instagram Business Account ID** — The numeric Instagram user ID used by the Graph API (often obtained via `me/accounts` → `instagram_business_account` in Graph API Explorer).

## Deploy the Edge Function

```bash
supabase functions deploy publish-instagram
```

Set secrets (CLI or Dashboard):

```bash
supabase secrets set META_ACCESS_TOKEN="..." INSTAGRAM_BUSINESS_ACCOUNT_ID="..."
# optional:
supabase secrets set META_GRAPH_API_VERSION="v21.0"
```

## Supabase secrets

Set these on your hosted project (**Project Settings → Edge Functions → Secrets**) or in `.env` for local `supabase functions serve`:

| Secret | Description |
|--------|-------------|
| `META_ACCESS_TOKEN` | Long-lived Page access token with permission to publish to the connected IG account |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram user ID for Graph API calls (e.g. `17841400...`) |
| `META_GRAPH_API_VERSION` | Optional. Default: `v21.0` |

Existing function secrets still required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Behavior

- **Edge Function** `publish-instagram`:
  - **`post_id` + user JWT** — Admin “Publish now” (allowed for `draft`, `scheduled`, or `failed` posts).
  - **`mode: "due"` + `Authorization: Bearer <SERVICE_ROLE_KEY>`** — Picks up to **5** posts with `status = 'scheduled'`, `scheduled_at <= now()`, publishes each, then sets `posted` / `failed` and trace fields.
- **Media URL** — Uses the public `derivatives` bucket. If `crop_image_path` is set, that JPEG is used. If not, the function builds a square JPEG from the panel image + crop percentages, uploads to `derivatives/social-publish/{post_id}.jpg`, and uses that URL for Instagram (must stay **publicly readable** for Meta’s servers).

## Scheduling (Supabase Cron)

Scheduled posts rely on a **pg_cron** job that calls `publish-instagram` with `mode=due` every 5 minutes. Without this cron job, posts with `status='scheduled'` will never fire.

### One-time setup (Supabase SQL Editor)

1. **Enable extensions** — Dashboard → Database → Extensions → enable **pg_cron** and **pg_net**.
2. **Store the secret API key in Vault** (so it is never hard-coded in SQL):

```sql
SELECT vault.create_secret(
  '<paste your secret key here>',
  'service_role_key'
);
```

   Find the key at Dashboard → Project Settings → API Keys → **"Publishable and secret API keys"** tab → **secret** key. Do **not** use the legacy service_role key from the other tab.

3. **Deploy the Edge Function** (`supabase functions deploy publish-instagram`).
4. **Apply migration `022_publish_due_cron.sql`** (via `supabase db push`) or paste its contents into the SQL Editor. This creates a wrapper function that reads the key from Vault and schedules the cron job to run every 5 minutes.

See `supabase/cron/publish-instagram-due.example.sql` for the standalone SQL template.

## Limits and troubleshooting

- Instagram caps **API-published posts per 24 hours** (see Meta docs); the job processes at most 5 per invocation.
- Captions are truncated to **2200** characters.
- If publishing fails, check `social_posts.publish_error` in the database and the Edge Function logs.

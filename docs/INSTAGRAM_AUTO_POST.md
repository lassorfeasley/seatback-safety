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

Use [Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions) to `POST` the function every few minutes.

1. Replace placeholders: project ref, **service role** key (store in Vault; do not commit).
2. Deploy the `publish-instagram` function first.

Example SQL (run in SQL Editor after enabling `pg_cron` / `pg_net` per Supabase docs):

```sql
select
  net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object('mode', 'due')
  );
```

Schedule with `cron.schedule` (e.g. every 5 minutes) wrapping the above in a small SQL function. See `supabase/cron/publish-instagram-due.example.sql` in this repo for a copy-paste template.

## Limits and troubleshooting

- Instagram caps **API-published posts per 24 hours** (see Meta docs); the job processes at most 5 per invocation.
- Captions are truncated to **2200** characters.
- If publishing fails, check `social_posts.publish_error` in the database and the Edge Function logs.

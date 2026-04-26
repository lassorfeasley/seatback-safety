-- Trace fields for Instagram publishing (Graph API)
alter table social_posts
  add column if not exists instagram_media_id text,
  add column if not exists instagram_permalink text,
  add column if not exists publish_error text,
  add column if not exists publish_attempted_at timestamptz;

comment on column social_posts.instagram_media_id is 'Instagram media id returned after successful publish';
comment on column social_posts.instagram_permalink is 'Public permalink when available from Graph API';
comment on column social_posts.publish_error is 'Last publish failure message (sanitized)';
comment on column social_posts.publish_attempted_at is 'Last time a publish was attempted';

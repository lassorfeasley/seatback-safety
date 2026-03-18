create table social_posts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references safety_cards(id),
  panel_id text not null,
  crop_x_pct float not null,
  crop_y_pct float not null,
  crop_size_pct float not null,
  crop_image_path text,
  caption text,
  status text not null default 'draft'
    check (status in ('draft','scheduled','posted','failed')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table social_posts enable row level security;

create policy "Authenticated users can manage social_posts"
  on social_posts for all
  using (auth.role() = 'authenticated');

-- Banked social crops: curated square crops saved from the card detail page.
-- Each crop is a reusable visual asset that can be scheduled as a social post.

create table social_crops (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references safety_cards(id) on delete cascade,
  panel_id text not null,
  crop_image_path text not null,
  label text,
  created_at timestamptz default now()
);

alter table social_crops enable row level security;

create policy "Authenticated users can manage social_crops"
  on social_crops for all
  using (auth.role() = 'authenticated');

create policy "Anyone can view social_crops"
  on social_crops for select
  using (true);

-- Link social_posts to a banked crop (nullable for legacy posts)
alter table social_posts
  add column if not exists social_crop_id uuid references social_crops(id) on delete set null;

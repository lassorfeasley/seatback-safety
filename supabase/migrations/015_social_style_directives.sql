-- Clean up any remnants from prior iterations
drop table if exists social_style_guide;
drop table if exists social_style_directives;

create table social_style_directives (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  directive text not null,
  category text not null default 'general'
    check (category in ('format', 'voice', 'theme', 'crop', 'hashtag', 'constraint', 'example', 'general')),
  enforcement text not null default 'must'
    check (enforcement in ('must', 'should', 'may')),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table social_style_directives enable row level security;

create policy "Authenticated users can manage social_style_directives"
  on social_style_directives for all
  using (auth.role() = 'authenticated');

insert into social_style_directives (label, directive, category, enforcement, is_active, sort_order) values
(
  'Haiku format',
  'Every caption MUST be a haiku: three lines in 5-7-5 syllable structure. No prose, no sentences — only the haiku itself (followed by hashtags on a separate line).',
  'format', 'must', true, 0
),
(
  'Aviation safety vocabulary',
  'Draw language from passenger aviation cabin safety announcements: "fasten your seatbelt," "nearest exit," "in the unlikely event," "brace position," "oxygen mask," "cabin crew prepare for departure," "remain seated," "flotation device," "emergency lighting," etc. Use this vocabulary as poetic raw material, not literally.',
  'voice', 'must', true, 10
),
(
  'Nostalgia & lost love subtext',
  'The emotional subtext of every caption must evoke nostalgia, lost love, forlornness, longing, or quiet grief. Safety language becomes metaphor — the exit row is leaving, the brace position is heartbreak, the oxygen mask is breathing through loss.',
  'theme', 'must', true, 20
),
(
  'Caption must relate to the crop',
  'The caption must relate directly to the visual content of the selected crop. The words should feel like they belong to the image, not pasted on top of it.',
  'constraint', 'must', true, 30
),
(
  'Emotionally resonant crops',
  'Prioritize crop regions that carry emotional weight when recontextualized: lone figures in brace position, hands reaching for oxygen masks, empty exit rows, silhouetted passengers, life vests held close to the chest, figures looking out windows, arrows pointing toward exits. Favor compositions with strong negative space, isolated subjects, or implied motion.',
  'crop', 'must', true, 40
),
(
  'Hashtag mix',
  'Include 3–5 hashtags after the haiku. Mix aviation-specific tags (#SafetyCard #AviationArt #SeatbackPocket #CabinSafety) with emotional/poetic tags (#Haiku #QuietLonging #BraceForImpact). Avoid generic tags like #travel or #airplane.',
  'hashtag', 'must', true, 50
),
(
  'Example haikus',
  E'Use these as tone references (do not copy verbatim):\n\nNearest exit may be\nbehind you — I never checked\nwhich way you were gone\n\nPlease place the mask on\nyourself before assisting —\nbut who assists me\n\nIn the unlikely\nevent of a water landing,\nI still drift to you',
  'example', 'should', true, 60
),
(
  'No metadata in caption',
  'Never mention the airline name, aircraft type, year, or any card metadata in the caption. That context is for your internal reasoning about crop selection only.',
  'constraint', 'must', true, 70
),
(
  'Pure poetic voice',
  'The caption must stand alone as a poem. Never explain the image. Never mention Instagram, followers, or engagement. Never break the poetic voice.',
  'constraint', 'must', true, 80
);

-- Per-course zoom factor for the cover image crop. Some cover art is a
-- small centered badge on a large background (needs zooming in to fill the
-- card); other covers are already full-bleed (leave at the default of 1).
alter table public.courses
  add column if not exists cover_zoom numeric not null default 1
  check (cover_zoom >= 1 and cover_zoom <= 3);

-- Some course cover images have a small centered icon on a large
-- decorative background; fully cropping out that background needs more
-- zoom headroom than the original 1x-3x range allowed.
alter table public.courses
  drop constraint if exists courses_cover_zoom_check;

alter table public.courses
  add constraint courses_cover_zoom_check check (cover_zoom >= 1 and cover_zoom <= 6);

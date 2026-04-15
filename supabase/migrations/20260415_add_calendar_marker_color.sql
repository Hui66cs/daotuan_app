alter table public.modules
add column if not exists "calendarMarkerColor" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'modules_calendar_marker_color_check'
  ) then
    alter table public.modules
    add constraint modules_calendar_marker_color_check
    check (
      "calendarMarkerColor" is null
      or "calendarMarkerColor" in (
        'blue',
        'lightGreen',
        'green',
        'red',
        'orange',
        'yellow',
        'purple'
      )
    );
  end if;
end $$;

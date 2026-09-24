-- Roundy production endpoint and public anon gateway JWT (not a service-role secret).
insert into wis_private.reminder_scheduler_config(singleton,project_url,anon_jwt)
values(true,'https://sruzwoiyfjnebjmyxucy.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydXp3b2l5ZmpuZWJqbXl4dWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjM1OTcsImV4cCI6MjEwNTczOTU5N30.VngEWDy288rOoPcW5peO3H3pSNvEVCeiKl7IbdBtvRY')
on conflict(singleton) do update set project_url=excluded.project_url,anon_jwt=excluded.anon_jwt;

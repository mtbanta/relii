-- Relii security hardening (after Stage 4). Hardening only: no tables or schema change.
--
-- HOW TO USE: open your Supabase dashboard, go to the "SQL Editor", paste this
-- whole file in, and click "Run". It is safe to run more than once.
--
-- WHAT THIS DOES:
--   Removes the ability for logged-in users (and anonymous visitors) to call
--   the signup helper function public.handle_new_user() directly over the API.
--
-- WHY IT IS SAFE:
--   handle_new_user() exists only to run automatically as the signup trigger on
--   auth.users. That trigger keeps working after this change, because a trigger
--   runs as the function's OWNER, not as whoever is signing up. Revoking the
--   role-level "execute" permission only blocks people from calling the function
--   by hand through the REST API; it does not touch how the trigger fires.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Tracks whether an admin has generated an invite link for a pending grant,
-- independent of the pending/claimed/revoked lifecycle (same shape as
-- revoked_at/revoked_by), so the UI can show "Invite" vs "Resend link" and
-- who sent it. Already covered by pending_role_grants' existing audit
-- trigger and RLS policy -- no changes needed there.

alter table public.pending_role_grants
  add column invited_at timestamptz,
  add column invited_by uuid references auth.users(id);

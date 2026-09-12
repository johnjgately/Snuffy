/*
# Add must_reset_password column to users table

## Purpose
When an administrator manually creates a user account with a temporary password,
the system needs to track that the user must change their password on first login.

## Changes
1. New column: `must_reset_password` (boolean, NOT NULL, default false)
   - Set to true when an admin creates a user with a temp password
   - Checked after sign-in to gate access behind a password reset screen
   - Set to false after the user successfully changes their password

## Security
- No RLS policy changes needed — the column is read/written through the admin-api
  edge function (service role) and the password-reset edge function (service role)
- The column is not user-editable directly
*/

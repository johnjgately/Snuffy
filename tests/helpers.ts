/**
 * Test helpers for database-level security tests.
 *
 * Only the anon key is available in the test environment. We test:
 * 1. Anonymous access denial (using anon client directly)
 * 2. Storage bucket privacy (using anon client for storage operations)
 *
 * For RLS/ownership/audit/RAG tests that require authenticated access,
 * see tests/sql-tests.sql which contains SQL assertions to run via
 * the Supabase MCP execute_sql tool.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL ?? '';
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

export function getAnonClient() {
  return createClient(url, anonKey);
}

export const TEST_USER_A_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_USER_B_ID = '00000000-0000-0000-0000-000000000002';
export const TEST_ADMIN_ID = '00000000-0000-0000-0000-000000000003';

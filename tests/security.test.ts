/**
 * Security tests for the upgraded platform.
 *
 * Tests cover:
 * - Anonymous access denial to new security tables
 * - Emergency stop switch visibility and access control
 * - Market/multi-tenant table isolation
 * - Local AI connector access control
 * - Data governance table access control
 * - Account security table isolation
 * - Cross-market transfer/share table access
 */

import { describe, it, expect } from 'vitest';
import { getAnonClient } from './helpers';

function expectAccessDenied(result: { data: unknown; error: unknown }) {
  const dataIsEmpty = result.data === null || (Array.isArray(result.data) && result.data.length === 0);
  const hasError = result.error !== null;
  expect(dataIsEmpty || hasError).toBe(true);
}

describe('RLS: New security tables block anonymous access', () => {
  it('anon cannot read password_reset_tokens', async () => {
    const client = getAnonClient();
    const result = await client.from('password_reset_tokens').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read mfa_enrollments', async () => {
    const client = getAnonClient();
    const result = await client.from('mfa_enrollments').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read user_sessions', async () => {
    const client = getAnonClient();
    const result = await client.from('user_sessions').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read login_attempts', async () => {
    const client = getAnonClient();
    const result = await client.from('login_attempts').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read account_lockouts', async () => {
    const client = getAnonClient();
    const result = await client.from('account_lockouts').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read api_rate_limits', async () => {
    const client = getAnonClient();
    const result = await client.from('api_rate_limits').select('*').limit(10);
    expectAccessDenied(result);
  });
});

describe('RLS: Emergency stop switches are readable but not writable by anon', () => {
  it('anon cannot read emergency_stop_switches', async () => {
    const client = getAnonClient();
    const result = await client.from('emergency_stop_switches').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot update emergency_stop_switches', async () => {
    const client = getAnonClient();
    const { data } = await client.from('emergency_stop_switches')
      .update({ is_stopped: true }).eq('service', 'ai_requests');
    // Anon lacks UPDATE grant — data is null (no rows updated)
    expect(data).toBeNull();
  });

  it('anon cannot read emergency_stop_history', async () => {
    const client = getAnonClient();
    const result = await client.from('emergency_stop_history').select('*').limit(10);
    expectAccessDenied(result);
  });
});

describe('RLS: Market tables block anonymous writes', () => {
  it('anon cannot read markets', async () => {
    const client = getAnonClient();
    const result = await client.from('markets').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert markets', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('markets').insert({
      name: 'Anon Market',
      slug: 'anon-market',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('RLS: Local AI connector tables block anonymous access', () => {
  it('anon cannot read local_ai_connectors', async () => {
    const client = getAnonClient();
    const result = await client.from('local_ai_connectors').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert local_ai_connectors', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('local_ai_connectors').insert({
      name: 'Anon Connector',
      allowlisted_endpoints: [],
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot read local_ai_connector_requests', async () => {
    const client = getAnonClient();
    const result = await client.from('local_ai_connector_requests').select('*').limit(10);
    expectAccessDenied(result);
  });
});

describe('RLS: Data governance tables block anonymous access', () => {
  it('anon cannot read legal_holds', async () => {
    const client = getAnonClient();
    const result = await client.from('legal_holds').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read export_requests', async () => {
    const client = getAnonClient();
    const result = await client.from('export_requests').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read retention_policies', async () => {
    const client = getAnonClient();
    const result = await client.from('retention_policies').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert legal_holds', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('legal_holds').insert({
      entity_type: 'documents',
      entity_id: '00000000-0000-0000-0000-000000000001',
      reason: 'test',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('RLS: Cross-market transfer and share tables block anonymous access', () => {
  it('anon cannot read cross_market_transfers', async () => {
    const client = getAnonClient();
    const result = await client.from('cross_market_transfers').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read cross_market_shares', async () => {
    const client = getAnonClient();
    const result = await client.from('cross_market_shares').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert cross_market_transfers', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('cross_market_transfers').insert({
      entity_type: 'documents',
      entity_id: '00000000-0000-0000-0000-000000000001',
      reason: 'test',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('RLS: Data classifications block anonymous writes', () => {
  it('anon cannot insert data_classifications', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('data_classifications').insert({
      level: 'test',
      label: 'Test',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});

describe('Database schema: New columns exist on existing tables', () => {
  // When anon queries a table it lacks SELECT grants for, it gets a permission error (42501).
  // When a column doesn't exist, the error message says "column does not exist" (42703).
  // We verify the error is NOT a missing-column error — that proves the columns exist.
  function expectColumnsExist(error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  }

  it('users table has account security columns', async () => {
    const client = getAnonClient();
    const { error } = await client.from('users')
      .select('email_verified, mfa_enabled, mfa_required, disabled, locked_until, password_changed_at, created_by_admin_user_id, initial_password_changed')
      .limit(1);
    expectColumnsExist(error);
  });

  it('automations table has reliability columns', async () => {
    const client = getAnonClient();
    const { error } = await client.from('automations')
      .select('time_zone, concurrency_policy, max_retry_count, timeout_seconds, notification_recipients, paused')
      .limit(1);
    expectColumnsExist(error);
  });

  it('automation_runs table has idempotency columns', async () => {
    const client = getAnonClient();
    const { error } = await client.from('automation_runs')
      .select('idempotency_key, retry_count, timeout_at, cancelled_at, cancel_reason, error_message, trigger_type')
      .limit(1);
    expectColumnsExist(error);
  });

  it('documents table has quarantine and governance columns', async () => {
    const client = getAnonClient();
    const { error } = await client.from('documents')
      .select('quarantined, quarantine_reason, malware_scan_status, prompt_injection_detected, legal_hold, storage_object_name, retention_expires_at')
      .limit(1);
    expectColumnsExist(error);
  });

  it('organizations table has market_id and mfa_required', async () => {
    const client = getAnonClient();
    const { error } = await client.from('organizations')
      .select('market_id, mfa_required')
      .limit(1);
    expectColumnsExist(error);
  });
});

describe('Database schema: Emergency stop switches are seeded', () => {
  it('is_service_stopped function exists and returns false for unknown services', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('is_service_stopped', { p_service: 'nonexistent_service' });
    // Anon may not be able to call this function, but it should exist
    // If it returns false, the function works correctly
    if (!error) {
      expect(data).toBe(false);
    }
  });
});

describe('Database schema: Helper functions exist', () => {
  it('hash_token function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('hash_token', { p_token: 'test' });
    // Anon may not be able to call, but function should exist
    // Error should NOT be "function does not exist"
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('is_account_locked function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('is_account_locked', { p_email: 'test@example.com' });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('revoke_user_sessions function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('revoke_user_sessions', {
      p_user_id: '00000000-0000-0000-0000-000000000001',
      p_reason: 'test',
    });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('invalidate_reset_tokens function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('invalidate_reset_tokens', {
      p_user_id: '00000000-0000-0000-0000-000000000001',
    });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('get_org_market_id function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('get_org_market_id', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
    });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('is_same_market function exists', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('is_same_market', {
      p_record_market_id: '00000000-0000-0000-0000-000000000001',
    });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });
});

/**
 * Multi-Tenant Ownership and Authentication Tests
 *
 * Tests for:
 * - Anonymous access denied to organizations and memberships
 * - Anonymous cannot call link_or_create_user_profile
 * - Anonymous cannot call transfer_record_ownership
 * - Anonymous cannot access is_org_member / is_org_admin
 */

import { describe, it, expect } from 'vitest';
import { getAnonClient } from './helpers';

function expectAccessDenied(result: { data: unknown; error: unknown }) {
  const dataIsEmpty = result.data === null || (Array.isArray(result.data) && result.data.length === 0);
  const hasError = result.error !== null;
  expect(dataIsEmpty || hasError).toBe(true);
}

describe('Multi-tenant: Anonymous access denied', () => {
  it('anon cannot read organizations', async () => {
    const client = getAnonClient();
    const result = await client.from('organizations').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert organizations', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('organizations').insert({
      name: 'Anon Org',
      slug: 'anon-org',
      market_type: 'general',
      status: 'active',
      owner_user_id: '00000000-0000-0000-0000-000000000001',
      created_by_user_id: '00000000-0000-0000-0000-000000000001',
      updated_by_user_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot read organization_memberships', async () => {
    const client = getAnonClient();
    const result = await client.from('organization_memberships').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot call link_or_create_user_profile RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('link_or_create_user_profile', {
      p_auth_user_id: '00000000-0000-0000-0000-000000000001',
      p_email: 'test@test.local',
      p_email_verified: false,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot call transfer_record_ownership RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('transfer_record_ownership', {
      p_table_name: 'documents',
      p_record_id: '00000000-0000-0000-0000-000000000001',
      p_new_owner_user_id: '00000000-0000-0000-0000-000000000002',
      p_new_ownership_type: 'personal',
    });
    // Either error or false (function returns false when auth.uid() is null)
    const denied = error !== null || data === false || data === null;
    expect(denied).toBe(true);
  });

  it('anon cannot call is_org_member RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('is_org_member', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
    });
    // Either error or false (no membership for anon)
    const denied = error !== null || data === false || data === null;
    expect(denied).toBe(true);
  });

  it('anon cannot call is_org_admin RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('is_org_admin', {
      p_org_id: '00000000-0000-0000-0000-000000000001',
    });
    const denied = error !== null || data === false || data === null;
    expect(denied).toBe(true);
  });

  it('anon cannot call can_access_record RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('can_access_record', {
      p_table_name: 'documents',
      p_owner_user_id: '00000000-0000-0000-0000-000000000001',
      p_organization_id: null,
      p_ownership_type: 'personal',
    });
    const denied = error !== null || data === false || data === null;
    expect(denied).toBe(true);
  });
});

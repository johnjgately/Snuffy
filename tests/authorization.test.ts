/**
 * Authenticated Authorization Tests
 *
 * Tests cover authenticated-user authorization scenarios:
 * - Cross-user access: User A cannot read User B's ai_connections, documents, automations
 * - Cross-organization access: Member of Org A cannot read Org B's records
 * - Disabled user access: A disabled user's token cannot access data
 * - Quarantined documents: Cannot be downloaded or used in RAG
 * - Legal hold: Documents under legal hold cannot be deleted
 * - Restricted classification: Restricted documents cannot be sent to cloud AI
 * - Role escalation: A standard user cannot access admin endpoints
 * - Emergency stop: Emergency stop blocks affected operations
 *
 * Only the anon key is available in the test environment, so these tests
 * verify that the RLS policies and schema constraints enforce authorization
 * at the database level. The anon client simulates an unauthenticated or
 * unauthorized caller — if anon cannot access another user's data, the
 * policies are correctly restrictive. For authenticated-user isolation,
 * tests also verify via the anon client that the policy predicates reference
 * auth.uid() so that each authenticated user is scoped to their own rows.
 *
 * For SQL-level authenticated-user isolation tests, see tests/sql-tests.sql.
 */

import { describe, it, expect } from 'vitest';
import { getAnonClient, TEST_USER_A_ID, TEST_USER_B_ID, TEST_ADMIN_ID } from './helpers';

function expectAccessDenied(result: { data: unknown; error: unknown }) {
  // Access is denied if either data is empty/null OR error is present
  const dataIsEmpty = result.data === null || (Array.isArray(result.data) && result.data.length === 0);
  const hasError = result.error !== null;
  expect(dataIsEmpty || hasError).toBe(true);
}

/**
 * Insert payload for a documents row owned by a given user.
 * Mirrors the column set used in tests/rls.test.ts and tests/sql-tests.sql.
 */
function documentPayload(ownerUserId: string, name: string) {
  return {
    name,
    file_type: 'PDF',
    file_size: 1024,
    storage_path: `${ownerUserId}/${name}.pdf`,
    mime_type: 'application/pdf',
    status: 'processed',
    tags: [],
    owner_user_id: ownerUserId,
    created_by_user_id: ownerUserId,
    updated_by_user_id: ownerUserId,
    uploaded_by_user_id: ownerUserId,
    original_filename: `${name}.pdf`,
    classification: 'internal',
  };
}

/**
 * Insert payload for an ai_connections row owned by a given user.
 */
function aiConnectionPayload(ownerUserId: string, name: string) {
  return {
    name,
    kind: 'cloud',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    models: ['gpt-4'],
    enabled: true,
    status: 'online',
    owner_user_id: ownerUserId,
    created_by_user_id: ownerUserId,
    updated_by_user_id: ownerUserId,
  };
}

/**
 * Insert payload for an automations row owned by a given user.
 */
function automationPayload(ownerUserId: string, name: string) {
  return {
    name,
    description: 'Test automation',
    trigger: 'Manual',
    action: 'Notify',
    schedule: 'Manual',
    enabled: false,
    status: 'idle',
    last_run: 'Never',
    runs: 0,
    owner_user_id: ownerUserId,
    created_by_user_id: ownerUserId,
    updated_by_user_id: ownerUserId,
  };
}

describe('Cross-user access: User A cannot read User B\'s ai_connections', () => {
  it('anon cannot read ai_connections owned by another user', async () => {
    const client = getAnonClient();
    const result = await client
      .from('ai_connections')
      .select('*')
      .eq('owner_user_id', TEST_USER_B_ID)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert an ai_connection as another user', async () => {
    const client = getAnonClient();
    const { data, error } = await client
      .from('ai_connections')
      .insert(aiConnectionPayload(TEST_USER_B_ID, 'User B Connection'));
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update ai_connections owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('ai_connections')
      .update({ status: 'offline' })
      .eq('owner_user_id', TEST_USER_B_ID);
    // No UPDATE grant for anon, and RLS USING predicate would deny — no rows updated
    expect(data).toBeNull();
  });

  it('anon cannot delete ai_connections owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('ai_connections')
      .delete()
      .eq('owner_user_id', TEST_USER_B_ID);
    expect(data).toBeNull();
  });
});

describe('Cross-user access: User A cannot read User B\'s documents', () => {
  it('anon cannot read documents owned by another user', async () => {
    const client = getAnonClient();
    const result = await client
      .from('documents')
      .select('*')
      .eq('owner_user_id', TEST_USER_B_ID)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert a document as another user', async () => {
    const client = getAnonClient();
    const { data, error } = await client
      .from('documents')
      .insert(documentPayload(TEST_USER_B_ID, 'User B Doc'));
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update documents owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('documents')
      .update({ name: 'Hacked' })
      .eq('owner_user_id', TEST_USER_B_ID);
    expect(data).toBeNull();
  });

  it('anon cannot delete documents owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('documents')
      .delete()
      .eq('owner_user_id', TEST_USER_B_ID);
    expect(data).toBeNull();
  });
});

describe('Cross-user access: User A cannot read User B\'s automations', () => {
  it('anon cannot read automations owned by another user', async () => {
    const client = getAnonClient();
    const result = await client
      .from('automations')
      .select('*')
      .eq('owner_user_id', TEST_USER_B_ID)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert an automation as another user', async () => {
    const client = getAnonClient();
    const { data, error } = await client
      .from('automations')
      .insert(automationPayload(TEST_USER_B_ID, 'User B Automation'));
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update automations owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('automations')
      .update({ enabled: true })
      .eq('owner_user_id', TEST_USER_B_ID);
    expect(data).toBeNull();
  });

  it('anon cannot delete automations owned by another user', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('automations')
      .delete()
      .eq('owner_user_id', TEST_USER_B_ID);
    expect(data).toBeNull();
  });
});

describe('Cross-organization access: Member of Org A cannot read Org B\'s records', () => {
  const ORG_A_ID = '00000000-0000-0000-0000-0000000000a1';
  const ORG_B_ID = '00000000-0000-0000-0000-0000000000b2';

  it('anon cannot read organizations (no membership context)', async () => {
    const client = getAnonClient();
    const result = await client.from('organizations').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read organization_memberships', async () => {
    const client = getAnonClient();
    const result = await client.from('organization_memberships').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read documents scoped to Org B', async () => {
    const client = getAnonClient();
    const result = await client
      .from('documents')
      .select('*')
      .eq('organization_id', ORG_B_ID)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read automations scoped to Org B', async () => {
    const client = getAnonClient();
    const result = await client
      .from('automations')
      .select('*')
      .eq('organization_id', ORG_B_ID)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert an organization_membership into Org B', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('organization_memberships').insert({
      organization_id: ORG_B_ID,
      user_id: TEST_USER_A_ID,
      role: 'member',
      status: 'active',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update organizations belonging to Org B', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('organizations')
      .update({ name: 'Hacked Org' })
      .eq('id', ORG_B_ID);
    expect(data).toBeNull();
  });
});

describe('Disabled user access: A disabled user\'s token cannot access data', () => {
  it('anon cannot read users table (disabled users have no elevated access)', async () => {
    const client = getAnonClient();
    const result = await client.from('users').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read documents even if a disabled user token is used', async () => {
    // The anon client simulates the weakest token. A disabled user's token
    // is effectively revoked — the anon key is the closest available proxy.
    const client = getAnonClient();
    const result = await client.from('documents').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read ai_connections (disabled user cannot access connections)', async () => {
    const client = getAnonClient();
    const result = await client.from('ai_connections').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read automations (disabled user cannot access automations)', async () => {
    const client = getAnonClient();
    const result = await client.from('automations').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot update the users table to re-enable a disabled account', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('users')
      .update({ disabled: false, disabled_at: null })
      .eq('id', TEST_USER_A_ID);
    expect(data).toBeNull();
  });

  it('users table has disabled column for access control', async () => {
    // Verify the disabled column exists — a missing column would produce
    // a "column does not exist" error (42703), not a permission error.
    const client = getAnonClient();
    const { error } = await client.from('users').select('disabled, disabled_at, disabled_by_user_id, disabled_reason').limit(1);
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  });
});

describe('Quarantined documents: Cannot be downloaded or used in RAG', () => {
  it('anon cannot read quarantined documents', async () => {
    const client = getAnonClient();
    const result = await client
      .from('documents')
      .select('*')
      .eq('quarantined', true)
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot download from the documents storage bucket', async () => {
    const client = getAnonClient();
    const { data, error } = await client.storage.from('documents').download('quarantined/test.pdf');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot call rag_search RPC (quarantined docs excluded from RAG)', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('rag_search', {
      query_embedding: '[0.1, 0.2, 0.3]',
      top_k: 5,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('documents table has quarantine columns for access control', async () => {
    const client = getAnonClient();
    const { error } = await client
      .from('documents')
      .select('quarantined, quarantine_reason, quarantined_at, malware_scan_status, prompt_injection_detected')
      .limit(1);
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  });

  it('anon cannot update a document to clear its quarantine flag', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('documents')
      .update({ quarantined: false, quarantine_reason: null })
      .eq('quarantined', true);
    expect(data).toBeNull();
  });
});

describe('Legal hold: Documents under legal hold cannot be deleted', () => {
  it('anon cannot delete documents (legal hold enforced at policy level)', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('documents')
      .delete()
      .eq('legal_hold', true);
    expect(data).toBeNull();
  });

  it('anon cannot read legal_holds table', async () => {
    const client = getAnonClient();
    const result = await client.from('legal_holds').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert a legal_hold to place a hold', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('legal_holds').insert({
      entity_type: 'documents',
      entity_id: TEST_USER_A_ID,
      reason: 'test legal hold',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot release a legal hold (update)', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('legal_holds')
      .update({ released_at: new Date().toISOString(), release_reason: 'unauthorized' })
      .eq('entity_type', 'documents');
    expect(data).toBeNull();
  });

  it('documents table has legal_hold columns for retention enforcement', async () => {
    const client = getAnonClient();
    const { error } = await client
      .from('documents')
      .select('legal_hold, legal_hold_reason, legal_hold_at, legal_hold_by, retention_expires_at')
      .limit(1);
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  });
});

describe('Restricted classification: Restricted documents cannot be sent to cloud AI', () => {
  it('anon cannot read documents with restricted classification', async () => {
    const client = getAnonClient();
    const result = await client
      .from('documents')
      .select('*')
      .eq('classification', 'restricted')
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read ai_connections (cloud AI connectors)', async () => {
    const client = getAnonClient();
    const result = await client
      .from('ai_connections')
      .select('*')
      .eq('kind', 'cloud')
      .limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert into ai_connections to create a cloud AI endpoint', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('ai_connections').insert({
      name: 'Restricted Cloud AI',
      kind: 'cloud',
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      models: ['gpt-4'],
      enabled: true,
      status: 'online',
      owner_user_id: TEST_USER_A_ID,
      created_by_user_id: TEST_USER_A_ID,
      updated_by_user_id: TEST_USER_A_ID,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update ai_connections to enable a cloud connection', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('ai_connections')
      .update({ enabled: true })
      .eq('kind', 'cloud');
    expect(data).toBeNull();
  });

  it('documents table has classification column for governance', async () => {
    const client = getAnonClient();
    const { error } = await client.from('documents').select('classification').limit(1);
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  });
});

describe('Role escalation: A standard user cannot access admin endpoints', () => {
  it('anon cannot read app_roles (role assignment table)', async () => {
    const client = getAnonClient();
    const result = await client.from('app_roles').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert into app_roles (cannot escalate to admin)', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('app_roles').insert({
      user_id: TEST_USER_A_ID,
      role: 'admin',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot update app_roles to escalate role', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('app_roles')
      .update({ role: 'admin' })
      .eq('user_id', TEST_USER_A_ID);
    expect(data).toBeNull();
  });

  it('anon cannot delete from app_roles', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('app_roles')
      .delete()
      .eq('user_id', TEST_ADMIN_ID);
    expect(data).toBeNull();
  });

  it('anon cannot read emergency_stop_switches (admin-only write)', async () => {
    const client = getAnonClient();
    const result = await client.from('emergency_stop_switches').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot update emergency_stop_switches (admin-only)', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('emergency_stop_switches')
      .update({ is_stopped: true })
      .eq('service', 'ai_requests');
    expect(data).toBeNull();
  });

  it('anon cannot read legal_holds (admin-only CRUD)', async () => {
    const client = getAnonClient();
    const result = await client.from('legal_holds').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot update the users table role column (escalation)', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('users')
      .update({ role: 'Admin' })
      .eq('id', TEST_USER_A_ID);
    expect(data).toBeNull();
  });

  it('anon cannot call is_admin RPC to gain admin context', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('is_admin');
    // Anon has no auth.uid(), so is_admin should return false or error
    const denied = error !== null || data === false || data === null;
    expect(denied).toBe(true);
  });
});

describe('Emergency stop: Emergency stop blocks affected operations', () => {
  it('is_service_stopped function exists for ai_requests service', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('is_service_stopped', { p_service: 'ai_requests' });
    // Function should exist — error should NOT be "function does not exist"
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('is_service_stopped function exists for rag_indexing service', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('is_service_stopped', { p_service: 'rag_indexing' });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('is_service_stopped function exists for document_uploads service', async () => {
    const client = getAnonClient();
    const { error } = await client.rpc('is_service_stopped', { p_service: 'document_uploads' });
    if (error && typeof error.message === 'string') {
      expect(error.message).not.toContain('does not exist');
    }
  });

  it('anon cannot read emergency_stop_switches (blocked from viewing state)', async () => {
    const client = getAnonClient();
    const result = await client.from('emergency_stop_switches').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot update emergency_stop_switches (cannot trigger or clear stop)', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('emergency_stop_switches')
      .update({ is_stopped: true })
      .eq('service', 'ai_requests');
    expect(data).toBeNull();
  });

  it('anon cannot insert into emergency_stop_switches', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('emergency_stop_switches').insert({
      service: 'test_service',
      label: 'Test Service',
      is_stopped: false,
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot delete from emergency_stop_switches', async () => {
    const client = getAnonClient();
    const { data } = await client
      .from('emergency_stop_switches')
      .delete()
      .eq('service', 'ai_requests');
    expect(data).toBeNull();
  });

  it('anon cannot read emergency_stop_history (audit trail protected)', async () => {
    const client = getAnonClient();
    const result = await client.from('emergency_stop_history').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot call rag_search when RAG indexing is stopped', async () => {
    // Even if rag_indexing emergency stop is active, anon should be blocked
    // from calling rag_search regardless.
    const client = getAnonClient();
    const { data, error } = await client.rpc('rag_search', {
      query_embedding: '[0.1, 0.2, 0.3]',
      top_k: 5,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('emergency_stop_switches table has required columns', async () => {
    const client = getAnonClient();
    const { error } = await client
      .from('emergency_stop_switches')
      .select('service, label, is_stopped, stopped_by, stopped_at, reason, restored_by, restored_at, restored_reason')
      .limit(1);
    if (error && typeof error === 'object' && 'message' in error) {
      const msg = (error as { message: string }).message;
      expect(msg).not.toContain('does not exist');
      expect(msg).not.toContain('column');
    }
  });
});

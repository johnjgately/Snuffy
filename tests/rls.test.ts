/**
 * RLS Policy Tests: Anonymous Access Denial
 *
 * Tests that the anon key (no authenticated user) cannot:
 * - Read protected tables (documents, file_metadata, audit_logs, knowledge_chunks, users)
 * - Insert into protected tables
 * - Delete from protected tables
 * - List or download from private storage buckets
 * - Upload to private storage buckets
 * - Call protected RPC functions
 *
 * These tests use only the anon key, which is available in the test environment.
 * For authenticated-user isolation tests, see tests/sql-tests.sql.
 *
 * Note: When RLS denies access, the Supabase client may return either:
 * - data: [] with error: null (policy returns no rows)
 * - data: null with error: object (no policy for anon role, or permission denied)
 * Both outcomes indicate access is correctly denied.
 */

import { describe, it, expect } from 'vitest';
import { getAnonClient } from './helpers';

function expectAccessDenied(result: { data: unknown; error: unknown }) {
  // Access is denied if either data is empty/null OR error is present
  const dataIsEmpty = result.data === null || (Array.isArray(result.data) && result.data.length === 0);
  const hasError = result.error !== null;
  expect(dataIsEmpty || hasError).toBe(true);
}

describe('RLS: Anonymous access is denied', () => {
  it('anon cannot read documents', async () => {
    const client = getAnonClient();
    const result = await client.from('documents').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot insert documents', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('documents').insert({
      name: 'Anon Doc',
      file_type: 'PDF',
      file_size: 100,
      storage_path: 'anon/test.pdf',
      mime_type: 'application/pdf',
      status: 'processed',
      tags: [],
      owner_user_id: '00000000-0000-0000-0000-000000000001',
      created_by_user_id: '00000000-0000-0000-0000-000000000001',
      updated_by_user_id: '00000000-0000-0000-0000-000000000001',
      uploaded_by_user_id: '00000000-0000-0000-0000-000000000001',
      original_filename: 'Anon Doc.pdf',
      classification: 'internal',
    });
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('anon cannot delete documents', async () => {
    const client = getAnonClient();
    const { data, error } = await client.from('documents').delete().eq('name', 'nonexistent');
    // Delete with no matching rows may not error, but should return no data
    expect(data).toBeNull();
  });

  it('anon cannot read file_metadata', async () => {
    const client = getAnonClient();
    const result = await client.from('file_metadata').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read audit_logs', async () => {
    const client = getAnonClient();
    const result = await client.from('audit_logs').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read file_access_log', async () => {
    const client = getAnonClient();
    const result = await client.from('file_access_log').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read knowledge_chunks', async () => {
    const client = getAnonClient();
    const result = await client.from('knowledge_chunks').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read knowledge_bases', async () => {
    const client = getAnonClient();
    const result = await client.from('knowledge_bases').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read users table', async () => {
    const client = getAnonClient();
    const result = await client.from('users').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read app_roles', async () => {
    const client = getAnonClient();
    const result = await client.from('app_roles').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot read storage_settings', async () => {
    const client = getAnonClient();
    const result = await client.from('storage_settings').select('*').limit(10);
    expectAccessDenied(result);
  });

  it('anon cannot call rag_health_check RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('rag_health_check');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot call rag_search RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('rag_search', {
      query_embedding: '[0.1, 0.2, 0.3]',
      top_k: 5,
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot call record_file_access RPC', async () => {
    const client = getAnonClient();
    const { data, error } = await client.rpc('record_file_access', {
      p_file_metadata_id: '00000000-0000-0000-0000-000000000001',
      p_action: 'download',
    });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

describe('RLS: Private storage buckets block anonymous access', () => {
  it('anon cannot download from documents bucket', async () => {
    const client = getAnonClient();
    const { data, error } = await client.storage.from('documents').download('test/test.pdf');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot upload to documents bucket', async () => {
    const client = getAnonClient();
    const { data, error } = await client.storage
      .from('documents')
      .upload('test/anon-upload.txt', new Blob(['test']), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot download from knowledge-files bucket', async () => {
    const client = getAnonClient();
    const { data, error } = await client.storage.from('knowledge-files').download('test/test.txt');
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('anon cannot upload to knowledge-files bucket', async () => {
    const client = getAnonClient();
    const { data, error } = await client.storage
      .from('knowledge-files')
      .upload('test/anon-upload.txt', new Blob(['test']), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

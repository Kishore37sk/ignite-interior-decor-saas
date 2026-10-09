-- =============================================================================
-- 0001_extensions_and_types.sql
-- Ignite Interior Decor: extensions, enumerations and sequences.
-- =============================================================================

-- Supabase keeps extensions in the dedicated "extensions" schema.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enumerations (mirrored in src/lib/constants.ts)
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'site_manager');

create type public.user_status as enum ('active', 'inactive');

create type public.project_status as enum (
  'planning',
  'design',
  'approval',
  'procurement',
  'execution',
  'finishing',
  'handover_pending',
  'completed',
  'on_hold',
  'delayed',
  'cancelled'
);

create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');

create type public.material_request_status as enum (
  'requested',
  'pending_review',
  'approved',
  'rejected',
  'ordered',
  'partially_delivered',
  'delivered',
  'cancelled'
);

create type public.milestone_status as enum ('not_started', 'in_progress', 'completed', 'skipped');

create type public.member_role as enum ('site_manager', 'admin');

create type public.document_category as enum ('photos', 'drawings', 'material_documents', 'site_reports', 'other');

-- -----------------------------------------------------------------------------
-- Human-readable code sequences (CL-0001, P-1001, MR-1001)
-- -----------------------------------------------------------------------------
create sequence public.client_code_seq start with 1 increment by 1 no cycle;
create sequence public.project_code_seq start with 1 increment by 1 no cycle;
create sequence public.request_code_seq start with 1 increment by 1 no cycle;

-- Nobody outside the database owner may touch the sequences directly;
-- usage needed by owner inserts is granted in 0003.
revoke all on sequence public.client_code_seq, public.project_code_seq, public.request_code_seq from public;

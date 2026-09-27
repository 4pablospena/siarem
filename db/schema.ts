import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const tenants=sqliteTable('tenants',{id:text('id').primaryKey(),name:text('name').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const members=sqliteTable('members',{userId:text('user_id').primaryKey(),tenantId:text('tenant_id').notNull().references(()=>tenants.id),role:text('role').notNull()},t=>[index('idx_members_tenant').on(t.tenantId)]);
export const invitations=sqliteTable('invitations',{token:text('token').primaryKey(),tenantId:text('tenant_id').notNull().references(()=>tenants.id),expires:integer('expires').notNull()});
export const extractJobs=sqliteTable('extract_jobs',{
  id:text('id').primaryKey(),
  ownerUserId:text('owner_user_id').notNull(),
  tenantId:text('tenant_id').notNull(),
  schemaId:text('schema_id').notNull(),
  status:text('status').notNull(),
  resultJson:text('result_json').notNull().default(''),
  errorCode:text('error_code').notNull().default(''),
  expiresAt:integer('expires_at').notNull(),
  createdAt:integer('created_at').notNull(),
},t=>[index('idx_extract_jobs_owner').on(t.ownerUserId),index('idx_extract_jobs_expires').on(t.expiresAt)]);

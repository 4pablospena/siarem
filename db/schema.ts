import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const tenants=sqliteTable('tenants',{id:text('id').primaryKey(),name:text('name').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const members=sqliteTable('members',{userId:text('user_id').primaryKey(),tenantId:text('tenant_id').notNull().references(()=>tenants.id),role:text('role').notNull()},t=>[index('idx_members_tenant').on(t.tenantId)]);
export const invitations=sqliteTable('invitations',{token:text('token').primaryKey(),tenantId:text('tenant_id').notNull().references(()=>tenants.id),expires:integer('expires').notNull()});

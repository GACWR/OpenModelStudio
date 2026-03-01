-- Migration 001: Initial Schema
-- This is identical to db/init.sql for the initial migration.
-- Subsequent migrations should be incremental.
\i /docker-entrypoint-initdb.d/init.sql

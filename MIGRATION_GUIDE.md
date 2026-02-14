# Database Migration Guide

## Problem Solved
The initial migrations were incomplete - only 6 of 42 tables had creation migrations. This caused database errors when hosting because Sequelize couldn't create the full schema.

## Solution Implemented
Created `00000000000001-initial-schema.js` which uses your existing Sequelize models to create all tables automatically.

## Deployment Steps for Hosting

### First Time Setup (Fresh Database)

1. **Backup your local database** (just in case):
   ```bash
   mysqldump -u root -p pos_system > backup_$(date +%Y%m%d).sql
   ```

2. **On your hosting environment**, run migrations:
   ```bash
   npx sequelize-cli db:migrate
   ```

   This will:
   - Create all 42 tables from models
   - Run all incremental migrations in order
   - Set up proper foreign keys and indexes

3. **Verify the migration**:
   ```bash
   # Check table count (should be 42 + SequelizeMeta)
   mysql -u your_user -p your_database -e "SHOW TABLES;"
   ```

### Important Notes

- The initial migration runs FIRST (filename starts with 00000000000001)
- Existing incremental migrations will run AFTER base tables exist
- All migrations are idempotent - safe to run multiple times

### Troubleshooting

If migration fails:
1. Check database credentials in `.env`
2. Ensure database exists
3. Check logs for specific table/column errors
4. Verify models match your pos_system.sql schema

### Rolling Back

To rollback all migrations:
```bash
npx sequelize-cli db:migrate:undo:all
```

To rollback specific migration:
```bash
npx sequelize-cli db:migrate:undo --name migration-name.js
```

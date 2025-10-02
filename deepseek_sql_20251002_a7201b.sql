-- PostgreSQL replication setup
-- Primary server
CREATE USER replication_user WITH REPLICATION ENCRYPTED PASSWORD 'secure_password';
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET max_wal_senders = 10;
ALTER SYSTEM SET wal_keep_segments = 64;

-- Create replication slot
SELECT * FROM pg_create_physical_replication_slot('peoplelink_replica');

-- Backup script
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="peoplelink"

# Create backup
pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 7 backups
ls -tp $BACKUP_DIR/backup_*.sql.gz | grep -v '/$' | tail -n +8 | xargs -I {} rm -- {}

# Upload to S3 for offsite storage
aws s3 cp $BACKUP_DIR/backup_$DATE.sql.gz s3://peoplelink-backups/database/

echo "Backup completed: backup_$DATE.sql.gz"
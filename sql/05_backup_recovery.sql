-- ============================================================
-- 05_backup_recovery.sql : backup and recovery demonstration
-- The commands below are run in a terminal / Command Prompt
-- (XAMPP on Windows: C:\xampp\mysql\bin), NOT in phpMyAdmin.
-- The website's Backup page (admin only) does the same thing.
-- ============================================================

-- 1) BACKUP (structure + data + procedures/functions + triggers + views)
--    cd C:\xampp\mysql\bin
--    mysqldump -u root --routines --triggers university_sis > C:\backups\sis_backup.sql

-- 2) SIMULATE A DISASTER (run in phpMyAdmin SQL tab, then take a screenshot)
--    USE university_sis;
--    SELECT COUNT(*) FROM students;        -- 12
--    SET FOREIGN_KEY_CHECKS = 0;
--    DROP TABLE payments;
--    DELETE FROM students;
--    SET FOREIGN_KEY_CHECKS = 1;
--    SELECT COUNT(*) FROM students;        -- 0

-- 3) RECOVER from the backup file
--    mysql -u root university_sis < C:\backups\sis_backup.sql
--    (dump files contain DROP TABLE IF EXISTS, so tables are rebuilt)

-- 4) VERIFY (phpMyAdmin SQL tab)
--    USE university_sis;
--    SELECT COUNT(*) FROM students;        -- 12 again
--    SELECT COUNT(*) FROM payments;        -- 13 again
--    SHOW TRIGGERS;
--    SHOW PROCEDURE STATUS WHERE Db = 'university_sis';

-- 5) RECOVER if the whole database was dropped
--    mysql -u root -e "CREATE DATABASE IF NOT EXISTS university_sis"
--    mysql -u root university_sis < C:\backups\sis_backup.sql

-- 6) OPTIONAL: automate daily backups with Windows Task Scheduler,
--    running a .bat file that calls mysqldump with a date-stamped file name:
--    mysqldump -u root --routines --triggers university_sis > C:\backups\sis_%date:~-4%%date:~4,2%%date:~7,2%.sql

-- E-Learning & Field Monitoring Platform - reference schema (db_elearning)
-- Source of truth: src/database/migrate.ts (idempotent; runs on server boot and via npm run db:migrate)
-- Master tables (instansi/organisasi/satker/sub_org) are self-contained here; no cross-database FKs.

CREATE DATABASE IF NOT EXISTS db_elearning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_elearning;

CREATE TABLE IF NOT EXISTS `tbl_elearning_field_reports` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `trainer_id` char(36) NOT NULL,
  `module_id` char(36) NOT NULL,
  `provinsi_id` int(10) unsigned DEFAULT NULL,
  `kota_id` int(10) unsigned DEFAULT NULL,
  `location_name` varchar(255) NOT NULL,
  `audience_category` varchar(100) NOT NULL,
  `participant_count` int(11) NOT NULL DEFAULT 0,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `photo_url` text DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reports_tenant_created` (`tenant_id`,`created_at`),
  KEY `idx_reports_trainer` (`trainer_id`),
  KEY `idx_reports_module` (`module_id`),
  KEY `idx_reports_provinsi` (`provinsi_id`),
  KEY `idx_reports_kota` (`kota_id`),
  KEY `fk_reports_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_reports_kota` FOREIGN KEY (`kota_id`) REFERENCES `tbl_elearning_kota` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_module` FOREIGN KEY (`module_id`) REFERENCES `tbl_elearning_modules` (`id`),
  CONSTRAINT `fk_reports_provinsi` FOREIGN KEY (`provinsi_id`) REFERENCES `tbl_elearning_provinsi` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `tbl_elearning_users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_elearning_tenants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_trainer` FOREIGN KEY (`trainer_id`) REFERENCES `tbl_elearning_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_kota` (
  `id` int(10) unsigned NOT NULL,
  `provinsi_id` int(10) unsigned NOT NULL,
  `nama` varchar(100) NOT NULL,
  `kode` varchar(10) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kota_provinsi_nama` (`provinsi_id`,`nama`),
  CONSTRAINT `fk_kota_provinsi` FOREIGN KEY (`provinsi_id`) REFERENCES `tbl_elearning_provinsi` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_master_instansi` (
  `id` varchar(50) NOT NULL,
  `nama` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_instansi_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_master_organisasi` (
  `id` varchar(50) NOT NULL,
  `instansi_id` varchar(50) DEFAULT NULL,
  `nama` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_organisasi_instansi` (`instansi_id`),
  CONSTRAINT `fk_organisasi_instansi` FOREIGN KEY (`instansi_id`) REFERENCES `tbl_elearning_master_instansi` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_master_satker` (
  `id` varchar(50) NOT NULL,
  `organisasi_id` varchar(50) DEFAULT NULL,
  `nama` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_satker_organisasi` (`organisasi_id`),
  CONSTRAINT `fk_satker_organisasi` FOREIGN KEY (`organisasi_id`) REFERENCES `tbl_elearning_master_organisasi` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_master_sub_org` (
  `id` varchar(50) NOT NULL,
  `satker_id` varchar(50) DEFAULT NULL,
  `nama` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_sub_org_satker` (`satker_id`),
  CONSTRAINT `fk_sub_org_satker` FOREIGN KEY (`satker_id`) REFERENCES `tbl_elearning_master_satker` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_menu_access` (
  `menu_key` varchar(50) NOT NULL,
  `role_level` tinyint(4) NOT NULL,
  `allowed` tinyint(1) NOT NULL DEFAULT 1,
  `updated_by` char(36) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`menu_key`,`role_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_module_tenants` (
  `module_id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `granted_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`module_id`,`tenant_id`),
  KEY `idx_module_tenants_tenant` (`tenant_id`),
  CONSTRAINT `fk_mt_module` FOREIGN KEY (`module_id`) REFERENCES `tbl_elearning_modules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mt_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_elearning_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_modules` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) DEFAULT NULL COMMENT 'Owning tenant; NULL = master module distributed via tbl_elearning_module_tenants',
  `created_by` char(36) DEFAULT NULL,
  `author_id` char(36) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `content_text` longtext DEFAULT NULL,
  `quiz_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`quiz_data`)),
  `view_count` int(10) unsigned NOT NULL DEFAULT 0,
  `presentation_count` int(10) unsigned NOT NULL DEFAULT 0,
  `public_view_count` int(10) unsigned NOT NULL DEFAULT 0,
  `category` varchar(100) DEFAULT NULL,
  `target_audience` varchar(100) DEFAULT NULL,
  `instructor_name` varchar(255) DEFAULT NULL,
  `video_url` text DEFAULT NULL,
  `pdf_url` text DEFAULT NULL,
  `thumbnail_url` text DEFAULT NULL,
  `attachments_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`attachments_json`)),
  `duration_minutes` int(11) NOT NULL DEFAULT 0,
  `has_quiz` tinyint(1) NOT NULL DEFAULT 0,
  `approval_status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `approved_by` char(36) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_modules_tenant_status` (`tenant_id`,`approval_status`),
  KEY `idx_modules_status` (`approval_status`),
  KEY `fk_modules_creator` (`created_by`),
  KEY `idx_modules_author` (`author_id`),
  CONSTRAINT `fk_modules_author` FOREIGN KEY (`author_id`) REFERENCES `tbl_elearning_users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modules_creator` FOREIGN KEY (`created_by`) REFERENCES `tbl_elearning_users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_modules_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_elearning_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_provinsi` (
  `id` int(10) unsigned NOT NULL,
  `nama` varchar(100) NOT NULL,
  `kode` varchar(10) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_provinsi_nama` (`nama`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_tenants` (
  `id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `subdomain` varchar(100) NOT NULL,
  `legacy_instansi_id` varchar(50) DEFAULT NULL COMMENT 'FK -> tbl_elearning_master_instansi.id',
  `logo_url` text DEFAULT NULL,
  `theme_color` varchar(20) NOT NULL DEFAULT '#0ea5e9',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenants_subdomain` (`subdomain`),
  KEY `idx_tenants_legacy_instansi` (`legacy_instansi_id`),
  CONSTRAINT `fk_tenants_instansi` FOREIGN KEY (`legacy_instansi_id`) REFERENCES `tbl_elearning_master_instansi` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `tbl_elearning_users` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `employee_id` varchar(100) NOT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role_level` tinyint(4) NOT NULL DEFAULT 4 COMMENT '0=Super Admin, 1=National Exec, 2=Province Exec, 3=City Exec, 4=Trainer',
  `account_status` enum('PENDING','ACTIVE','REJECTED') NOT NULL DEFAULT 'PENDING',
  `provinsi_id` int(10) unsigned DEFAULT NULL,
  `kota_id` int(10) unsigned DEFAULT NULL,
  `legacy_instansi_id` varchar(50) DEFAULT NULL COMMENT 'FK -> tbl_elearning_master_instansi.id',
  `legacy_org_id` varchar(50) DEFAULT NULL COMMENT 'FK -> tbl_elearning_master_organisasi.id',
  `legacy_satker_id` varchar(50) DEFAULT NULL COMMENT 'FK -> tbl_elearning_master_satker.id',
  `legacy_sub_org_id` varchar(50) DEFAULT NULL COMMENT 'FK -> tbl_elearning_master_sub_org.id',
  `approved_by` char(36) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `last_login_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_tenant_employee` (`tenant_id`,`employee_id`),
  KEY `idx_users_tenant_role` (`tenant_id`,`role_level`),
  KEY `idx_users_status` (`account_status`),
  KEY `idx_users_provinsi` (`provinsi_id`),
  KEY `idx_users_kota` (`kota_id`),
  KEY `idx_users_legacy_instansi` (`legacy_instansi_id`),
  KEY `idx_users_legacy_org` (`legacy_org_id`),
  KEY `idx_users_legacy_satker` (`legacy_satker_id`),
  KEY `idx_users_legacy_sub_org` (`legacy_sub_org_id`),
  CONSTRAINT `fk_users_instansi` FOREIGN KEY (`legacy_instansi_id`) REFERENCES `tbl_elearning_master_instansi` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_kota` FOREIGN KEY (`kota_id`) REFERENCES `tbl_elearning_kota` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_org` FOREIGN KEY (`legacy_org_id`) REFERENCES `tbl_elearning_master_organisasi` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_provinsi` FOREIGN KEY (`provinsi_id`) REFERENCES `tbl_elearning_provinsi` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_satker` FOREIGN KEY (`legacy_satker_id`) REFERENCES `tbl_elearning_master_satker` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_sub_org` FOREIGN KEY (`legacy_sub_org_id`) REFERENCES `tbl_elearning_master_sub_org` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_elearning_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

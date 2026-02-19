-- ============================================
-- FORTUNA ENGINE - Collaboration Schema
-- 
-- RUN THIS AFTER the original schema.sql
-- Adds: workspaces, members, invites, shared resources, shared AI keys
-- ============================================

-- ============================================
-- WORKSPACES
-- ============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  owner_id INT UNSIGNED NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,           -- short URL-safe identifier
  settings JSON DEFAULT NULL,                  -- workspace-level preferences
  max_members INT UNSIGNED DEFAULT 10,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ws_slug (slug),
  INDEX idx_ws_owner (owner_id)
) ENGINE=InnoDB;

-- ============================================
-- WORKSPACE MEMBERS
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner', 'admin', 'member', 'viewer') NOT NULL DEFAULT 'member',
  -- Permissions (bitfield-style, but readable columns)
  can_edit_data TINYINT(1) DEFAULT 1,         -- modify shared financial data
  can_manage_members TINYINT(1) DEFAULT 0,    -- invite/remove members
  can_manage_keys TINYINT(1) DEFAULT 0,       -- view/edit shared API keys
  can_export TINYINT(1) DEFAULT 1,            -- CPA export, download
  can_use_advisor TINYINT(1) DEFAULT 1,       -- use AI advisor with shared keys
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_ws_user (workspace_id, user_id),
  INDEX idx_user_workspaces (user_id)
) ENGINE=InnoDB;

-- ============================================
-- WORKSPACE INVITES
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_invites (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT UNSIGNED NOT NULL,
  invite_code VARCHAR(32) NOT NULL UNIQUE,     -- random code for invite link
  invited_email VARCHAR(255) DEFAULT NULL,     -- optional: restrict to specific email
  invited_by INT UNSIGNED NOT NULL,
  role ENUM('admin', 'member', 'viewer') NOT NULL DEFAULT 'member',
  max_uses INT UNSIGNED DEFAULT 1,             -- how many times this code can be used
  use_count INT UNSIGNED DEFAULT 0,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invite_code (invite_code)
) ENGINE=InnoDB;

-- ============================================
-- SHARED RESOURCES (documents, configs, notes)
-- ============================================
CREATE TABLE IF NOT EXISTS shared_resources (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  workspace_id INT UNSIGNED NOT NULL,
  uploaded_by INT UNSIGNED DEFAULT NULL,
  resource_type ENUM('document', 'note', 'template', 'snapshot', 'config') NOT NULL,
  title VARCHAR(200) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  content LONGTEXT DEFAULT NULL,               -- text content or JSON
  file_name VARCHAR(255) DEFAULT NULL,         -- original filename if uploaded
  file_size INT UNSIGNED DEFAULT NULL,
  mime_type VARCHAR(100) DEFAULT NULL,
  tags JSON DEFAULT NULL,                      -- ["tax", "2024", "schedule-c"]
  is_pinned TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ws_resources (workspace_id, resource_type),
  INDEX idx_resource_uuid (uuid)
) ENGINE=InnoDB;

-- ============================================
-- SHARED FORTUNA STATE (workspace-level data)
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_states (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT UNSIGNED NOT NULL UNIQUE,
  state_data LONGTEXT NOT NULL,                -- shared FortunaState JSON
  state_version INT UNSIGNED DEFAULT 1,
  checksum VARCHAR(64) DEFAULT NULL,
  last_edited_by INT UNSIGNED DEFAULT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ws_state (workspace_id)
) ENGINE=InnoDB;

-- ============================================
-- SHARED AI API KEYS (workspace-level)
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_ai_keys (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT UNSIGNED NOT NULL,
  provider ENUM('anthropic', 'openai', 'gemini', 'openrouter') NOT NULL,
  api_key_encrypted VARCHAR(500) NOT NULL,     -- AES-encrypted key
  label VARCHAR(100) DEFAULT NULL,             -- friendly name
  added_by INT UNSIGNED NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  usage_count INT UNSIGNED DEFAULT 0,
  last_used_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_ws_provider (workspace_id, provider),
  INDEX idx_ws_keys (workspace_id, is_active)
) ENGINE=InnoDB;

-- ============================================
-- WORKSPACE ACTIVITY LOG
-- ============================================
CREATE TABLE IF NOT EXISTS workspace_activity (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED DEFAULT NULL,
  action VARCHAR(50) NOT NULL,                 -- 'joined', 'saved_state', 'uploaded', 'ai_query', etc.
  detail VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  INDEX idx_ws_activity (workspace_id, created_at)
) ENGINE=InnoDB;

-- ============================================
-- ADD workspace tracking to users
-- ============================================
ALTER TABLE users 
  ADD COLUMN active_workspace_id INT UNSIGNED DEFAULT NULL AFTER is_active,
  ADD INDEX idx_active_ws (active_workspace_id);

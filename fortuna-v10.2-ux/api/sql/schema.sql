-- ============================================
-- FORTUNA ENGINE - Database Schema
-- 
-- HOSTINGER SETUP:
-- 1. Create the database in hPanel > Databases > MySQL Databases
--    (it will be named like u733641305_fortuna)
-- 2. Open phpMyAdmin, select that database
-- 3. Go to SQL tab, paste this entire file, click Go
-- ============================================

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) DEFAULT NULL,
  email_verified TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  INDEX idx_email (email),
  INDEX idx_uuid (uuid)
) ENGINE=InnoDB;

-- ============================================
-- SESSIONS TABLE (JWT refresh tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  refresh_token VARCHAR(512) NOT NULL UNIQUE,
  device_info VARCHAR(255) DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked TINYINT(1) DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_token (refresh_token),
  INDEX idx_user_sessions (user_id, revoked)
) ENGINE=InnoDB;

-- ============================================
-- FORTUNA STATE (main data blob per user)
-- ============================================
CREATE TABLE IF NOT EXISTS fortuna_states (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL UNIQUE,
  state_data LONGTEXT NOT NULL,  -- JSON blob
  state_version INT UNSIGNED DEFAULT 1,
  checksum VARCHAR(64) DEFAULT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_state (user_id)
) ENGINE=InnoDB;

-- ============================================
-- STATE SNAPSHOTS (versioned backups)
-- ============================================
CREATE TABLE IF NOT EXISTS state_snapshots (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  state_data LONGTEXT NOT NULL,
  state_version INT UNSIGNED NOT NULL,
  snapshot_reason VARCHAR(50) DEFAULT 'auto',  -- 'auto', 'manual', 'pre_update'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_snapshots (user_id, created_at)
) ENGINE=InnoDB;

-- ============================================
-- AI ADVISOR HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS advisor_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  conversation_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(50) DEFAULT NULL,
  tokens_used INT UNSIGNED DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_conversations (user_id, conversation_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================
-- RATE LIMITING
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL,  -- IP or user UUID
  action VARCHAR(50) NOT NULL,       -- 'login', 'register', 'api_call', 'ai_query'
  attempts INT UNSIGNED DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rate_lookup (identifier, action, window_start)
) ENGINE=InnoDB;

-- ============================================
-- CLEANUP EVENT (auto-purge expired sessions)
-- ============================================
-- Note: Requires EVENT scheduler enabled on your MySQL server
-- If not available, the API handles cleanup on each request
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_expired_sessions
  ON SCHEDULE EVERY 1 DAY
  DO
  BEGIN
    DELETE FROM sessions WHERE expires_at < NOW() OR revoked = 1;
    DELETE FROM rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL 1 HOUR);
  END//
DELIMITER ;

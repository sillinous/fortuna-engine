<?php
/**
 * FORTUNA ENGINE - API Configuration
 * 
 * SETUP: Copy this file and update the values below for your environment.
 * On Hostinger, find your MySQL credentials in hPanel > Databases > MySQL Databases
 */

// ============================================
// DATABASE
// ============================================
define('DB_HOST', 'localhost');           // Usually 'localhost' on shared hosting
define('DB_NAME', 'u733641305_fortuna_engine');  // Your Hostinger-prefixed database name
define('DB_USER', 'u733641305_admin');    // Your Hostinger-prefixed username
define('DB_PASS', 'Q7gH2#40qz9R'); // Your MySQL password
define('DB_CHARSET', 'utf8mb4');

// ============================================
// JWT AUTHENTICATION
// ============================================
// IMPORTANT: Generate a strong random secret. Run this in terminal:
// php -r "echo bin2hex(random_bytes(32));"
define('JWT_SECRET', 'b1a46636ad239f48163345c480a20f65efbb5eb5b1ca078f277bcb3f56b03622');
define('JWT_ACCESS_TTL', 3600);          // Access token: 1 hour
define('JWT_REFRESH_TTL', 2592000);      // Refresh token: 30 days
define('JWT_ISSUER', 'fortuna-engine');
define('JWT_ALGORITHM', 'HS256');

// ============================================
// CORS - Allowed Origins
// ============================================
// Add your frontend domains here
define('ALLOWED_ORIGINS', [
    'http://localhost:5173',              // Vite dev server
    'http://localhost:4173',              // Vite preview
    'https://fortuna.unlessrx.com',       // Production domain
    'https://www.fortuna.unlessrx.com',
    'https://fortunaengine.com',
    'https://www.fortunaengine.com',
]);

// ============================================
// RATE LIMITING
// ============================================
define('RATE_LIMIT_LOGIN', 10);           // Max login attempts per window
define('RATE_LIMIT_REGISTER', 5);         // Max registrations per window
define('RATE_LIMIT_API', 120);            // Max API calls per window
define('RATE_LIMIT_AI', 30);              // Max AI advisor queries per window
define('RATE_LIMIT_WINDOW', 3600);        // Window duration in seconds (1 hour)

// ============================================
// SECURITY
// ============================================
define('BCRYPT_COST', 12);                // Password hashing rounds
define('MAX_SESSIONS_PER_USER', 5);       // Max active sessions
define('MIN_PASSWORD_LENGTH', 8);
define('MAX_STATE_SIZE', 5242880);        // 5MB max state blob
define('MAX_SNAPSHOTS_PER_USER', 20);     // Keep last 20 snapshots

// ============================================
// APPLICATION
// ============================================
define('APP_ENV', 'production');           // 'development' or 'production'
define('APP_DEBUG', false);               // Set true only for debugging
define('API_VERSION', '1.0.0');
define('STATE_SNAPSHOT_INTERVAL', 10);    // Auto-snapshot every N saves

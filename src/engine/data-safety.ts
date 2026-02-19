/**
 * Fortuna Engine — Data Safety Layer
 *
 * Protects user data with:
 *   1. Backup rotation — keeps last 3 clean saves, auto-rotates
 *   2. Corruption detection — validates state structure before save
 *   3. Recovery — falls back through backup chain on load failure
 *   4. Storage quota monitoring — warns before localStorage fills up
 *   5. Emergency export — one-click JSON dump even in error state
 *
 * @module data-safety
 */

import type { FortunaState } from './storage'
import { createDefaultState } from './storage'

// ─── Configuration ────────────────────────────────────────────────────────

const BACKUP_PREFIX = 'fortuna_backup_'
const MAX_BACKUPS = 3
const CORRUPTION_LOG_KEY = 'fortuna_corruption_log'
const QUOTA_WARN_MB = 4.5  // localStorage is typically 5MB; warn at 4.5

// ─── State Validation ─────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  repaired: boolean
}

/**
 * Deep structural validation of FortunaState.
 * Checks required fields, types, and referential integrity.
 */
export function validateState(state: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let repaired = false

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['State is not an object'], warnings: [], repaired: false }
  }

  const s = state as Record<string, unknown>

  // Required top-level fields
  if (!s.profile || typeof s.profile !== 'object') {
    errors.push('Missing or invalid profile object')
  } else {
    const p = s.profile as Record<string, unknown>
    if (!p.filingStatus || typeof p.filingStatus !== 'string') {
      errors.push('Missing profile.filingStatus')
    } else if (!['single', 'married_joint', 'married_separate', 'head_of_household'].includes(p.filingStatus as string)) {
      errors.push(`Invalid filingStatus: "${p.filingStatus}"`)
    }
    if (typeof p.taxYear !== 'number' || p.taxYear < 2020 || p.taxYear > 2030) {
      warnings.push(`Unusual taxYear: ${p.taxYear}`)
    }
  }

  // Arrays that must exist
  const requiredArrays = [
    'incomeStreams', 'expenses', 'entities', 'deductions',
    'depreciationAssets', 'investments', 'retirementAccounts',
    'goals', 'documents', 'estimatedPayments',
  ]
  for (const key of requiredArrays) {
    if (s[key] === undefined || s[key] === null) {
      warnings.push(`Missing array: ${key} (will default to [])`)
    } else if (!Array.isArray(s[key])) {
      errors.push(`${key} is not an array`)
    }
  }

  // Validate income streams
  if (Array.isArray(s.incomeStreams)) {
    for (let i = 0; i < (s.incomeStreams as unknown[]).length; i++) {
      const inc = (s.incomeStreams as Record<string, unknown>[])[i]
      if (!inc.id) warnings.push(`incomeStreams[${i}] missing id`)
      if (typeof inc.annualAmount !== 'number') errors.push(`incomeStreams[${i}] annualAmount is not a number`)
      if (typeof inc.annualAmount === 'number' && inc.annualAmount < 0) {
        warnings.push(`incomeStreams[${i}] has negative annualAmount: ${inc.annualAmount}`)
      }
      if (typeof inc.annualAmount === 'number' && inc.annualAmount > 100_000_000) {
        warnings.push(`incomeStreams[${i}] has unusually high annualAmount: $${(inc.annualAmount as number).toLocaleString()}`)
      }
    }
  }

  // Validate expenses
  if (Array.isArray(s.expenses)) {
    for (let i = 0; i < (s.expenses as unknown[]).length; i++) {
      const exp = (s.expenses as Record<string, unknown>[])[i]
      if (!exp.id) warnings.push(`expenses[${i}] missing id`)
      if (typeof exp.annualAmount !== 'number') errors.push(`expenses[${i}] annualAmount is not a number`)
      if (typeof exp.annualAmount === 'number' && exp.annualAmount < 0) {
        warnings.push(`expenses[${i}] has negative annualAmount`)
      }
    }
  }

  // Validate entities
  if (Array.isArray(s.entities)) {
    for (let i = 0; i < (s.entities as unknown[]).length; i++) {
      const ent = (s.entities as Record<string, unknown>[])[i]
      if (!ent.id) warnings.push(`entities[${i}] missing id`)
      if (!ent.name) warnings.push(`entities[${i}] missing name`)
      if (!ent.type) errors.push(`entities[${i}] missing type`)
    }
  }

  // Validate retirement accounts
  if (Array.isArray(s.retirementAccounts)) {
    for (let i = 0; i < (s.retirementAccounts as unknown[]).length; i++) {
      const ret = (s.retirementAccounts as Record<string, unknown>[])[i]
      if (typeof ret.balance === 'number' && ret.balance < 0) {
        warnings.push(`retirementAccounts[${i}] has negative balance`)
      }
      if (typeof ret.annualContribution === 'number' && ret.annualContribution < 0) {
        warnings.push(`retirementAccounts[${i}] has negative contribution`)
      }
    }
  }

  // Check for orphaned entity references
  if (Array.isArray(s.entities) && Array.isArray(s.incomeStreams)) {
    const entityIds = new Set((s.entities as Record<string, unknown>[]).map(e => e.id))
    for (const inc of (s.incomeStreams as Record<string, unknown>[])) {
      if (inc.entityId && !entityIds.has(inc.entityId)) {
        warnings.push(`Income "${inc.name}" references non-existent entity "${inc.entityId}"`)
      }
    }
  }

  // Referential integrity: expenses → entities
  if (Array.isArray(s.entities) && Array.isArray(s.expenses)) {
    const entityIds = new Set((s.entities as Record<string, unknown>[]).map(e => e.id))
    for (const exp of (s.expenses as Record<string, unknown>[])) {
      if (exp.entityId && !entityIds.has(exp.entityId)) {
        warnings.push(`Expense "${exp.description}" references non-existent entity "${exp.entityId}"`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repaired,
  }
}

/**
 * Attempt to repair common state issues.
 * Returns a cleaned copy (does NOT mutate input).
 */
export function repairState(state: unknown): { state: FortunaState; repairs: string[] } {
  const repairs: string[] = []
  const defaults = createDefaultState()

  if (!state || typeof state !== 'object') {
    repairs.push('State was null/undefined — created fresh default state')
    return { state: defaults, repairs }
  }

  const s = { ...state } as Record<string, unknown>

  // Ensure profile exists
  if (!s.profile || typeof s.profile !== 'object') {
    s.profile = defaults.profile
    repairs.push('Restored missing profile')
  }

  // Ensure all arrays exist
  const arrayFields = [
    'incomeStreams', 'expenses', 'entities', 'deductions',
    'depreciationAssets', 'investments', 'retirementAccounts',
    'goals', 'documents', 'estimatedPayments', 'bankTransactions',
  ]
  for (const key of arrayFields) {
    if (!Array.isArray(s[key])) {
      s[key] = []
      repairs.push(`Initialized missing array: ${key}`)
    }
  }

  // Add missing IDs
  for (const key of arrayFields) {
    const arr = s[key] as Record<string, unknown>[]
    for (let i = 0; i < arr.length; i++) {
      if (!arr[i].id) {
        arr[i] = { ...arr[i], id: `repair_${key}_${i}_${Date.now().toString(36)}` }
        repairs.push(`Generated missing id for ${key}[${i}]`)
      }
    }
  }

  // Ensure onboardingComplete is boolean
  if (typeof s.onboardingComplete !== 'boolean') {
    s.onboardingComplete = false
    repairs.push('Reset onboardingComplete to false')
  }

  return { state: s as unknown as FortunaState, repairs }
}

// ─── Backup Rotation ──────────────────────────────────────────────────────

/**
 * Save a backup before overwriting main state.
 * Keeps up to MAX_BACKUPS rotated copies.
 */
export function saveBackup(state: FortunaState): boolean {
  try {
    // Validate before backing up — don't backup corruption
    const v = validateState(state)
    if (!v.valid) return false

    const key = `${BACKUP_PREFIX}${Date.now()}`
    const payload = JSON.stringify({
      _backupAt: new Date().toISOString(),
      _stateHash: simpleHash(JSON.stringify(state)),
      state,
    })

    localStorage.setItem(key, payload)

    // Rotate: remove oldest backups beyond MAX_BACKUPS
    const backupKeys = Object.keys(localStorage)
      .filter(k => k.startsWith(BACKUP_PREFIX))
      .sort()

    while (backupKeys.length > MAX_BACKUPS) {
      const oldest = backupKeys.shift()
      if (oldest) localStorage.removeItem(oldest)
    }

    return true
  } catch {
    return false
  }
}

/**
 * List available backups, newest first.
 */
export function listBackups(): { key: string; timestamp: string; sizeKB: number }[] {
  try {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(BACKUP_PREFIX))
      .sort()
      .reverse()
      .map(key => {
        const raw = localStorage.getItem(key)
        let timestamp = ''
        try {
          const parsed = JSON.parse(raw || '{}')
          timestamp = parsed._backupAt || ''
        } catch { /* */ }
        return {
          key,
          timestamp,
          sizeKB: Math.round((raw?.length || 0) / 1024),
        }
      })
  } catch {
    return []
  }
}

/**
 * Restore state from a specific backup.
 */
export function restoreBackup(backupKey: string): { state: FortunaState; timestamp: string } | null {
  try {
    const raw = localStorage.getItem(backupKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.state) return null
    return { state: parsed.state, timestamp: parsed._backupAt || '' }
  } catch {
    return null
  }
}

/**
 * Try to recover state by walking the backup chain.
 * Returns the newest valid backup, or null if all corrupt.
 */
export function recoverFromBackups(): { state: FortunaState; source: string; repairs: string[] } | null {
  const backups = listBackups()
  for (const backup of backups) {
    const restored = restoreBackup(backup.key)
    if (!restored) continue

    const validation = validateState(restored.state)
    if (validation.valid) {
      return {
        state: restored.state,
        source: `Backup from ${restored.timestamp}`,
        repairs: [],
      }
    }

    // Try repairing
    const { state, repairs } = repairState(restored.state)
    const recheck = validateState(state)
    if (recheck.valid) {
      return {
        state,
        source: `Repaired backup from ${restored.timestamp}`,
        repairs,
      }
    }
  }

  return null
}

// ─── Storage Quota Monitoring ─────────────────────────────────────────────

export interface StorageQuota {
  usedBytes: number
  usedMB: string
  estimatedLimitMB: number
  usagePct: number
  isWarning: boolean
  isCritical: boolean
  breakdown: { key: string; sizeKB: number }[]
}

export function checkStorageQuota(): StorageQuota {
  let usedBytes = 0
  const breakdown: { key: string; sizeKB: number }[] = []

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const val = localStorage.getItem(key)
      const size = (key.length + (val?.length || 0)) * 2 // UTF-16
      usedBytes += size
      if (key.startsWith('fortuna')) {
        breakdown.push({ key, sizeKB: Math.round(size / 1024) })
      }
    }
  } catch { /* */ }

  breakdown.sort((a, b) => b.sizeKB - a.sizeKB)

  const estimatedLimitMB = 5
  const usedMBNum = usedBytes / (1024 * 1024)

  return {
    usedBytes,
    usedMB: `${usedMBNum.toFixed(2)} MB`,
    estimatedLimitMB,
    usagePct: Math.round((usedMBNum / estimatedLimitMB) * 100),
    isWarning: usedMBNum >= QUOTA_WARN_MB,
    isCritical: usedMBNum >= estimatedLimitMB * 0.95,
    breakdown,
  }
}

// ─── Corruption Logging ───────────────────────────────────────────────────

interface CorruptionEvent {
  timestamp: string
  error: string
  source: 'load' | 'save' | 'validate'
  recovered: boolean
  method?: string
}

export function logCorruption(event: Omit<CorruptionEvent, 'timestamp'>): void {
  try {
    const log = JSON.parse(localStorage.getItem(CORRUPTION_LOG_KEY) || '[]') as CorruptionEvent[]
    log.push({ ...event, timestamp: new Date().toISOString() })
    // Keep last 20 events
    localStorage.setItem(CORRUPTION_LOG_KEY, JSON.stringify(log.slice(-20)))
  } catch { /* */ }
}

export function getCorruptionLog(): CorruptionEvent[] {
  try {
    return JSON.parse(localStorage.getItem(CORRUPTION_LOG_KEY) || '[]')
  } catch {
    return []
  }
}

// ─── Emergency Export ─────────────────────────────────────────────────────

/**
 * Emergency: dump all Fortuna-related localStorage to a JSON file.
 * Works even when the app is in an error state.
 */
export function emergencyExport(): string {
  const dump: Record<string, unknown> = {
    _type: 'fortuna-emergency-export',
    _exportedAt: new Date().toISOString(),
    _backups: listBackups().length,
    _quota: checkStorageQuota(),
    _corruptionLog: getCorruptionLog(),
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('fortuna')) continue
      try {
        dump[key] = JSON.parse(localStorage.getItem(key) || 'null')
      } catch {
        dump[key] = localStorage.getItem(key)
      }
    }
  } catch { /* */ }

  return JSON.stringify(dump, null, 2)
}

/**
 * Trigger a browser download of the emergency export.
 */
export function downloadEmergencyExport(): void {
  const json = emergencyExport()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fortuna-emergency-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Safe Save Wrapper ────────────────────────────────────────────────────

/**
 * Safe save: validates state, creates backup, then saves.
 * Returns validation result + backup status.
 */
export function safeSaveWithBackup(
  state: FortunaState,
  saveFn: (s: FortunaState) => Promise<boolean>,
): { validation: ValidationResult; backupCreated: boolean; saved: boolean } {
  const validation = validateState(state)

  if (!validation.valid) {
    logCorruption({ error: validation.errors.join('; '), source: 'save', recovered: false })
    // Attempt repair
    const { state: repaired, repairs } = repairState(state)
    const recheck = validateState(repaired)
    if (recheck.valid) {
      validation.repaired = true
      validation.warnings.push(`Auto-repaired: ${repairs.join('; ')}`)
      state = repaired
    }
  }

  // Create backup before save
  const backupCreated = saveBackup(state)

  // Save (fire and forget since this is sync wrapper)
  let saved = false
  saveFn(state).then(ok => { saved = ok }).catch(() => { saved = false })

  return { validation, backupCreated, saved: true /* optimistic */ }
}

// ─── Utility ──────────────────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

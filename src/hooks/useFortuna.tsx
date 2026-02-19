import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { Storage, createDefaultState, type FortunaState, type UXPreferences, genId } from '../engine/storage'
import { generateTaxReport, compareEntities, type TaxReport, type EntityComparison } from '../engine/tax-calculator'
import { detectStrategies, analyzeRisks, calculateHealthScore, type DetectedStrategy, type RiskItem, type FinancialHealthScore } from '../engine/strategy-detector'
import {
  type HistoryStore,
  createEmptyHistory,
  shouldAutoSnapshot,
  captureSnapshot,
  addSnapshot,
  computeTrends,
  analyzeStrategyEffectiveness,
  projectTrajectory,
  buildTimeline,
  type TrendLine,
  type StrategyEffect,
  type Projection,
  type Milestone,
} from '../engine/history-engine'
import { generateSessionDigest, type SessionDigest } from '../engine/session-digest'
import { validateState, repairState, saveBackup, recoverFromBackups, logCorruption } from '../engine/data-safety'

interface FortunaContextType {
  state: FortunaState
  setState: (s: FortunaState) => void
  updateState: (updater: (prev: FortunaState) => FortunaState) => void
  save: () => Promise<void>
  loading: boolean
  // UX Preferences
  uxPrefs: UXPreferences
  updateUXPrefs: (partial: Partial<UXPreferences>) => void
  // Computed values
  taxReport: TaxReport
  strategies: DetectedStrategy[]
  risks: RiskItem[]
  healthScore: FinancialHealthScore
  entityComparison: EntityComparison[]
  // History
  history: HistoryStore
  trends: TrendLine[]
  strategyEffects: StrategyEffect[]
  projections: Projection[]
  milestones: Milestone[]
  takeManualSnapshot: (description?: string) => void
  // Session intelligence
  sessionDigest: SessionDigest
  // Storage info
  storageBackend: string
}

const FortunaContext = createContext<FortunaContextType | null>(null)

const defaultUXPrefs: UXPreferences = {
  sidebarCollapsed: false,
  lastActiveView: 'dashboard',
  theme: 'dark',
  sidebarSections: {},
  lastSessionTimestamp: new Date().toISOString(),
  dataVersion: 8,
}

export function FortunaProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<FortunaState>(createDefaultState())
  const [uxPrefs, setUXPrefsRaw] = useState<UXPreferences>(defaultUXPrefs)
  const [history, setHistory] = useState<HistoryStore>(createEmptyHistory())
  const [loading, setLoading] = useState(true)
  const [storageBackend, setStorageBackend] = useState('none')
  const uxSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSnapshotDone = useRef(false)
  const saveCount = useRef(0)

  // Load from storage on mount — with corruption recovery
  useEffect(() => {
    async function load() {
      try {
        setStorageBackend(Storage.getBackendName())
        const [savedState, savedPrefs, savedHistory] = await Promise.all([
          Storage.getFullState(),
          Storage.getUXPrefs(),
          Storage.getFinancialHistory(),
        ])

        if (savedState?.profile) {
          // Validate loaded state
          const validation = validateState(savedState)
          if (validation.valid) {
            setStateRaw(savedState)
          } else {
            console.warn('[Fortuna] State validation failed, attempting repair:', validation.errors)
            logCorruption({ error: validation.errors.join('; '), source: 'load', recovered: false })
            const { state: repaired, repairs } = repairState(savedState)
            const recheck = validateState(repaired)
            if (recheck.valid) {
              console.info('[Fortuna] State repaired:', repairs)
              logCorruption({ error: repairs.join('; '), source: 'load', recovered: true, method: 'repair' })
              setStateRaw(repaired)
            } else {
              // Try backup chain
              console.warn('[Fortuna] Repair failed, trying backup recovery')
              const recovered = recoverFromBackups()
              if (recovered) {
                console.info('[Fortuna] Recovered from backup:', recovered.source)
                logCorruption({ error: 'Recovered from backup', source: 'load', recovered: true, method: 'backup' })
                setStateRaw(recovered.state)
              } else {
                console.warn('[Fortuna] All recovery failed, using defaults')
                logCorruption({ error: 'All recovery failed', source: 'load', recovered: false })
              }
            }
          }
        }

        setUXPrefsRaw(prev => ({ ...prev, ...savedPrefs }))
        if (savedHistory?.snapshots) setHistory(savedHistory)
      } catch (e) {
        console.warn('[Fortuna] Storage load failed, attempting backup recovery', e)
        logCorruption({ error: (e as Error).message, source: 'load', recovered: false })
        const recovered = recoverFromBackups()
        if (recovered) {
          setStateRaw(recovered.state)
          logCorruption({ error: 'Load exception recovered from backup', source: 'load', recovered: true, method: 'backup' })
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---- State management ----

  const setState = useCallback((s: FortunaState) => {
    setStateRaw({ ...s, lastUpdated: new Date().toISOString() })
  }, [])

  const updateState = useCallback((updater: (prev: FortunaState) => FortunaState) => {
    setStateRaw(prev => {
      const next = updater(prev)
      return { ...next, lastUpdated: new Date().toISOString() }
    })
  }, [])

  const save = useCallback(async () => {
    await Storage.saveFullState(state)
  }, [state])

  // Auto-save financial state (debounced 1s) + trigger cloud sync + backup rotation
  useEffect(() => {
    if (loading) return
    const timer = setTimeout(() => {
      Storage.saveFullState(state)
      // Dispatch event for AuthContext cloud sync listener
      window.dispatchEvent(new CustomEvent('fortuna:state-saved', { detail: state }))
      // Backup rotation: create a backup every 5th save
      saveCount.current++
      if (saveCount.current % 5 === 0) {
        try { saveBackup(state) } catch { /* non-critical */ }
      }
    }, 1000)
    return () => clearTimeout(timer)
  }, [state, loading])

  // Listen for state updates from cloud sync (login merge)
  useEffect(() => {
    const handler = (e: Event) => {
      const newState = (e as CustomEvent).detail
      if (newState?.profile) {
        setStateRaw(newState)
      }
    }
    window.addEventListener('fortuna:state-updated', handler)
    return () => window.removeEventListener('fortuna:state-updated', handler)
  }, [])

  // ---- UX Preferences ----

  const updateUXPrefs = useCallback((partial: Partial<UXPreferences>) => {
    setUXPrefsRaw(prev => {
      const next = { ...prev, ...partial }
      if (uxSaveTimer.current) clearTimeout(uxSaveTimer.current)
      uxSaveTimer.current = setTimeout(() => {
        Storage.saveUXPrefs(next)
      }, 200)
      return next
    })
  }, [])

  // ---- Auto-snapshot ----

  useEffect(() => {
    if (loading || autoSnapshotDone.current || !state.onboardingComplete) return

    const check = shouldAutoSnapshot(state, history)
    if (check.should) {
      const snap = captureSnapshot(state, check.trigger, check.reason)
      const updated = addSnapshot(history, snap)
      setHistory(updated)
      Storage.saveFinancialHistory(updated)
      console.log(`[Fortuna] Auto-snapshot: ${check.reason}`)
    }
    autoSnapshotDone.current = true
  }, [loading, state, history])

  // Manual snapshot
  const takeManualSnapshot = useCallback((description?: string) => {
    const snap = captureSnapshot(state, 'manual', description || 'Manual snapshot')
    const updated = addSnapshot(history, snap)
    setHistory(updated)
    Storage.saveFinancialHistory(updated)
  }, [state, history])

  // ---- Computed values ----

  const netSEIncome = state.incomeStreams
    .filter(s => ['business', 'freelance'].includes(s.type) && s.isActive)
    .reduce((sum, s) => sum + s.annualAmount, 0) -
    state.expenses.filter(e => e.isDeductible).reduce((sum, e) => sum + (e.annualAmount * e.deductionPct / 100), 0)

  const taxReport = generateTaxReport(state)
  const strategies = detectStrategies(state)
  const risks = analyzeRisks(state)
  const healthScore = calculateHealthScore(state)
  const entityComparison = compareEntities(Math.max(0, netSEIncome), state.profile)

  // History computed values
  const trends = computeTrends(history)
  const strategyEffects = analyzeStrategyEffectiveness(state, history)
  const projections = projectTrajectory(history)
  const milestones = buildTimeline(state, history)

  // Session digest
  const sessionDigest = generateSessionDigest(
    state, history, trends, strategies, taxReport,
    uxPrefs.lastSessionTimestamp || null,
  )

  // Update last session timestamp once loading completes
  const sessionTracked = useRef(false)
  useEffect(() => {
    if (!loading && !sessionTracked.current) {
      sessionTracked.current = true
      // Delay to let digest read the previous timestamp
      setTimeout(() => updateUXPrefs({ lastSessionTimestamp: new Date().toISOString() }), 2000)
    }
  }, [loading, updateUXPrefs])

  return (
    <FortunaContext.Provider value={{
      state, setState, updateState, save, loading,
      uxPrefs, updateUXPrefs,
      taxReport, strategies, risks, healthScore, entityComparison,
      history, trends, strategyEffects, projections, milestones, takeManualSnapshot,
      sessionDigest,
      storageBackend,
    }}>
      {children}
    </FortunaContext.Provider>
  )
}

export function useFortuna() {
  const ctx = useContext(FortunaContext)
  if (!ctx) throw new Error('useFortuna must be used within FortunaProvider')
  return ctx
}

export { genId }

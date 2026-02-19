/**
 * FORTUNA ENGINE — Microcopy Registry (Phase 2 UX Fix)
 *
 * Provides friendly and technical labels for every concept in the app.
 * Users toggle between "Friendly" (default) and "Technical" modes.
 * Friendly: Conversational, approachable, action-oriented.
 * Technical: Precise, IRS-aligned, power-user-oriented.
 */

import { useFortuna } from '../hooks/useFortuna'

// ─── Copy Variants ──────────────────────────────────────────────────

interface CopyEntry {
  friendly: string
  technical: string
}

/**
 * Registry of all user-facing labels with both variants.
 * Keys follow pattern: context.element (e.g., "nav.dashboard", "header.taxStrategy")
 */
export const COPY: Record<string, CopyEntry> = {
  // ─── View Titles ────────────────────────────────────────────────
  'view.dashboard':         { friendly: 'Home',                    technical: 'Command Center' },
  'view.tax':               { friendly: 'Tax Overview',            technical: 'Tax Strategy Engine' },
  'view.entity':            { friendly: 'Business Structure',      technical: 'Entity Design Lab' },
  'view.revenue':           { friendly: 'Revenue Analysis',        technical: 'Revenue Engine' },
  'view.risk':              { friendly: 'Risk Overview',           technical: 'Risk Matrix' },
  'view.audit':             { friendly: 'Audit Readiness',         technical: 'Audit Defense Profiler' },
  'view.scenarios':         { friendly: 'What-If Scenarios',       technical: 'Scenario Modeler' },
  'view.cashflow':          { friendly: 'Cash Flow',               technical: 'Cash Flow Analysis' },
  'view.alerts':            { friendly: 'Alerts & Actions',        technical: 'Proactive Intelligence' },
  'view.calendar':          { friendly: 'Deadlines',               technical: 'Tax Calendar Engine' },
  'view.documents':         { friendly: 'Documents',               technical: 'Document Vault' },
  'view.import':            { friendly: 'Import Data',             technical: 'Data Import Pipeline' },
  'view.workflows':         { friendly: 'Step-by-Step Guides',     technical: 'Strategic Workflows' },
  'view.automations':       { friendly: 'Auto-Alerts',             technical: 'Automation Engine' },
  'view.advisor':           { friendly: 'Ask AI',                  technical: 'AI Tax Advisor' },
  'view.health':            { friendly: 'Health Score',             technical: 'Financial Health Index' },
  'view.optimizer':         { friendly: 'Structure Comparison',    technical: 'Entity Optimizer' },
  'view.reports':           { friendly: 'Reports',                 technical: 'Report Generator' },
  'view.history':           { friendly: 'History',                 technical: 'Financial History' },
  'view.taxdocs':           { friendly: 'Tax Forms',               technical: 'Tax Document Generator' },
  'view.retirement':        { friendly: 'Retirement Planning',     technical: 'Retirement Optimizer' },
  'view.arbitrage':         { friendly: 'State Tax Compare',       technical: 'State Tax Arbitrage' },
  'view.multiyear':         { friendly: 'Future Projections',      technical: 'Multi-Year Tax Projections' },
  'view.depreciation':      { friendly: 'Asset Depreciation',      technical: 'Depreciation Tracker (§179/MACRS)' },
  'view.credits':           { friendly: 'Credits & Incentives',    technical: 'Tax Credit Analyzer' },
  'view.nexus':             { friendly: 'Insights',                technical: 'Nexus Intelligence' },
  'view.pnl':               { friendly: 'Profit & Loss',           technical: 'P&L Statement Generator' },
  'view.paycheck':          { friendly: 'Paycheck Planner',        technical: 'Paycheck Simulator' },
  'view.deductions':        { friendly: 'Find Deductions',         technical: 'Deduction Discovery Engine' },
  'view.marginal':          { friendly: 'Tax Rates',               technical: 'Marginal Rate Analyzer' },
  'view.goals':             { friendly: 'Goals',                   technical: 'Goal Planner' },
  'view.taxprep':           { friendly: 'Filing Checklist',        technical: 'Tax Prep Checklist' },
  'view.workspace':         { friendly: 'Team Access',             technical: 'Collaboration Workspace' },
  'view.cpa':               { friendly: 'Send to Accountant',      technical: 'CPA Export Package' },
  'view.portfolio':         { friendly: 'Investments',             technical: 'Portfolio Intelligence' },
  'view.data':              { friendly: 'Manage Data',             technical: 'Data Manager' },
  'view.setup':             { friendly: 'My Profile',              technical: 'Financial Profile Setup' },

  // ─── View Subtitles ─────────────────────────────────────────────
  'subtitle.dashboard':     { friendly: 'Here\'s how your finances look today',                       technical: 'Real-time financial intelligence across all engines' },
  'subtitle.tax':           { friendly: 'Strategies to keep more of what you earn',                   technical: 'Proactive optimization computed from your actual financial data' },
  'subtitle.entity':        { friendly: 'Find the business structure that saves you the most',        technical: 'Multi-entity architecture with flow-through analysis' },
  'subtitle.scenarios':     { friendly: 'See how decisions affect your taxes before you commit',      technical: 'Monte Carlo simulation with sensitivity analysis' },
  'subtitle.risk':          { friendly: 'Potential issues to watch out for',                          technical: 'Multi-dimensional risk assessment matrix' },
  'subtitle.audit':         { friendly: 'How ready you are if the IRS comes calling',                 technical: 'DIF score estimation with red flag detection' },
  'subtitle.health':        { friendly: 'Your overall financial health at a glance',                  technical: 'Composite score across tax, risk, and optimization dimensions' },
  'subtitle.deductions':    { friendly: 'Let\'s find deductions you might be missing',                technical: 'Systematic deduction discovery against IRS categories' },
  'subtitle.retirement':    { friendly: 'Grow your retirement savings while cutting your tax bill',   technical: 'Tax-deferred contribution optimization across account types' },
  'subtitle.arbitrage':     { friendly: 'See how much you\'d save by living in another state',        technical: '50-state comparative tax burden analysis' },
  'subtitle.portfolio':     { friendly: 'Tax-smart insights for your investment portfolio',           technical: 'Cost basis tracking with harvest opportunity detection' },
  'subtitle.cashflow':      { friendly: 'Where your money comes from and where it goes',              technical: 'Income/expense analysis with reserve modeling' },

  // ─── Metric Labels ──────────────────────────────────────────────
  'metric.total_tax':       { friendly: 'Total Tax',               technical: 'Total Federal + State + SE Tax' },
  'metric.effective_rate':   { friendly: 'Tax Rate',                technical: 'Effective Tax Rate' },
  'metric.savings':         { friendly: 'Potential Savings',        technical: 'Identified Tax Savings' },
  'metric.se_tax':          { friendly: 'Self-Employment Tax',      technical: 'SE Tax (OASDI + HI)' },
  'metric.agi':             { friendly: 'Adjusted Income',          technical: 'Adjusted Gross Income (AGI)' },
  'metric.taxable_income':  { friendly: 'Taxable Income',           technical: 'Taxable Income After Deductions' },
  'metric.net_income':      { friendly: 'Take-Home Pay',            technical: 'Net After-Tax Income' },
  'metric.health_score':    { friendly: 'Health Score',              technical: 'Financial Health Index' },
  'metric.audit_risk':      { friendly: 'Audit Risk',               technical: 'Estimated DIF Score' },
  'metric.strategy_count':  { friendly: 'Strategies Found',         technical: 'Detected Strategies' },

  // ─── Action Labels ──────────────────────────────────────────────
  'action.add_income':      { friendly: 'Add income',               technical: 'Add income stream' },
  'action.add_expense':     { friendly: 'Add expense',              technical: 'Add deductible expense' },
  'action.run_scenario':    { friendly: 'Try a scenario',           technical: 'Generate scenario analysis' },
  'action.export_cpa':      { friendly: 'Send to your accountant',  technical: 'Export CPA package (TXF/CSV/8949)' },
  'action.save_snapshot':   { friendly: 'Save a snapshot',          technical: 'Capture state snapshot' },
  'action.find_deductions': { friendly: 'Find deductions',          technical: 'Run deduction discovery' },
  'action.compare_entities':{ friendly: 'Compare structures',       technical: 'Run entity comparison analysis' },

  // ─── Section Headers ───────────────────────────────────────────
  'section.overview':       { friendly: 'At a Glance',              technical: 'Summary Metrics' },
  'section.strategies':     { friendly: 'Ways to Save',             technical: 'Detected Strategies' },
  'section.breakdown':      { friendly: 'Tax Breakdown',            technical: 'Tax Composition Analysis' },
  'section.recommendations':{ friendly: 'Recommended Next Steps',   technical: 'Actionable Recommendations' },
  'section.risk_factors':   { friendly: 'Things to Watch',          technical: 'Risk Factors' },
  'section.timeline':       { friendly: 'Coming Up',                technical: 'Execution Timeline' },
}

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Returns a function that resolves copy keys to the user's preferred mode.
 *
 * Usage:
 *   const t = useCopy()
 *   <h1>{t('view.dashboard')}</h1>
 *   <p>{t('subtitle.dashboard')}</p>
 */
export function useCopy() {
  const { uxPrefs } = useFortuna()
  const isFriendly = uxPrefs.friendlyLabels !== false // default: friendly

  return (key: string, fallback?: string): string => {
    const entry = COPY[key]
    if (!entry) return fallback || key
    return isFriendly ? entry.friendly : entry.technical
  }
}

/**
 * Direct accessor without hook (for outside React components).
 */
export function getCopy(key: string, mode: 'friendly' | 'technical', fallback?: string): string {
  const entry = COPY[key]
  if (!entry) return fallback || key
  return mode === 'friendly' ? entry.friendly : entry.technical
}

/**
 * Fortuna Engine — Intelligence Nexus View
 *
 * Surfaces cross-engine compound insights. Each insight shows
 * which engines contributed, the dollar impact, and drill-through
 * actions to the relevant views.
 */

import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { runUnifiedIntelligence, type NexusInsight, type UnifiedIntelligence } from '../engine/unified-intelligence'
import { useNavigation, RelatedViews, ViewBreadcrumb } from '../context/NavigationContext'
import type { ViewKey } from '../App'
import {
  Brain, Zap, Clock, Building2, Shield, TrendingUp,
  ChevronDown, ChevronRight, ArrowRight, Sparkles, RefreshCw,
  Target, Layers, DollarSign, AlertTriangle
} from 'lucide-react'

const CATEGORY_META: Record<string, { label: string; color: string; icon: typeof Brain }> = {
  compound_savings: { label: 'Compound Savings', color: '#22c55e', icon: DollarSign },
  timing:           { label: 'Timing Advantage', color: '#f59e0b', icon: Clock },
  structural:       { label: 'Structural Change', color: '#6366f1', icon: Building2 },
  risk_mitigation:  { label: 'Risk Mitigation',  color: '#ef4444', icon: Shield },
  growth:           { label: 'Growth Strategy',   color: '#06b6d4', icon: TrendingUp },
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
}

function InsightCard({ insight, onNavigate }: { insight: NexusInsight; onNavigate: (v: ViewKey) => void }) {
  const [expanded, setExpanded] = useState(false)
  const cat = CATEGORY_META[insight.category] || CATEGORY_META.compound_savings
  const CatIcon = cat.icon

  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 12,
      border: `1px solid ${PRIORITY_COLORS[insight.priority]}33`,
      overflow: 'hidden',
      transition: 'all 0.2s',
    }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${cat.color}15`,
          border: `1px solid ${cat.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <CatIcon size={18} style={{ color: cat.color }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em',
              background: `${PRIORITY_COLORS[insight.priority]}20`,
              color: PRIORITY_COLORS[insight.priority],
            }}>
              {insight.priority}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {cat.label}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            {insight.title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {insight.description}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 20, fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: '#22c55e',
          }}>
            ${insight.impact.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>potential savings</div>
          <div style={{ marginTop: 8, color: 'var(--text-muted)' }}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px 20px',
          background: 'rgba(0,0,0,0.15)',
        }}>
          {/* Reasoning */}
          <div style={{
            fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
            marginBottom: 16, padding: '12px 14px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 8, borderLeft: `3px solid ${cat.color}40`,
          }}>
            {insight.reasoning}
          </div>

          {/* Engines involved */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Engines Cross-Referenced
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {insight.engines.map(eng => (
                <span key={eng} style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  background: 'rgba(99,102,241,0.15)',
                  color: '#818cf8',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {eng}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Take Action
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {insight.actions.map((action, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation()
                    onNavigate(action.view as ViewKey)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                    e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'var(--border-subtle)'
                  }}
                >
                  <ArrowRight size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {action.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {action.detail}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function NexusView() {
  const { state } = useFortuna()
  const { navigate } = useNavigation()
  const [filterPriority, setFilterPriority] = useState<string>('all')

  const intel: UnifiedIntelligence | null = useMemo(() => {
    try {
      return runUnifiedIntelligence(state)
    } catch {
      return null
    }
  }, [state])

  if (!intel) {
    return (
      <div style={{ padding: 32 }}>
        <h2 style={{ color: 'var(--text-primary)' }}>Intelligence Nexus</h2>
        <p style={{ color: 'var(--text-muted)' }}>Unable to run intelligence pipeline. Add income data to get started.</p>
      </div>
    )
  }

  const insights = filterPriority === 'all'
    ? intel.nexusInsights
    : intel.nexusInsights.filter(n => n.priority === filterPriority)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
      <ViewBreadcrumb viewKey="nexus" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Brain size={24} style={{ color: '#818cf8' }} />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Intelligence Nexus
            </h1>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            Cross-engine compound insights — opportunities that only emerge when all {intel.enginesCrossReferenced} engines analyze together.
          </p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Compound Savings', value: `$${intel.totalCompoundSavings.toLocaleString()}`, icon: DollarSign, color: '#22c55e' },
          { label: 'Insights Found', value: `${intel.insightsGenerated}`, icon: Sparkles, color: '#818cf8' },
          { label: 'Engines Chained', value: `${intel.enginesCrossReferenced}`, icon: Layers, color: '#06b6d4' },
          {
            label: 'Critical Actions',
            value: `${intel.nexusInsights.filter(n => n.priority === 'critical').length}`,
            icon: AlertTriangle,
            color: '#ef4444',
          },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)',
            borderRadius: 10,
            padding: '14px 16px',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <kpi.icon size={14} style={{ color: kpi.color }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {kpi.label}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {['all', 'critical', 'high', 'medium', 'low'].map(p => (
          <button
            key={p}
            onClick={() => setFilterPriority(p)}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 6,
              background: filterPriority === p ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${filterPriority === p ? 'rgba(99,102,241,0.4)' : 'var(--border-subtle)'}`,
              color: filterPriority === p ? '#818cf8' : 'var(--text-muted)',
              cursor: 'pointer', textTransform: 'capitalize',
            }}
          >
            {p} {p !== 'all' && `(${intel.nexusInsights.filter(n => n.priority === p).length})`}
          </button>
        ))}
      </div>

      {/* Insight Cards */}
      {insights.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48,
          background: 'var(--bg-card)', borderRadius: 12,
          border: '1px solid var(--border-subtle)',
        }}>
          <Target size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <div style={{ fontSize: 15, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {filterPriority === 'all'
              ? 'No cross-engine insights detected yet'
              : `No ${filterPriority} priority insights`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Add more financial data — income, expenses, entities — to unlock compound optimization opportunities.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} onNavigate={navigate} />
          ))}
        </div>
      )}

      {/* Quick actions */}
      {intel.nexusInsights.length > 0 && (
        <div style={{
          marginTop: 24, padding: 16,
          background: 'rgba(99,102,241,0.05)',
          borderRadius: 10,
          border: '1px solid rgba(99,102,241,0.15)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Zap size={18} style={{ color: '#818cf8' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              Top Priority: {intel.nexusInsights[0].title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Start here for maximum impact — ${intel.nexusInsights[0].impact.toLocaleString()} potential savings
            </div>
          </div>
          {intel.topPriorityAction && (
            <button
              onClick={() => navigate(intel.topPriorityAction!.view as ViewKey)}
              style={{
                fontSize: 12, padding: '8px 16px', borderRadius: 8,
                background: 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)',
                color: '#818cf8', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {intel.topPriorityAction.label} <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      <RelatedViews currentView="nexus" />
    </div>
  )
}

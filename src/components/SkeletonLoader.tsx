/**
 * FORTUNA ENGINE — Skeleton Loading Components
 * Shimmer placeholders for every view type during data loading.
 */

import { type CSSProperties } from 'react'

// ─── Base Skeleton ──────────────────────────────────────────────────

function Bone({ width, height = 14, radius = 6, style }: {
  width: string | number; height?: number; radius?: number; style?: CSSProperties
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  )
}

// ─── Skeleton Patterns ──────────────────────────────────────────────

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{
      padding: 20, borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
    }}>
      <Bone width="40%" height={12} style={{ marginBottom: 14 }} />
      <Bone width="60%" height={28} radius={8} style={{ marginBottom: 16 }} />
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} width={`${70 + Math.random() * 25}%`} height={10} style={{ marginBottom: 8 }} />
      ))}
    </div>
  )
}

export function SkeletonKPI() {
  return (
    <div style={{
      padding: 20, borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Bone width={80} height={10} />
        <Bone width={24} height={24} radius={6} />
      </div>
      <Bone width={120} height={32} radius={8} style={{ marginBottom: 8 }} />
      <Bone width={90} height={10} />
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px', background: 'var(--bg-elevated)' }}>
        {Array.from({ length: cols }, (_, i) => (
          <Bone key={i} width={`${100 / cols}%`} height={10} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          {Array.from({ length: cols }, (_, c) => (
            <Bone key={c} width={`${60 + Math.random() * 35}%`} height={10} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div style={{
      height, borderRadius: 14, background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'flex-end', gap: 8, padding: '20px 20px 20px',
    }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ flex: 1 }}>
          <Bone width="100%" height={30 + Math.random() * (height - 80)} radius={4} />
        </div>
      ))}
    </div>
  )
}

// ─── Dashboard Skeleton ─────────────────────────────────────────────

export function SkeletonDashboard() {
  return (
    <div role="status" aria-label="Loading dashboard" style={{ padding: 4 }}>
      <span className="sr-only">Loading dashboard...</span>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI />
      </div>
      {/* Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <SkeletonChart height={240} />
        <SkeletonCard lines={5} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  )
}

// ─── Generic View Skeleton ──────────────────────────────────────────

export function SkeletonView({ type = 'cards' }: { type?: 'cards' | 'table' | 'detail' }) {
  return (
    <div role="status" aria-label="Loading content" style={{ padding: 4 }}>
      <span className="sr-only">Loading...</span>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Bone width={200} height={24} radius={8} style={{ marginBottom: 10 }} />
        <Bone width={340} height={12} />
      </div>

      {type === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
          <SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} />
        </div>
      )}

      {type === 'table' && <SkeletonTable rows={8} cols={5} />}

      {type === 'detail' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <SkeletonCard lines={6} />
            <div style={{ marginTop: 14 }}><SkeletonChart /></div>
          </div>
          <div>
            <SkeletonCard lines={8} />
          </div>
        </div>
      )}
    </div>
  )
}

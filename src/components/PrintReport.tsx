/**
 * FORTUNA ENGINE — Print Report Wrapper (Phase 2 UX Fix)
 *
 * Wraps any view content in a print-friendly layout with
 * Fortuna branding, page headers/footers, and proper formatting.
 */

import { type ReactNode } from 'react'
import { Printer } from 'lucide-react'

// ─── Print Button ───────────────────────────────────────────────────

export function PrintButton({ label = 'Print Report' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', borderRadius: 8,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-medium)',
        color: 'var(--text-secondary)',
        cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)',
        transition: 'all 0.2s',
      }}
      className="hide-print"
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--accent-gold)'
        e.currentTarget.style.color = 'var(--accent-gold)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border-medium)'
        e.currentTarget.style.color = 'var(--text-secondary)'
      }}
    >
      <Printer size={14} />
      {label}
    </button>
  )
}

// ─── Print Report Wrapper ───────────────────────────────────────────

interface PrintReportProps {
  title: string
  subtitle?: string
  date?: string
  children: ReactNode
}

export function PrintReport({ title, subtitle, date, children }: PrintReportProps) {
  const reportDate = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="print-report">
      {/* Print-only header */}
      <div className="print-only-header" style={{ display: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '2px solid #d4a843', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0c0e12' }}>Fortuna</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#666' }}>Financial Engine</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0c0e12' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{subtitle}</div>}
            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Generated {reportDate}</div>
          </div>
        </div>
      </div>

      {children}

      {/* Print-only footer */}
      <div className="print-only-footer" style={{ display: 'none' }}>
        <div style={{ borderTop: '1px solid #ddd', paddingTop: 12, marginTop: 40, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#999' }}>
          <span>Fortuna Financial Engine — For informational purposes only. Not tax advice.</span>
          <span>{reportDate}</span>
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        @media print {
          .print-only-header,
          .print-only-footer { display: block !important; }
          .hide-print { display: none !important; }
          
          .print-report {
            color: #000 !important;
            background: #fff !important;
            font-size: 11pt !important;
            line-height: 1.5 !important;
          }
          
          .print-report * {
            color: #000 !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          
          .print-report .metric-card,
          .print-report [class*="card"],
          .print-report [class*="panel"] {
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
            padding: 12px !important;
            margin-bottom: 12px !important;
          }
          
          .print-report .metric-value {
            font-size: 16pt !important;
          }
          
          .print-report table {
            border-collapse: collapse;
            width: 100%;
          }
          
          .print-report th,
          .print-report td {
            border: 1px solid #ddd;
            padding: 6px 10px;
            font-size: 10pt;
          }
          
          .print-report th {
            background: #f5f5f5 !important;
            font-weight: 600;
          }
          
          .print-report h1 { font-size: 18pt !important; }
          .print-report h2 { font-size: 14pt !important; }
          .print-report h3 { font-size: 12pt !important; }
          
          /* Page breaks */
          .print-report .page-break {
            page-break-before: always;
          }
          
          /* Hide interactive elements */
          .print-report button:not(.print-trigger),
          .print-report input,
          .print-report select,
          .print-report [class*="toggle"],
          .print-report [class*="slider"],
          .print-report [class*="tooltip"] {
            display: none !important;
          }
          
          /* Ensure charts are visible */
          .print-report svg { max-width: 100%; }
          
          @page {
            margin: 0.75in;
            size: letter;
          }
        }
      `}</style>
    </div>
  )
}

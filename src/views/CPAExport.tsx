import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { generateCPAExport, type CPAExportPackage } from '../engine/cpa-export'
import { FileText, Download, Copy, CheckCircle, ChevronDown, ChevronUp, Printer, Share2 } from 'lucide-react'

export function CPAExport() {
  const { state } = useFortuna()
  const [copied, setCopied] = useState(false)
  const [expandedSection, setExpandedSection] = useState<number | null>(0)

  const pkg = useMemo(() => {
    try {
      return generateCPAExport(state)
    } catch (err) {
      console.error('[Fortuna] CPA Export generation failed:', err)
      return {
        generatedDate: new Date().toISOString(),
        taxYear: new Date().getFullYear(),
        clientName: state.profile?.name || 'Client',
        filingStatus: state.profile?.filingStatus || 'single',
        state: state.profile?.state || 'N/A',
        sections: [{ title: 'ERROR', content: `Export generation failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please add some income data first.` }],
        rawText: 'Export generation failed. Please ensure you have income data entered.',
      } as CPAExportPackage
    }
  }, [state])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pkg.rawText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = pkg.rawText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePrint = () => {
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(`
        <html><head><title>Fortuna CPA Export - ${pkg.clientName}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; padding: 40px; max-width: 800px; margin: 0 auto; }
          pre { white-space: pre-wrap; word-wrap: break-word; }
          @media print { body { padding: 20px; } }
        </style></head>
        <body><pre>${pkg.rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>
      `)
      win.document.close()
      setTimeout(() => win.print(), 300)
    }
  }

  const handleDownload = () => {
    const blob = new Blob([pkg.rawText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fortuna-cpa-export-${pkg.taxYear}-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <FileText size={24} style={{ color: 'var(--accent-gold)' }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>
            CPA Export Package
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Professional tax preparation handoff for your CPA or accountant
        </p>
      </div>

      {/* Info Banner */}
      <div style={{
        padding: 16, background: 'var(--accent-gold-dim)', borderRadius: 12,
        border: '1px solid rgba(212,175,55,0.2)', marginBottom: 24,
        fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
      }}>
        This package summarizes your financial position, entity structure, tax estimates, strategy recommendations,
        and audit risk factors. Share it with your tax professional to streamline preparation and ensure
        all optimization opportunities are addressed.
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={handleCopy}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: copied ? 'rgba(16,185,129,0.1)' : 'var(--accent-gold-dim)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'rgba(212,175,55,0.3)'}`,
            color: copied ? '#10b981' : 'var(--accent-gold)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>

        <button
          onClick={handleDownload}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <Download size={16} /> Download .txt
        </button>

        <button
          onClick={handlePrint}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
        >
          <Printer size={16} /> Print
        </button>
      </div>

      {/* Meta */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'Client', value: pkg.clientName },
          { label: 'Tax Year', value: pkg.taxYear.toString() },
          { label: 'Filing Status', value: pkg.filingStatus },
          { label: 'State', value: pkg.state },
        ].map((m, i) => (
          <div key={i} style={{
            padding: 14, background: 'var(--bg-elevated)', borderRadius: 10,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {m.label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pkg.sections.map((section, i) => {
          const isExpanded = expandedSection === i
          return (
            <div key={i} style={{
              background: 'var(--bg-elevated)', borderRadius: 12,
              border: '1px solid var(--border-subtle)', overflow: 'hidden',
            }}>
              <button
                onClick={() => setExpandedSection(isExpanded ? null : i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '14px 18px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: 'var(--accent-gold-dim)', color: 'var(--accent-gold)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'left' }}>
                    {section.title}
                  </div>
                </div>
                {isExpanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
              </button>

              {isExpanded && (
                <div style={{
                  padding: '0 18px 18px', borderTop: '1px solid var(--border-subtle)',
                }}>
                  <pre style={{
                    fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
                    color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordWrap: 'break-word',
                    margin: '12px 0 0', padding: 16, background: 'var(--bg-primary)',
                    borderRadius: 8, overflow: 'auto',
                  }}>
                    {section.content}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Full Preview Toggle */}
      <details style={{ marginTop: 24 }}>
        <summary style={{
          cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600,
          padding: '10px 0',
        }}>
          View Full Raw Export
        </summary>
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
          color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordWrap: 'break-word',
          padding: 20, background: 'var(--bg-elevated)', borderRadius: 12,
          border: '1px solid var(--border-subtle)', maxHeight: 600, overflow: 'auto',
        }}>
          {pkg.rawText}
        </pre>
      </details>
    </div>
  )
}

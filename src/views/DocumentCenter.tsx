import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { getAvailableDocuments, type GeneratedDocument, type DocumentTemplate } from '../engine/document-generator'
import {
  generateAIDocument, saveAIDocument, getAIDocuments, deleteAIDocument,
  AI_DOC_TEMPLATES, type GeneratedAIDocument, type DocGenStatus,
} from '../engine/ai-documents'
import { getAISettings } from '../engine/ai-providers'
import {
  FileText, Download, Printer, Eye, ChevronRight, FileCheck, Briefcase,
  Shield, Receipt, Sparkles, Loader2, Trash2, Clock, Bot, AlertTriangle,
} from 'lucide-react'

export function DocumentCenter() {
  const { state, updateState } = useFortuna()
  const [selectedDoc, setSelectedDoc] = useState<GeneratedDocument | null>(null)
  const [selectedAIDoc, setSelectedAIDoc] = useState<GeneratedAIDocument | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('ai')
  const [genStatus, setGenStatus] = useState<DocGenStatus>('idle')
  const [genError, setGenError] = useState<string | null>(null)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  // Hydrate from FortunaState (cloud), fall back to localStorage (migration)
  const [aiDocs, setAiDocsRaw] = useState<GeneratedAIDocument[]>(() => {
    const fromState = state.aiDocuments as GeneratedAIDocument[] | undefined
    return (fromState && fromState.length > 0) ? fromState : getAIDocuments()
  })
  const setAiDocs = useCallback((docs: GeneratedAIDocument[]) => {
    setAiDocsRaw(docs)
    updateState(s => ({ ...s, aiDocuments: docs }))
  }, [updateState])
  const previewRef = useRef<HTMLDivElement>(null)

  const templates = useMemo(() => getAvailableDocuments(state), [state])

  const categories = [
    { key: 'ai', label: 'AI Documents', icon: <Sparkles size={16} /> },
    { key: 'all', label: 'All Templates', icon: <FileText size={16} /> },
    { key: 'tax', label: 'Tax Documents', icon: <Receipt size={16} /> },
    { key: 'audit', label: 'Audit Prep', icon: <Shield size={16} /> },
    { key: 'cpa', label: 'CPA Package', icon: <Briefcase size={16} /> },
    { key: 'entity', label: 'Entity', icon: <FileCheck size={16} /> },
  ]

  const filtered = activeCategory === 'all' ? templates
    : activeCategory === 'ai' ? []
    : templates.filter(t => t.category === activeCategory)

  const activeDoc = selectedAIDoc || selectedDoc
  const activeContent = selectedAIDoc?.content || selectedDoc?.content || ''
  const activeTitle = selectedAIDoc?.title || selectedDoc?.title || ''

  const generateTemplateDoc = (template: DocumentTemplate) => {
    setSelectedAIDoc(null)
    const doc = template.generator(state)
    setSelectedDoc(doc)
  }

  const handleAIGenerate = useCallback(async (templateId: string) => {
    const settings = getAISettings()
    const hasDirectKey = settings.providers.some(p => p.apiKey)
    const hasProxy = settings.mode === 'proxy'
    if (!hasDirectKey && !hasProxy) {
      setGenError('No AI provider configured. Set up an API key in the AI Advisor settings, or log in to use server-side keys.')
      return
    }
    setGenError(null)
    setGeneratingId(templateId)
    setGenStatus('idle')
    try {
      const doc = await generateAIDocument(templateId, state, setGenStatus)
      saveAIDocument(doc)
      setAiDocs(getAIDocuments())
      setSelectedDoc(null)
      setSelectedAIDoc(doc)
      setGenStatus('complete')
    } catch (err: any) {
      setGenError(err.message || 'Document generation failed')
      setGenStatus('error')
    } finally {
      setGeneratingId(null)
    }
  }, [state])

  const viewAIDoc = (doc: GeneratedAIDocument) => { setSelectedDoc(null); setSelectedAIDoc(doc) }

  const removeAIDoc = (id: string) => {
    deleteAIDocument(id)
    setAiDocs(getAIDocuments())
    if (selectedAIDoc?.id === id) setSelectedAIDoc(null)
  }

  const handlePrint = () => {
    if (!activeContent) return
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><title>${activeTitle}</title><style>body{margin:24px}@media print{body{margin:0}}</style></head><body>${activeContent}</body></html>`)
      w.document.close(); w.print()
    }
  }

  const handleDownload = () => {
    if (!activeContent) return
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${activeTitle}</title></head><body>${activeContent}</body></html>`], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${activeTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`
    a.click(); URL.revokeObjectURL(url)
  }

  const typeLabels: Record<string, { label: string; color: string }> = {
    voucher: { label: 'VOUCHER', color: 'var(--accent-gold)' },
    checklist: { label: 'CHECKLIST', color: 'var(--accent-emerald)' },
    worksheet: { label: 'WORKSHEET', color: 'var(--accent-blue, #60a5fa)' },
    report: { label: 'REPORT', color: 'var(--accent-blue, #60a5fa)' },
    letter: { label: 'LETTER', color: 'var(--text-secondary)' },
  }

  const statusLabels: Record<DocGenStatus, string> = {
    idle: '', 'building-context': 'Analyzing financial data...', generating: 'AI is writing your document...', complete: 'Complete!', error: 'Generation failed',
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, display: 'flex', gap: 24, minHeight: 'calc(100vh - 64px)' }}>
      {/* Left: Document List */}
      <div style={{ width: activeDoc ? 380 : '100%', flexShrink: 0, transition: 'width 0.3s ease' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <FileText size={24} style={{ color: 'var(--accent-gold)' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>Document Center</h1>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Generate documents with AI or use templates for tax forms and checklists</p>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat.key} onClick={() => setActiveCategory(cat.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: activeCategory === cat.key ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              color: activeCategory === cat.key ? 'var(--accent-gold)' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
            }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {genError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', marginBottom: 12, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', fontSize: 12, color: '#fca5a5' }}>
            <AlertTriangle size={14} />
            <span style={{ flex: 1 }}>{genError}</span>
            <button onClick={() => setGenError(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* AI Document Templates */}
        {activeCategory === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Generate New</div>

            {AI_DOC_TEMPLATES.map(template => {
              const isGenerating = generatingId === template.id
              return (
                <button key={template.id} onClick={() => !isGenerating && handleAIGenerate(template.id)} disabled={isGenerating}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12,
                    border: '1px solid var(--border-subtle)', background: isGenerating ? 'rgba(245,158,11,0.06)' : 'var(--bg-elevated)',
                    cursor: isGenerating ? 'wait' : 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.2s', opacity: isGenerating ? 0.8 : 1,
                  }}
                  onMouseEnter={e => { if (!isGenerating) e.currentTarget.style.borderColor = 'var(--accent-gold)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
                    {isGenerating ? <Loader2 size={18} className="spin" style={{ color: 'var(--accent-gold)' }} /> : template.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{template.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{isGenerating ? statusLabels[genStatus] : template.description}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--accent-gold)', background: 'rgba(245,158,11,0.1)' }}>AI</span>
                    {!isGenerating && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                  </div>
                </button>
              )
            })}

            {/* Previously generated */}
            {aiDocs.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 16, marginBottom: 4 }}>
                  Previously Generated ({aiDocs.length})
                </div>
                {aiDocs.map(doc => (
                  <div key={doc.id} onClick={() => viewAIDoc(doc)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${selectedAIDoc?.id === doc.id ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                    background: selectedAIDoc?.id === doc.id ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                    <Bot size={14} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={9} />
                        {new Date(doc.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <span>•</span>
                        {doc.aiProvider}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); removeAIDoc(doc.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, opacity: 0.5 }} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Template Documents */}
        {activeCategory !== 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(template => {
              const typeInfo = typeLabels[template.type] || typeLabels.report
              return (
                <button key={template.id} onClick={() => generateTemplateDoc(template)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12,
                  border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
                  cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-gold)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${typeInfo.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={18} style={{ color: typeInfo.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{template.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{template.description}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: typeInfo.color, background: `${typeInfo.color}15` }}>{typeInfo.label}</span>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Right: Document Preview */}
      {activeDoc && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: '12px 12px 0 0', border: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {selectedAIDoc ? <Sparkles size={14} style={{ color: 'var(--accent-gold)' }} /> : <Eye size={14} style={{ color: 'var(--accent-gold)' }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{activeTitle}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                <Printer size={13} /> Print
              </button>
              <button onClick={handleDownload} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent-gold)', color: '#0c0e12', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                <Download size={13} /> Download
              </button>
            </div>
          </div>
          <div ref={previewRef} style={{ background: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '0 0 12px 12px', minHeight: 500, maxHeight: 'calc(100vh - 200px)', overflow: 'auto', padding: selectedAIDoc ? 24 : 0 }} dangerouslySetInnerHTML={{ __html: activeContent }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 4px', fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Generated: {new Date(selectedAIDoc?.generatedAt || selectedDoc?.generatedAt || '').toLocaleString()}</span>
            {selectedAIDoc?.tokensUsed && <span>{selectedAIDoc.tokensUsed.toLocaleString()} tokens</span>}
          </div>
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

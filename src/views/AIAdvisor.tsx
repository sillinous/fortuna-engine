import { useState, useRef, useEffect } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { buildSystemPrompt, buildConversationMessages } from '../engine/ai-context'
import { Storage, type AdvisorMessage } from '../engine/storage'
import {
  sendAIMessage, getAISettings, saveAISettings, getProviderIcon, getModelDisplayName,
  fetchServerProviders, DEFAULT_PROVIDERS,
  type AISettings, type ProviderId, type ProviderConfig,
} from '../engine/ai-providers'
import {
  Bot, Send, Sparkles, TrendingUp, Shield, DollarSign, Building2,
  Loader2, Trash2, HelpCircle, BookOpen, Target, PiggyBank,
  Wallet, ChevronRight, MessageSquare, Settings, X
} from 'lucide-react'

// ─── Query Categories ──────────────────────────────────────────────────

interface QueryCategory {
  id: string
  label: string
  icon: JSX.Element
  color: string
  queries: { label: string; query: string }[]
}

const QUERY_CATEGORIES: QueryCategory[] = [
  {
    id: 'strategy', label: 'Tax Strategy', icon: <DollarSign size={14} />, color: 'var(--accent-gold)',
    queries: [
      { label: 'Top 3 actions to reduce my taxes', query: 'What are my top 3 highest-impact actions to reduce my total tax bill? Show me the specific dollar savings for each.' },
      { label: 'Should I form an S-Corp?', query: 'Should I form an S-Corp? Walk me through the exact math — current SE tax vs. S-Corp FICA savings, minus compliance costs. Give me a clear yes/no recommendation.' },
      { label: 'Am I leaving deductions on the table?', query: 'Analyze my deductions and tell me what I\'m missing. What unclaimed deductions should I be taking and how much would each save me?' },
      { label: 'How to lower my effective rate', query: 'My effective tax rate is what it is — what specific strategies can bring it down, and by how many percentage points each?' },
    ],
  },
  {
    id: 'income', label: 'Income & Paycheck', icon: <Wallet size={14} />, color: 'var(--accent-emerald)',
    queries: [
      { label: 'Break down my paycheck', query: 'Walk me through exactly where every dollar of my paycheck goes — gross to net, including all deductions and taxes.' },
      { label: 'How much do I actually keep?', query: 'What\'s my effective keep rate — for every dollar I earn, how much actually ends up in my pocket after all taxes?' },
      { label: 'Am I withholding correctly?', query: 'Based on my W-2 withholding and total tax liability, am I on track for a refund or will I owe? Should I adjust my W-4?' },
      { label: 'Income diversification ideas', query: 'Based on my skills and current income profile, what additional revenue streams should I consider? What are the tax implications of each?' },
    ],
  },
  {
    id: 'entity', label: 'Business & Entity', icon: <Building2 size={14} />, color: 'var(--accent-purple)',
    queries: [
      { label: 'Compare my entity options', query: 'Compare sole prop vs LLC vs S-Corp vs C-Corp for my specific income level. Show me the total tax, compliance costs, and net benefit of each.' },
      { label: 'Entity compliance requirements', query: 'What are the ongoing compliance requirements for my current entities? Annual filings, deadlines, costs, and what happens if I miss them.' },
      { label: 'Reasonable salary for S-Corp', query: 'If I have or form an S-Corp, what would be a reasonable salary to set? What factors does the IRS look at?' },
      { label: 'Multi-entity strategy', query: 'Would it make sense to have multiple entities for my income streams? Walk me through the pros, cons, and optimal structure.' },
    ],
  },
  {
    id: 'retirement', label: 'Retirement & Savings', icon: <PiggyBank size={14} />, color: 'var(--accent-blue)',
    queries: [
      { label: 'Maximize retirement contributions', query: 'How can I maximize my retirement savings across all available vehicles? What\'s the total I can shelter from taxes this year?' },
      { label: 'SEP-IRA vs Solo 401(k)', query: 'Compare SEP-IRA vs Solo 401(k) for my situation. Which lets me contribute more and what are the tradeoffs?' },
      { label: 'Roth conversion strategy', query: 'Does a Roth conversion make sense for me? What income level makes it optimal and what\'s the tax cost?' },
      { label: 'How much do I need to retire?', query: 'Based on my current spending and income, how much do I need saved to retire comfortably? Am I on track?' },
    ],
  },
  {
    id: 'planning', label: 'Planning & Goals', icon: <Target size={14} />, color: '#f59e0b',
    queries: [
      { label: 'Complete financial health checkup', query: 'Give me a comprehensive financial health assessment. What\'s working well, what needs attention, and what\'s my action plan in priority order?' },
      { label: 'What if I earned 50% more?', query: 'If my income increased by 50%, how would my taxes change? What new brackets, phase-outs, or planning opportunities would apply?' },
      { label: 'Year-end tax planning', query: 'What year-end tax planning moves should I make before December 31? List them in priority order with deadlines and estimated savings.' },
      { label: 'Build a 12-month financial plan', query: 'Help me build a 12-month financial action plan. Monthly priorities, quarterly estimated taxes, annual deadlines, and growth targets.' },
    ],
  },
  {
    id: 'education', label: 'Learn & Understand', icon: <BookOpen size={14} />, color: '#ec4899',
    queries: [
      { label: 'Explain marginal vs effective rate', query: 'Explain the difference between my marginal and effective tax rate in plain English, using my actual numbers. Why does this matter for financial decisions?' },
      { label: 'How self-employment tax works', query: 'Walk me through exactly how self-employment tax works — the 92.35% calculation, the 15.3% rate, the deductible half, and how it stacks with income tax.' },
      { label: 'What is the QBI deduction?', query: 'Explain the QBI (Section 199A) deduction in simple terms. Do I qualify? How much am I getting and could I get more?' },
      { label: 'How depreciation saves taxes', query: 'Explain how Section 179 and bonus depreciation work. Can I use them? Give me a practical example with my income level.' },
    ],
  },
  {
    id: 'features', label: 'Using Fortuna', icon: <HelpCircle size={14} />, color: 'var(--text-muted)',
    queries: [
      { label: 'What can Fortuna do for me?', query: 'Give me a tour of all Fortuna Engine features and how each one can help my specific financial situation. What should I explore first?' },
      { label: 'How to set up my W-2 data', query: 'Walk me through how to correctly enter my W-2 information into Fortuna. What fields matter most and where do I find them on my W-2?' },
      { label: 'How to run what-if scenarios', query: 'How do I use the Scenario Modeler? What are the most valuable scenarios to run for my situation?' },
      { label: 'Is my data complete enough?', query: 'Look at what I\'ve entered so far and tell me what\'s missing. What additional data would unlock better analysis and recommendations?' },
    ],
  },
]

// ─── Quick Starts (no category selected) ───────────────────────────────

const QUICK_STARTS = [
  { icon: <DollarSign size={14} />, label: 'Top 3 tax savings actions', query: 'What are my top 3 highest-impact actions to reduce my total tax bill right now? Show specific dollar savings.' },
  { icon: <Sparkles size={14} />, label: 'Full financial health checkup', query: 'Give me a comprehensive financial health assessment — what\'s working, what needs attention, and prioritized action plan.' },
  { icon: <Building2 size={14} />, label: 'Should I restructure?', query: 'Should I change my business entity structure? Compare my current setup vs. alternatives with exact numbers.' },
  { icon: <HelpCircle size={14} />, label: 'What can Fortuna do?', query: 'Give me a tour of all Fortuna Engine features and tell me which ones are most valuable for my specific situation.' },
]

// ─── Component ─────────────────────────────────────────────────────────

export function AIAdvisor() {
  const { state, taxReport, strategies, risks, healthScore } = useFortuna()
  const [messages, setMessages] = useState<AdvisorMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [aiSettings, setAISettings] = useState<AISettings>(getAISettings)
  const [serverProviders, setServerProviders] = useState<ProviderConfig[] | null>(null)
  const [lastModel, setLastModel] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Storage.getAdvisorHistory().then(h => { if (h.length > 0) setMessages(h) })
    // Fetch server providers
    fetchServerProviders().then(r => {
      if (r?.providers?.length) setServerProviders(r.providers)
    })
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Get available providers based on mode
  const availableProviders: ProviderConfig[] = aiSettings.mode === 'proxy' && serverProviders
    ? serverProviders
    : DEFAULT_PROVIDERS

  const currentProvider = availableProviders.find(p => p.id === aiSettings.provider)

  const updateSettings = (partial: Partial<AISettings>) => {
    const updated = { ...aiSettings, ...partial }
    // If provider changed, reset model to provider's default
    if (partial.provider && partial.provider !== aiSettings.provider) {
      const prov = availableProviders.find(p => p.id === partial.provider)
      if (prov) updated.model = prov.defaultModel
    }
    setAISettings(updated)
    saveAISettings(updated)
  }

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMsg: AdvisorMessage = { role: 'user', content: content.trim(), timestamp: new Date().toISOString() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setActiveCategory(null)
    setIsLoading(true)

    try {
      const systemPrompt = await buildSystemPrompt(state)
      const conversationMessages = buildConversationMessages(
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        systemPrompt
      )

      const result = await sendAIMessage(
        conversationMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        systemPrompt,
        aiSettings,
      )

      setLastModel(`${getProviderIcon(result.provider)} ${getModelDisplayName(result.model)}`)

      const assistantMsg: AdvisorMessage = { role: 'assistant', content: result.text, timestamp: new Date().toISOString() }
      const final = [...updatedMessages, assistantMsg]
      setMessages(final)
      await Storage.saveAdvisorHistory(final.slice(-40))
    } catch (err: any) {
      console.error('AI Advisor error:', err)
      // Show error message or fallback
      const errorContent = err.message?.includes('API key')
        || err.message?.includes('not configured')
        || err.message?.includes('API not configured')
        ? `⚙️ **Setup Required**\n\n${err.message}\n\nClick the ⚙ icon in the header to configure your AI provider.`
        : buildFallback(taxReport, strategies, risks, healthScore)

      const fallback: AdvisorMessage = {
        role: 'assistant',
        content: errorContent,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, fallback])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const clearHistory = async () => { setMessages([]); await Storage.saveAdvisorHistory([]) }
  const hasData = state.incomeStreams.length > 0

  return (
    <div className="view-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 className="section-title">AI Financial Advisor</h1>
            <span className="pill gold"><Sparkles size={11} /> Full Context</span>
            {currentProvider && (
              <span className="pill" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', fontSize: 10 }}>
                {getProviderIcon(aiSettings.provider)} {getModelDisplayName(aiSettings.model)}
              </span>
            )}
          </div>
          <p className="section-subtitle">
            {hasData
              ? `Analyzing $${taxReport.grossIncome.toLocaleString()} income · ${strategies.length} strategies · Score: ${healthScore.overall}/100 — Ask anything about finances, taxes, business, or this tool`
              : 'Ask general financial questions, or set up your profile for personalized advice'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowSettings(!showSettings)} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
            <Settings size={11} /> AI Settings
          </button>
          {messages.length > 0 && (
            <button onClick={clearHistory} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
              <Trash2 size={11} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* AI Settings Panel */}
      {showSettings && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12,
          padding: 16, marginBottom: 16, position: 'relative',
        }}>
          <button onClick={() => setShowSettings(false)} style={{
            position: 'absolute', top: 8, right: 8, background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}><X size={14} /></button>
          
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            AI Provider Settings
          </h3>

          {/* Mode Toggle */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Connection Mode</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['proxy', 'direct'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => updateSettings({ mode })}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    border: aiSettings.mode === mode ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                    background: aiSettings.mode === mode ? 'rgba(251, 191, 36, 0.1)' : 'var(--bg-hover)',
                    color: aiSettings.mode === mode ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  }}
                >
                  {mode === 'proxy' ? '🔒 Server Proxy' : '🔑 Direct (Your Keys)'}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {aiSettings.mode === 'proxy'
                ? 'API keys stored securely on your server. Requires backend setup.'
                : 'API keys stored in your browser. No server needed — works standalone.'}
            </p>
          </div>

          {/* Provider Select */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Provider</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {availableProviders.map(p => (
                <button
                  key={p.id}
                  onClick={() => updateSettings({ provider: p.id })}
                  style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    border: aiSettings.provider === p.id ? '1px solid var(--accent-gold)' : '1px solid var(--border-subtle)',
                    background: aiSettings.provider === p.id ? 'rgba(251, 191, 36, 0.1)' : 'var(--bg-hover)',
                    color: aiSettings.provider === p.id ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  }}
                >
                  {getProviderIcon(p.id)} {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Model Select */}
          {currentProvider && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Model</label>
              <select
                value={aiSettings.model}
                onChange={e => updateSettings({ model: e.target.value })}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                  background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', outline: 'none',
                }}
              >
                {currentProvider.models.map(m => (
                  <option key={m} value={m}>{getModelDisplayName(m)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Client API Key (direct mode only) */}
          {aiSettings.mode === 'direct' && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {currentProvider?.name || 'Provider'} API Key
              </label>
              <input
                type="password"
                placeholder={`Enter your ${aiSettings.provider} API key...`}
                value={aiSettings.clientKeys[aiSettings.provider] || ''}
                onChange={e => updateSettings({
                  clientKeys: { ...aiSettings.clientKeys, [aiSettings.provider]: e.target.value }
                })}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                  background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                Stored in your browser only. Never sent to our server.
              </p>
            </div>
          )}

          {lastModel && (
            <p style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
              Last response: {lastModel}
            </p>
          )}
        </div>
      )}

      {/* Chat Area */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 16 }}>

        {/* Welcome State */}
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, marginBottom: 16,
              background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(212,168,67,0.3)',
            }}>
              <Bot size={28} color="#0c0e12" />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6, color: 'var(--text-primary)' }}>
              Your Financial Intelligence System
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 520, textAlign: 'center', marginBottom: 24 }}>
              Ask anything — tax strategy, business structure, paycheck questions, retirement, how to use Fortuna features, financial concepts, or guidance on improving your situation.
            </p>

            {/* Category Chips */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16, maxWidth: 600 }}>
              {QUERY_CATEGORIES.map(cat => (
                <button key={cat.id}
                  onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${activeCategory === cat.id ? cat.color : 'var(--border-subtle)'}`,
                    background: activeCategory === cat.id ? `${cat.color}15` : 'var(--bg-surface)',
                    color: activeCategory === cat.id ? cat.color : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Category Queries */}
            {activeCategory ? (
              <div style={{ width: '100%', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {QUERY_CATEGORIES.find(c => c.id === activeCategory)?.queries.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q.query)}
                    className="hover-border-gold"
                    style={{
                      padding: '10px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color 0.2s',
                    }}>
                    <MessageSquare size={12} color="var(--accent-gold)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{q.label}</span>
                    <ChevronRight size={12} color="var(--text-muted)" />
                  </button>
                ))}
              </div>
            ) : (
              /* Quick Starts Grid */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxWidth: 600, width: '100%' }}>
                {QUICK_STARTS.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q.query)}
                    className="hover-border-gold"
                    style={{
                      padding: '12px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.2s',
                    }}>
                    <div style={{ color: 'var(--accent-gold)' }}>{q.icon}</div>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            maxWidth: msg.role === 'user' ? '75%' : '100%',
            marginLeft: msg.role === 'user' ? 'auto' : 0,
          }}>
            {msg.role === 'assistant' && (
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={16} color="#0c0e12" />
              </div>
            )}
            <div style={{
              background: msg.role === 'user' ? 'var(--accent-gold-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(212,168,67,0.2)' : 'var(--border-subtle)'}`,
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              padding: '16px 20px', fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)',
            }}>
              {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
            </div>
          </div>
        ))}

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-gold), #b8912e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={16} color="#0c0e12" />
            </div>
            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: '14px 14px 14px 4px', padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={14} color="var(--accent-gold)" className="spin" />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analyzing your financial data...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Follow-up suggestions */}
      {messages.length > 0 && messages.length < 10 && !isLoading && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {getFollowUps(messages).map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)} className="btn btn-ghost"
              style={{ fontSize: 11, padding: '4px 10px' }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-medium)',
        borderRadius: 14, padding: '12px 16px',
      }}>
        <input ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Ask about taxes, business, retirement, Fortuna features, or anything financial..."
          disabled={isLoading}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontSize: 14,
            opacity: isLoading ? 0.5 : 1,
          }} />
        <button onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()} className="btn btn-primary"
          style={{ padding: '8px 14px', borderRadius: 10, opacity: isLoading || !input.trim() ? 0.5 : 1 }}>
          {isLoading ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .hover-border-gold:hover { border-color: var(--accent-gold-glow) !important; }
      `}</style>
    </div>
  )
}

// ─── Markdown Renderer ─────────────────────────────────────────────────

function renderContent(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('### '))
      return <div key={i} style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, marginTop: 12, marginBottom: 4 }}>{renderInline(line.slice(4))}</div>
    if (line.startsWith('## '))
      return <div key={i} style={{ fontWeight: 600, color: 'var(--accent-gold)', fontSize: 15, marginTop: 16, marginBottom: 6, fontFamily: 'var(--font-display)' }}>{renderInline(line.slice(3))}</div>

    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* '))
      return <div key={i} style={{ paddingLeft: 16, position: 'relative', marginBottom: 4 }}>
        <span style={{ position: 'absolute', left: 0, color: 'var(--accent-gold)' }}>•</span>
        {renderInline(line.replace(/^[-•*]\s*/, ''))}
      </div>

    if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^\d+/)?.[0]
      return <div key={i} style={{ paddingLeft: 24, position: 'relative', marginBottom: 6 }}>
        <span style={{ position: 'absolute', left: 0, color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12 }}>{num}.</span>
        {renderInline(line.replace(/^\d+\.\s*/, ''))}
      </div>
    }

    if (line.trim() === '---' || line.trim().startsWith('═'))
      return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' }} />
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />
    return <div key={i} style={{ marginBottom: 4 }}>{renderInline(line)}</div>
  })
}

function renderInline(text: string): React.ReactNode {
  const segments: React.ReactNode[] = []
  let remaining = text
  let key = 0

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/)
    const codeMatch = remaining.match(/`(.*?)`/)
    const dollarMatch = remaining.match(/\$[\d,]+(?:\.\d{2})?(?:\/\w+)?/)

    const matches = [
      boldMatch ? { type: 'bold' as const, match: boldMatch, index: boldMatch.index! } : null,
      codeMatch ? { type: 'code' as const, match: codeMatch, index: codeMatch.index! } : null,
      dollarMatch ? { type: 'dollar' as const, match: dollarMatch, index: dollarMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index)

    if (matches.length === 0) { segments.push(remaining); break }
    const first = matches[0]!
    if (first.index > 0) segments.push(remaining.slice(0, first.index))

    if (first.type === 'bold') {
      segments.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{first.match![1]}</strong>)
    } else if (first.type === 'code') {
      segments.push(<code key={key++} style={{ background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{first.match![1]}</code>)
    } else {
      segments.push(<span key={key++} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-gold)' }}>{first.match![0]}</span>)
    }
    remaining = remaining.slice(first.index + first.match![0].length)
  }

  return segments.length <= 1 ? (segments[0] ?? '') : <>{segments}</>
}

// ─── Follow-up Suggestions ────────────────────────────────────────────

function getFollowUps(messages: AdvisorMessage[]): string[] {
  const last = [...messages].reverse().find(m => m.role === 'assistant')?.content.toLowerCase() || ''
  const out: string[] = []

  if (last.includes('s-corp') || last.includes('entity')) {
    out.push('What are the S-Corp compliance costs?')
    out.push('How do I make the S-Corp election?')
  }
  if (last.includes('retirement') || last.includes('401k') || last.includes('sep-ira'))
    out.push('What\'s my max contribution this year?')
  if (last.includes('deduction') || last.includes('home office'))
    out.push('What records do I need to keep?')
  if (last.includes('quarterly') || last.includes('estimated'))
    out.push('How much should my quarterly payments be?')
  if (last.includes('marginal') || last.includes('bracket'))
    out.push('Where are my rate danger zones?')
  if (last.includes('goal') || last.includes('target'))
    out.push('Build me a monthly action plan')
  if (last.includes('fortuna') || last.includes('feature'))
    out.push('Which feature should I try first?')

  if (out.length < 2) {
    out.push('What else should I know?')
    out.push('What\'s the single most impactful thing I should do next?')
  }
  return out.slice(0, 3)
}

// ─── Fallback Response ────────────────────────────────────────────────

function buildFallback(taxReport: any, strategies: any[], risks: any[], healthScore: any): string {
  return `I encountered an error connecting to the AI service, but here's what your pre-computed analysis shows:

**Financial Health Score: ${healthScore.overall}/100 (Grade: ${healthScore.grade})**

**Key Numbers:**
- Gross Income: $${taxReport.grossIncome.toLocaleString()}
- Total Tax: $${taxReport.totalTax.toLocaleString()}
- Effective Rate: ${(taxReport.effectiveRate * 100).toFixed(1)}%
- After-Tax Income: $${taxReport.afterTaxIncome.toLocaleString()}
- Identified Savings: $${taxReport.identifiedSavings.toLocaleString()}

**Top Strategies:**
${strategies.slice(0, 5).map((s: any, i: number) => `${i + 1}. **${s.title}** — ${s.impactLabel} (${s.priority})\n   ${s.description}`).join('\n\n')}

**Key Risks:**
${risks.slice(0, 3).map((r: any) => `- [${r.severity.toUpperCase()}] ${r.name}: ${r.description}`).join('\n')}

Try your question again in a moment. In the meantime, explore **Deduction Finder**, **Scenario Modeler**, and **Marginal Rates** views for immediate insights.`
}

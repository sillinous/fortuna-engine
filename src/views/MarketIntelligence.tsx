/**
 * Fortuna Engine — Market Intelligence View
 * Live macro-economic data, portfolio valuation, exchange rates,
 * and their direct impact on the user's tax situation.
 *
 * @view MarketIntelligence
 */

import { useState, useEffect, useCallback } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import { fetchMacroSnapshot, type MacroSnapshot } from '../engine/market-data'
import { fetchExchangeRates, type ExchangeRates } from '../engine/exchange-rates'
import { fetchQuotes, type StockQuote } from '../engine/stock-quotes'

export default function MarketIntelligence() {
  const { state, taxReport: report } = useFortuna()
  const [macro, setMacro] = useState<MacroSnapshot | null>(null)
  const [rates, setRates] = useState<ExchangeRates | null>(null)
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string>('')

  // Extract portfolio symbols from investments
  const portfolioSymbols = (state.investments || [])
    .map(i => i.symbol)
    .filter((s, i, a) => s && a.indexOf(s) === i)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [macroData, ratesData, quotesData] = await Promise.allSettled([
        fetchMacroSnapshot(),
        fetchExchangeRates('USD'),
        portfolioSymbols.length > 0 ? fetchQuotes(portfolioSymbols.slice(0, 10)) : Promise.resolve(new Map()),
      ])

      if (macroData.status === 'fulfilled') setMacro(macroData.value)
      if (ratesData.status === 'fulfilled' && ratesData.value) setRates(ratesData.value)
      if (quotesData.status === 'fulfilled') setQuotes(quotesData.value as Map<string, StockQuote>)

      setLastRefresh(new Date().toLocaleTimeString())
    } catch (err) {
      setError('Some data sources unavailable — showing cached data')
    }
    setLoading(false)
  }, [portfolioSymbols.length])

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-card)', borderRadius: 12,
    border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 16,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const,
    letterSpacing: '0.08em', marginBottom: 4,
  }

  const valueStyle: React.CSSProperties = {
    fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  }

  const smallValueStyle: React.CSSProperties = {
    fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  }

  const impactStyle = (positive: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '2px 8px', borderRadius: 4,
    background: positive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    color: positive ? '#22c55e' : '#ef4444',
    fontWeight: 500,
  })

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{
            fontSize: 22, fontWeight: 700, color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)', margin: 0,
          }}>
            📡 Market Intelligence
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Live data from Federal Reserve, Treasury, BLS — connected to your tax picture
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Updated {lastRefresh}
            </span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: loading ? 'var(--bg-hover)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
              border: 'none', color: loading ? 'var(--text-muted)' : '#0a0e1a', cursor: 'pointer',
            }}
          >
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f59e0b', marginBottom: 16,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Macro Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Fed Funds Rate */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Fed Funds Rate</div>
          <div style={valueStyle}>{macro?.fedFundsRate != null ? `${macro.fedFundsRate}%` : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Penalty rate: {macro?.underpaymentPenaltyRate != null ? `${macro.underpaymentPenaltyRate}%` : '~8%'}
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={impactStyle(macro?.underpaymentPenaltyRate != null && macro.underpaymentPenaltyRate < 8)}>
              {macro?.underpaymentPenaltyRate != null && macro.underpaymentPenaltyRate < 8 ? '↓ Lower penalty risk' : 'Current 2210 penalty rate'}
            </span>
          </div>
        </div>

        {/* Inflation */}
        <div style={sectionStyle}>
          <div style={labelStyle}>CPI Inflation (YoY)</div>
          <div style={valueStyle}>{macro?.inflationRate != null ? `${macro.inflationRate}%` : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            CPI Index: {macro?.cpiLatest?.toFixed(1) || '—'}
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={impactStyle((macro?.inflationRate || 3) > 3)}>
              {(macro?.inflationRate || 3) > 3 ? 'Brackets inflate faster' : 'Moderate bracket growth'}
            </span>
          </div>
        </div>

        {/* Treasury Rates */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Treasury Rates</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bills</div>
              <div style={smallValueStyle}>{macro?.treasuryBillRate?.toFixed(2) || '—'}%</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Notes</div>
              <div style={smallValueStyle}>{macro?.treasuryNoteRate?.toFixed(2) || '—'}%</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Bonds</div>
              <div style={smallValueStyle}>{macro?.treasuryBondRate?.toFixed(2) || '—'}%</div>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={impactStyle(true)}>
              I-Bond est: {macro?.iBondCompositeRate?.toFixed(2) || '—'}%
            </span>
          </div>
        </div>

        {/* Your Tax Context */}
        <div style={sectionStyle}>
          <div style={labelStyle}>Your Tax Context</div>
          <div style={valueStyle}>{(report.effectiveRate * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Effective rate on ${report.grossIncome.toLocaleString()} income
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={impactStyle(report.effectiveRate < 0.22)}>
              {report.effectiveRate < 0.22 ? 'Low bracket — Roth conversion window' : 'Standard bracket positioning'}
            </span>
          </div>
        </div>
      </div>

      {/* Tax Impact Analysis */}
      <div style={sectionStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>
          📊 How Markets Affect Your Tax Picture
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Estimated Payment Impact */}
          <div style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Estimated Payment Penalty Rate
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {macro?.underpaymentPenaltyRate != null ? (
                <>The IRS underpayment penalty rate is currently <strong>{macro.underpaymentPenaltyRate}%</strong> (fed funds rate + 3%).
                  {report.selfEmploymentTax > 5000 && ' With SE tax of $' + report.selfEmploymentTax.toLocaleString() + ', ensure quarterly payments are on track.'}
                </>
              ) : 'Loading real-time penalty rate...'}
            </div>
          </div>

          {/* Inflation & Brackets */}
          <div style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Inflation Impact on Tax Brackets
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {macro?.inflationRate != null ? (
                <>At {macro.inflationRate}% inflation, 2027 brackets will expand ~{macro.inflationRate.toFixed(1)}%.
                  Your {state.profile.filingStatus === 'married_joint' ? '24% bracket ceiling' : '22% bracket ceiling'} may
                  increase by ~${Math.round((macro.inflationRate / 100) * (state.profile.filingStatus === 'married_joint' ? 201050 : 100525)).toLocaleString()}.
                </>
              ) : 'Loading inflation data...'}
            </div>
          </div>

          {/* I-Bond Opportunity */}
          <div style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              I-Bond Rate (Tax-Deferred)
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {macro?.iBondCompositeRate != null ? (
                <>Estimated composite rate: <strong>{macro.iBondCompositeRate.toFixed(2)}%</strong>.
                  I-Bonds are tax-deferred (no state tax). At your {(report.effectiveRate * 100).toFixed(0)}% effective rate,
                  the after-tax yield beats savings accounts. $10K annual limit per person.
                </>
              ) : 'Loading I-Bond rate...'}
            </div>
          </div>

          {/* Treasury vs Tax-Exempt */}
          <div style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Treasury vs Muni Bond Analysis
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {macro?.treasuryNoteRate != null ? (
                <>T-Notes yield {macro.treasuryNoteRate.toFixed(2)}%. At your marginal rate,
                  the tax-equivalent muni yield threshold is {((macro.treasuryNoteRate) / (1 - report.effectiveRate)).toFixed(2)}%.
                  {report.effectiveRate > 0.22 && ' At your bracket, munis may offer better after-tax returns.'}
                </>
              ) : 'Loading treasury rates...'}
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Quotes (if investments exist) */}
      {quotes.size > 0 && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>
            📈 Portfolio Live Prices
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Symbol', 'Price', 'Change', 'Volume', '52W High', '52W Low'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(quotes.entries()).map(([symbol, quote]) => (
                  <tr key={symbol} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{symbol}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>${quote.price.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: quote.change >= 0 ? '#22c55e' : '#ef4444' }}>
                      {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {quote.volume?.toLocaleString() || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {quote.high52Week?.toFixed(2) || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      {quote.low52Week?.toFixed(2) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Exchange Rates */}
      {rates && (
        <div style={sectionStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>
            💱 Exchange Rates (USD Base)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 }}>
            {['EUR', 'GBP', 'CAD', 'JPY', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL', 'KRW', 'SGD'].map(currency => (
              <div key={currency} style={{
                padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 6, textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{currency}</div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  {rates.rates[currency]?.toFixed(currency === 'JPY' || currency === 'KRW' ? 1 : 4) || '—'}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
            Used for Form 1116 foreign tax credit calculations. Rates update every 6 hours.
          </p>
        </div>
      )}

      {/* Data Sources */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
        Sources: {macro?.sources.join(', ') || 'Federal Reserve (FRED), Bureau of Labor Statistics (BLS), Treasury Fiscal Data'}
        {rates && ', Open Exchange Rate API'}
        {quotes.size > 0 && ', Yahoo Finance'}
        {' · '}All data free & public · No API keys required for core data
      </div>
    </div>
  )
}

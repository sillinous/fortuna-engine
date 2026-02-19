import { useState, useMemo } from 'react'
import { useFortuna } from '../hooks/useFortuna'
import {
  compareRetirementVehicles,
  analyzeRothLadder,
  projectRetirement,
  type RetirementVehicle,
} from '../engine/retirement-optimizer'
import {
  PiggyBank, TrendingUp, ArrowRight, Shield, CheckCircle, XCircle,
  AlertTriangle, Info, ChevronDown,
} from 'lucide-react'

type Tab = 'vehicles' | 'roth' | 'projection'

export function RetirementOptimizer() {
  const { state, updateState } = useFortuna()
  const [activeTab, setActiveTab] = useState<Tab>('vehicles')
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null)

  // Initialize from persisted retirementAccounts if available
  const accounts = state.retirementAccounts || []
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0)
  const totalContrib = accounts.reduce((s, a) => s + (a.annualContribution || 0), 0)
  const tradAccounts = accounts.filter(a => ['traditional_401k', 'traditional_ira', 'solo_401k', 'sep_ira', 'simple_ira'].includes(a.type))
  const tradBal = tradAccounts.reduce((s, a) => s + (a.balance || 0), 0)

  const [currentBalance, _setCurrentBalance] = useState(totalBalance > 0 ? totalBalance : 50000)
  const [annualContribution, _setAnnualContribution] = useState(totalContrib > 0 ? totalContrib : 23500)
  const [tradBalance, setTradBalance] = useState(tradBal > 0 ? tradBal : 100000)
  const [retirementAge, setRetirementAge] = useState(65)
  const [returnRate, setReturnRate] = useState(7)

  // Persist balance/contribution changes back to state
  const setCurrentBalance = (v: number) => {
    _setCurrentBalance(v)
    if (accounts.length > 0) {
      // Scale balances proportionally
      const ratio = totalBalance > 0 ? v / totalBalance : 1
      updateState(s => ({
        ...s,
        retirementAccounts: (s.retirementAccounts || []).map(a => ({ ...a, balance: Math.round(a.balance * ratio) })),
      }))
    }
  }
  const setAnnualContribution = (v: number) => {
    _setAnnualContribution(v)
    if (accounts.length > 0) {
      const ratio = totalContrib > 0 ? v / totalContrib : 1
      updateState(s => ({
        ...s,
        retirementAccounts: (s.retirementAccounts || []).map(a => ({ ...a, annualContribution: Math.round(a.annualContribution * ratio) })),
      }))
    }
  }

  const comparison = useMemo(() => compareRetirementVehicles(state), [state])
  const rothLadder = useMemo(() => analyzeRothLadder(state, tradBalance, retirementAge), [state, tradBalance, retirementAge])
  const projection = useMemo(() => projectRetirement(state, currentBalance, annualContribution, returnRate / 100, retirementAge), [state, currentBalance, annualContribution, returnRate, retirementAge])

  const card: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 24 }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: active ? 'var(--accent-gold-dim)' : 'transparent',
    color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
    cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13,
    fontWeight: active ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6,
  })
  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-medium)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)', fontSize: 13, width: 120,
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>
          Retirement Optimizer
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Compare vehicles, model Roth conversions, and project retirement income — all personalized to your financial profile.
        </p>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Max Contribution', value: `$${comparison.totalMaxContribution.toLocaleString()}`, sub: 'across all vehicles', color: 'var(--accent-gold)' },
          { label: 'Tax Deduction', value: `$${comparison.totalTaxDeduction.toLocaleString()}`, sub: 'this year', color: 'var(--accent-emerald)' },
          { label: 'Projected Balance', value: `$${(projection.retirementBalance / 1000).toFixed(0)}K`, sub: `at age ${retirementAge}`, color: 'var(--accent-blue)' },
          { label: 'Monthly Income', value: `$${projection.totalWithSS.toLocaleString()}`, sub: 'w/ Social Security', color: 'var(--accent-purple)' },
        ].map((m, i) => (
          <div key={i} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 12, padding: 16, textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
        <button style={tabBtn(activeTab === 'vehicles')} onClick={() => setActiveTab('vehicles')}>
          <PiggyBank size={14} /> Vehicle Comparison
        </button>
        <button style={tabBtn(activeTab === 'roth')} onClick={() => setActiveTab('roth')}>
          <ArrowRight size={14} /> Roth Conversion Ladder
        </button>
        <button style={tabBtn(activeTab === 'projection')} onClick={() => setActiveTab('projection')}>
          <TrendingUp size={14} /> Retirement Projection
        </button>
      </div>

      {/* ═══ VEHICLES TAB ═══ */}
      {activeTab === 'vehicles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comparison.recommendedStrategy && (
            <div style={{
              padding: '12px 16px', borderRadius: 10,
              background: 'var(--accent-gold)10', border: '1px solid var(--accent-gold)22',
              fontSize: 12, color: 'var(--accent-gold)', lineHeight: 1.6,
            }}>
              <strong>Recommended:</strong> {comparison.recommendedStrategy}
            </div>
          )}

          {comparison.vehicles.map(vehicle => (
            <VehicleCard
              key={vehicle.type}
              vehicle={vehicle}
              expanded={expandedVehicle === vehicle.type}
              onToggle={() => setExpandedVehicle(expandedVehicle === vehicle.type ? null : vehicle.type)}
            />
          ))}
        </div>
      )}

      {/* ═══ ROTH LADDER TAB ═══ */}
      {activeTab === 'roth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...card, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Traditional IRA Balance</label>
              <input type="number" value={tradBalance} onChange={e => setTradBalance(Number(e.target.value))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target Retirement Age</label>
              <input type="number" value={retirementAge} onChange={e => setRetirementAge(Number(e.target.value))} style={inputStyle} />
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--accent-blue-dim)', border: '1px solid var(--accent-blue)22', fontSize: 12, color: 'var(--accent-blue)', lineHeight: 1.6 }}>
            {rothLadder.strategy}
          </div>

          {/* Savings highlight */}
          {rothLadder.taxSavingsVsLumpSum > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Ladder Tax', value: `$${rothLadder.totalTaxPaid.toLocaleString()}`, color: 'var(--accent-emerald)' },
                { label: 'Lump Sum Tax', value: `$${(rothLadder.totalConverted * 0.32).toLocaleString()}`, color: 'var(--accent-red)' },
                { label: 'You Save', value: `$${rothLadder.taxSavingsVsLumpSum.toLocaleString()}`, color: 'var(--accent-gold)' },
              ].map((m, i) => (
                <div key={i} style={{ ...card, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Year-by-year table */}
          {rothLadder.years.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16 }}>Conversion Schedule</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Year', 'Age', 'Convert', 'Tax', 'Rate', 'Cumulative', 'Withdrawable'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rothLadder.years.map(yr => (
                      <tr key={yr.year} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{yr.year}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{yr.age}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500 }}>${yr.convertAmount.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent-red)' }}>${yr.taxOnConversion.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>{(yr.marginalRate * 100).toFixed(0)}%</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent-gold)' }}>${yr.cumulativeConverted.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent-emerald)' }}>{yr.withdrawableYear}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ PROJECTION TAB ═══ */}
      {activeTab === 'projection' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Inputs */}
          <div style={{ ...card, display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {[
              { label: 'Current Balance', value: currentBalance, set: setCurrentBalance },
              { label: 'Annual Contribution', value: annualContribution, set: setAnnualContribution },
              { label: 'Return Rate %', value: returnRate, set: setReturnRate },
              { label: 'Retirement Age', value: retirementAge, set: setRetirementAge },
            ].map(inp => (
              <div key={inp.label}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{inp.label}</label>
                <input type="number" value={inp.value} onChange={e => inp.set(Number(e.target.value))} style={inputStyle} />
              </div>
            ))}
          </div>

          {/* Recommendation */}
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: projection.shortfall > 0 ? 'var(--accent-red-dim)' : 'var(--accent-emerald-dim)',
            border: `1px solid ${projection.shortfall > 0 ? 'var(--accent-red)' : 'var(--accent-emerald)'}22`,
            fontSize: 12, color: projection.shortfall > 0 ? 'var(--accent-red)' : 'var(--accent-emerald)',
            lineHeight: 1.6,
          }}>
            {projection.recommendation}
          </div>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Balance at Retirement', value: `$${(projection.retirementBalance / 1000).toFixed(0)}K`, color: 'var(--accent-gold)' },
              { label: '4% Withdrawal/Year', value: `$${projection.sustainableWithdrawal.toLocaleString()}`, color: 'var(--accent-blue)' },
              { label: 'Est. SS Monthly', value: `$${projection.socialSecurityEstimate.toLocaleString()}`, color: 'var(--accent-purple)' },
            ].map((m, i) => (
              <div key={i} style={{ ...card, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 600, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Growth chart (SVG bar chart) */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16 }}>Balance Over Time</div>
            <GrowthChart years={projection.years} retirementAge={retirementAge} />
          </div>

          {/* Year-by-year (condensed, every 5 years) */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16 }}>Milestone Years</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projection.years.filter((_, i) => i % 5 === 0 || projection.years[i]?.age === retirementAge).map(yr => (
                <div key={yr.year} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                  borderRadius: 8, background: yr.age === retirementAge ? 'var(--accent-gold-dim)' : 'var(--bg-primary)',
                }}>
                  <span style={{ fontSize: 13, color: yr.age === retirementAge ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                    Age {yr.age} ({yr.year})
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    ${(yr.balance / 1000).toFixed(0)}K
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===================================================================
//  VEHICLE CARD
// ===================================================================

function VehicleCard({ vehicle, expanded, onToggle }: {
  vehicle: RetirementVehicle; expanded: boolean; onToggle: () => void
}) {
  const eligColor = vehicle.eligibility === 'eligible' ? 'var(--accent-emerald)' : vehicle.eligibility === 'income_limited' ? 'var(--accent-gold)' : 'var(--accent-red)'

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 14, overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: 20, background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'var(--font-body)', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 6, height: 40, borderRadius: 3,
            background: vehicle.priority >= 7 ? 'var(--accent-gold)' : vehicle.priority >= 5 ? 'var(--accent-blue)' : 'var(--border-subtle)',
          }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{vehicle.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Max: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-gold)' }}>${vehicle.maxContribution.toLocaleString()}</span>
              {vehicle.taxDeductionNow > 0 && <> · Deduction: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>${vehicle.taxDeductionNow.toLocaleString()}</span></>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ padding: '4px 10px', borderRadius: 6, background: eligColor + '18', color: eligColor, fontSize: 11, fontWeight: 600 }}>
            {vehicle.eligibility === 'eligible' ? 'Eligible' : vehicle.eligibility === 'income_limited' ? 'Limited' : 'Ineligible'}
          </span>
          <ChevronDown size={14} color="var(--text-muted)" style={{ transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }} />
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, marginBottom: 16, lineHeight: 1.5 }}>
            {vehicle.eligibilityNote}
          </div>

          {/* Tax features */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Deduction Now', active: vehicle.taxDeductionNow > 0 },
              { label: 'Tax-Free Growth', active: vehicle.taxFreeGrowth },
              { label: 'Tax-Free Withdrawal', active: vehicle.taxFreeWithdrawal },
            ].map(f => (
              <div key={f.label} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                borderRadius: 6, background: 'var(--bg-primary)', fontSize: 11,
                color: f.active ? 'var(--accent-emerald)' : 'var(--text-muted)',
              }}>
                {f.active ? <CheckCircle size={12} /> : <XCircle size={12} />}
                {f.label}
              </div>
            ))}
          </div>

          {/* Contribution breakdown */}
          {vehicle.employeeContribution > 0 && vehicle.employerContribution > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-primary)', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Employee</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>${vehicle.employeeContribution.toLocaleString()}</div>
              </div>
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-primary)', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Employer</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>${vehicle.employerContribution.toLocaleString()}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: 6 }}>Pros</div>
              {vehicle.pros.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 2 }}>✓ {p}</div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 600, marginBottom: 6 }}>Cons</div>
              {vehicle.cons.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 2 }}>✗ {c}</div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent-gold)', marginTop: 12 }}>Best for: {vehicle.bestFor}</div>
        </div>
      )}
    </div>
  )
}

// ===================================================================
//  GROWTH CHART SVG
// ===================================================================

function GrowthChart({ years, retirementAge }: { years: { age: number; balance: number }[]; retirementAge: number }) {
  if (years.length < 2) return null
  const W = 700, H = 200, P = 40
  const maxBal = Math.max(...years.map(y => y.balance), 1)
  const retIdx = years.findIndex(y => y.age === retirementAge)

  return (
    <svg viewBox={`0 0 ${W + P * 2} ${H + P * 2}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = P + H - pct * H
        return (
          <g key={pct}>
            <line x1={P} y1={y} x2={P + W} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
            <text x={P - 8} y={y + 4} textAnchor="end" fill="var(--text-muted)" fontSize="10" fontFamily="var(--font-mono)">
              ${(maxBal * pct / 1000).toFixed(0)}K
            </text>
          </g>
        )
      })}

      {/* Retirement line */}
      {retIdx > 0 && (
        <>
          <line
            x1={P + (retIdx / (years.length - 1)) * W}
            y1={P}
            x2={P + (retIdx / (years.length - 1)) * W}
            y2={P + H}
            stroke="var(--accent-gold)"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          <text
            x={P + (retIdx / (years.length - 1)) * W}
            y={P - 6}
            textAnchor="middle"
            fill="var(--accent-gold)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            Retire
          </text>
        </>
      )}

      {/* Area fill */}
      <defs>
        <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M${P},${P + H} ${years.map((y, i) => `L${P + (i / (years.length - 1)) * W},${P + H - (y.balance / maxBal) * H}`).join(' ')} L${P + W},${P + H} Z`}
        fill="url(#balGrad)"
      />

      {/* Line */}
      <path
        d={years.map((y, i) => `${i === 0 ? 'M' : 'L'}${P + (i / (years.length - 1)) * W},${P + H - (y.balance / maxBal) * H}`).join(' ')}
        fill="none"
        stroke="var(--accent-gold)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Age labels */}
      {years.filter((_, i) => i % Math.max(1, Math.floor(years.length / 8)) === 0).map((y, i, arr) => (
        <text
          key={y.age}
          x={P + (years.indexOf(y) / (years.length - 1)) * W}
          y={P + H + 16}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize="10"
          fontFamily="var(--font-mono)"
        >
          {y.age}
        </text>
      ))}
    </svg>
  )
}

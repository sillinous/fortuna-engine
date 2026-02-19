/**
 * Fortuna Engine v5 - Document Generator
 * Generates ready-to-use tax documents, checklists, and CPA handoff packages.
 * The "last mile" — turns insights into actionable paperwork.
 */

import type { FortunaState } from './storage'
import { generateTaxReport, type TaxReport, calculateMaxSEPIRA, calculateMaxSolo401k, calculateSCorpSavings } from './tax-calculator'
import { generateProactiveAlerts } from './proactive-intelligence'
import { detectStrategies, analyzeRisks, calculateHealthScore } from './strategy-detector'

// ==================== Types ====================

export interface GeneratedDocument {
  id: string
  title: string
  type: 'voucher' | 'checklist' | 'worksheet' | 'report' | 'letter'
  category: 'tax' | 'entity' | 'audit' | 'planning' | 'cpa'
  content: string // HTML or markdown content
  generatedAt: string
  applicableYear: number
}

// ==================== 1040-ES Estimated Tax Voucher ====================

export function generate1040ES(state: FortunaState, quarter: 1 | 2 | 3 | 4): GeneratedDocument {
  const report = generateTaxReport(state)
  const year = new Date().getFullYear()
  const quarterlyAmount = Math.round(report.totalFederalTax / 4)
  
  const dueDates: Record<number, string> = {
    1: `April 15, ${year}`,
    2: `June 15, ${year}`,
    3: `September 15, ${year}`,
    4: `January 15, ${year + 1}`,
  }
  
  const content = `
<div style="font-family: 'Courier New', monospace; max-width: 720px; padding: 32px; background: #fff; color: #111;">
  <div style="text-align: center; border-bottom: 3px double #333; padding-bottom: 16px; margin-bottom: 24px;">
    <div style="font-size: 11px; letter-spacing: 2px;">DEPARTMENT OF THE TREASURY</div>
    <div style="font-size: 11px; letter-spacing: 2px;">INTERNAL REVENUE SERVICE</div>
    <div style="font-size: 18px; font-weight: bold; margin-top: 8px;">Form 1040-ES — Estimated Tax Payment Voucher</div>
    <div style="font-size: 14px; margin-top: 4px;">Quarter ${quarter} — Tax Year ${year}</div>
  </div>
  
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
    <div>
      <div style="font-size: 11px; color: #666; text-transform: uppercase;">Taxpayer Name</div>
      <div style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding: 4px 0;">${state.profile.name || '[YOUR NAME]'}</div>
    </div>
    <div>
      <div style="font-size: 11px; color: #666; text-transform: uppercase;">Filing Status</div>
      <div style="font-size: 16px; border-bottom: 1px solid #ccc; padding: 4px 0;">${formatFilingStatus(state.profile.filingStatus)}</div>
    </div>
    <div>
      <div style="font-size: 11px; color: #666; text-transform: uppercase;">State</div>
      <div style="font-size: 16px; border-bottom: 1px solid #ccc; padding: 4px 0;">${state.profile.state}</div>
    </div>
    <div>
      <div style="font-size: 11px; color: #666; text-transform: uppercase;">Due Date</div>
      <div style="font-size: 16px; font-weight: bold; border-bottom: 1px solid #ccc; padding: 4px 0; color: #c00;">${dueDates[quarter]}</div>
    </div>
  </div>
  
  <div style="background: #f8f8f8; border: 1px solid #ddd; padding: 20px; margin-bottom: 24px;">
    <div style="font-size: 14px; font-weight: bold; margin-bottom: 16px;">CALCULATION WORKSHEET</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr><td style="padding: 6px 0;">1. Estimated adjusted gross income</td><td style="text-align: right; font-family: monospace;">$${Math.round(report.agi).toLocaleString()}</td></tr>
      <tr><td style="padding: 6px 0;">2. Estimated deductions</td><td style="text-align: right; font-family: monospace;">$${Math.round(report.totalDeductions).toLocaleString()}</td></tr>
      <tr><td style="padding: 6px 0;">3. Estimated taxable income (1 - 2)</td><td style="text-align: right; font-family: monospace;">$${Math.round(report.taxableIncome).toLocaleString()}</td></tr>
      <tr><td style="padding: 6px 0;">4. Estimated income tax</td><td style="text-align: right; font-family: monospace;">$${Math.round(report.incomeTax).toLocaleString()}</td></tr>
      <tr><td style="padding: 6px 0;">5. Self-employment tax</td><td style="text-align: right; font-family: monospace;">$${Math.round(report.selfEmploymentTax).toLocaleString()}</td></tr>
      <tr style="border-top: 2px solid #333;"><td style="padding: 6px 0; font-weight: bold;">6. Total estimated tax (4 + 5)</td><td style="text-align: right; font-weight: bold; font-family: monospace;">$${Math.round(report.totalFederalTax).toLocaleString()}</td></tr>
      <tr style="background: #e8f5e9;"><td style="padding: 8px 0; font-weight: bold; font-size: 15px;">7. Quarterly payment (6 ÷ 4)</td><td style="text-align: right; font-weight: bold; font-size: 15px; font-family: monospace;">$${quarterlyAmount.toLocaleString()}</td></tr>
    </table>
  </div>
  
  <div style="border: 2px dashed #999; padding: 16px; margin-bottom: 24px; text-align: center;">
    <div style="font-size: 22px; font-weight: bold;">AMOUNT ENCLOSED: $${quarterlyAmount.toLocaleString()}</div>
    <div style="font-size: 12px; color: #666; margin-top: 8px;">Make check payable to "United States Treasury"</div>
    <div style="font-size: 12px; color: #666;">Write your SSN and "${year} Form 1040-ES" on check</div>
  </div>
  
  <div style="font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px;">
    <strong>Payment Options:</strong> IRS Direct Pay (irs.gov/payments) • EFTPS.gov • Mail to IRS with this voucher<br>
    <strong>Note:</strong> This is a Fortuna Engine calculation worksheet, not an official IRS form. Consult a tax professional for filing.
    <br><strong>Generated:</strong> ${new Date().toLocaleDateString()} by Fortuna Engine v5
  </div>
</div>`

  return {
    id: `1040es-q${quarter}-${year}`,
    title: `1040-ES Estimated Tax Voucher — Q${quarter} ${year}`,
    type: 'voucher',
    category: 'tax',
    content,
    generatedAt: new Date().toISOString(),
    applicableYear: year,
  }
}

// ==================== Audit Preparedness Checklist ====================

export function generateAuditChecklist(state: FortunaState): GeneratedDocument {
  const { deductions, incomeStreams, expenses, entities } = state
  const year = new Date().getFullYear()
  
  const hasSelfEmployment = incomeStreams.some(s => ['business', 'freelance'].includes(s.type) && s.isActive)
  const hasHomeOffice = deductions.some(d => d.category === 'home_office')
  const hasVehicle = deductions.some(d => d.category === 'vehicle')
  const hasCharitable = deductions.some(d => d.category === 'charitable')
  
  let sections: { title: string; items: { text: string; critical: boolean }[] }[] = []
  
  // Universal records
  sections.push({
    title: 'Universal Documentation',
    items: [
      { text: 'All W-2 forms from employers', critical: true },
      { text: 'All 1099 forms (1099-NEC, 1099-MISC, 1099-K, 1099-INT, 1099-DIV)', critical: true },
      { text: 'Copy of prior year tax return', critical: true },
      { text: 'Government-issued photo ID', critical: false },
      { text: 'Social Security cards for all household members', critical: false },
      { text: 'Bank statements for all accounts (12 months)', critical: true },
      { text: 'Credit card statements (12 months)', critical: false },
    ],
  })
  
  // Self-employment specific
  if (hasSelfEmployment) {
    sections.push({
      title: 'Self-Employment / Business Records',
      items: [
        { text: 'Profit & loss statement / income summary', critical: true },
        { text: 'Business bank account statements (12 months)', critical: true },
        { text: 'All business expense receipts organized by category', critical: true },
        { text: 'Contracts and invoices for all clients', critical: true },
        { text: 'Business license and EIN documentation', critical: false },
        { text: '1099-K from payment processors (Stripe, PayPal, Square)', critical: true },
        { text: 'Estimated tax payment records (1040-ES confirmations)', critical: true },
        { text: 'Business use documentation for any shared assets', critical: false },
      ],
    })
  }
  
  // Home office
  if (hasHomeOffice) {
    sections.push({
      title: 'Home Office Documentation',
      items: [
        { text: 'Floor plan or measurements showing office area vs total home', critical: true },
        { text: 'Photos of dedicated office space', critical: true },
        { text: 'Mortgage interest statement (Form 1098) or lease agreement', critical: true },
        { text: 'Property tax records', critical: false },
        { text: 'Utility bills (gas, electric, internet) for 12 months', critical: true },
        { text: 'Home insurance documentation', critical: false },
        { text: 'Repair/maintenance receipts for office area', critical: false },
      ],
    })
  }
  
  // Vehicle
  if (hasVehicle) {
    sections.push({
      title: 'Vehicle Expense Documentation',
      items: [
        { text: 'Mileage log with date, destination, purpose, and miles for each trip', critical: true },
        { text: 'Total miles driven during the year', critical: true },
        { text: 'Business miles vs personal miles breakdown', critical: true },
        { text: 'Gas receipts (if using actual expense method)', critical: false },
        { text: 'Vehicle repair and maintenance receipts', critical: false },
        { text: 'Vehicle insurance documentation', critical: false },
        { text: 'Lease agreement or loan documentation', critical: false },
      ],
    })
  }
  
  // Charitable
  if (hasCharitable) {
    sections.push({
      title: 'Charitable Contribution Documentation',
      items: [
        { text: 'Written acknowledgment from charity for donations over $250', critical: true },
        { text: 'Receipts for all cash contributions', critical: true },
        { text: 'Form 8283 for non-cash donations over $500', critical: true },
        { text: 'Qualified appraisal for non-cash items over $5,000', critical: true },
        { text: 'Bank statements or canceled checks showing donations', critical: false },
        { text: 'Verification of 501(c)(3) status for each organization', critical: false },
      ],
    })
  }
  
  // Entity-specific
  if (entities.filter(e => e.isActive).length > 0) {
    sections.push({
      title: 'Entity & Structure Documentation',
      items: [
        { text: 'Articles of organization/incorporation for each entity', critical: true },
        { text: 'Operating agreement / bylaws', critical: true },
        { text: 'EIN assignment letters', critical: true },
        { text: 'K-1 forms from any partnerships or S-Corps', critical: true },
        { text: 'Reasonable compensation documentation (S-Corp)', critical: entities.some(e => e.type === 'llc_scorp' || e.type === 'scorp') },
        { text: 'Board meeting minutes (if applicable)', critical: false },
        { text: 'Annual state filing receipts', critical: false },
      ],
    })
  }
  
  // Deductions
  sections.push({
    title: 'Deduction & Credit Documentation',
    items: [
      { text: 'Health insurance premium statements (Form 1095-A/B/C)', critical: true },
      { text: 'Retirement contribution statements (401k, IRA, SEP)', critical: true },
      { text: 'Student loan interest statement (Form 1098-E)', critical: false },
      { text: 'Mortgage interest statement (Form 1098)', critical: false },
      { text: 'State and local tax payment records', critical: false },
      { text: 'Education expense records (Form 1098-T)', critical: false },
      { text: 'Childcare expense records and provider information', critical: state.profile.dependents > 0 },
    ],
  })
  
  const content = `
<div style="font-family: -apple-system, sans-serif; max-width: 720px; padding: 32px; background: #fff; color: #111;">
  <div style="border-bottom: 3px solid #1a365d; padding-bottom: 16px; margin-bottom: 24px;">
    <div style="font-size: 24px; font-weight: bold; color: #1a365d;">Audit Preparedness Checklist</div>
    <div style="font-size: 14px; color: #666; margin-top: 4px;">Tax Year ${year - 1} • Generated ${new Date().toLocaleDateString()}</div>
    <div style="font-size: 13px; color: #888; margin-top: 2px;">Prepared for: ${state.profile.name || '[Taxpayer]'} • ${state.profile.state}</div>
  </div>
  
  ${sections.map(section => `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
        ${section.title}
      </div>
      ${section.items.map(item => `
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 6px 0; font-size: 13px;">
          <span style="width: 18px; height: 18px; border: 2px solid ${item.critical ? '#c53030' : '#a0aec0'}; border-radius: 3px; flex-shrink: 0; margin-top: 1px;"></span>
          <span style="${item.critical ? 'font-weight: 500;' : 'color: #4a5568;'}">${item.text}${item.critical ? ' <span style="color: #c53030; font-size: 11px;">CRITICAL</span>' : ''}</span>
        </div>
      `).join('')}
    </div>
  `).join('')}
  
  <div style="background: #fffbeb; border: 1px solid #f6e05e; padding: 16px; border-radius: 8px; margin-top: 24px;">
    <div style="font-weight: 600; color: #744210; margin-bottom: 8px;">⚠ Important Notes</div>
    <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #744210;">
      <li>Keep all records for at least 3 years from filing date (6 years for underreported income >25%)</li>
      <li>Digital copies of receipts are acceptable if legible</li>
      <li>Contemporaneous records (created at time of transaction) carry more weight than reconstructed ones</li>
      <li>CRITICAL items are most frequently requested in IRS examinations</li>
    </ul>
  </div>
  
  <div style="font-size: 11px; color: #a0aec0; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
    Generated by Fortuna Engine v5 • This checklist is for preparation purposes and does not constitute tax or legal advice
  </div>
</div>`

  return {
    id: `audit-checklist-${year}`,
    title: `Audit Preparedness Checklist — ${year - 1} Tax Year`,
    type: 'checklist',
    category: 'audit',
    content,
    generatedAt: new Date().toISOString(),
    applicableYear: year - 1,
  }
}

// ==================== CPA Handoff Package ====================

export function generateCPAPackage(state: FortunaState): GeneratedDocument {
  const report = generateTaxReport(state)
  const strategies = detectStrategies(state)
  const risks = analyzeRisks(state)
  const health = calculateHealthScore(state)
  const alerts = generateProactiveAlerts(state)
  const year = new Date().getFullYear()
  
  const { profile, incomeStreams, expenses, entities, deductions } = state
  const activeIncome = incomeStreams.filter(s => s.isActive)
  const activeEntities = entities.filter(e => e.isActive)
  
  const content = `
<div style="font-family: -apple-system, sans-serif; max-width: 800px; padding: 32px; background: #fff; color: #111;">
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a365d; padding-bottom: 16px; margin-bottom: 24px;">
    <div>
      <div style="font-size: 24px; font-weight: bold; color: #1a365d;">CPA Strategy Handoff Package</div>
      <div style="font-size: 14px; color: #666; margin-top: 4px;">Comprehensive Financial Analysis • Tax Year ${year}</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 13px; color: #888;">Prepared: ${new Date().toLocaleDateString()}</div>
      <div style="font-size: 13px; color: #888;">Fortuna Engine v5</div>
    </div>
  </div>
  
  <!-- Client Profile -->
  <div style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Client Profile</div>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 13px;">
      <div><span style="color: #718096;">Name:</span> <strong>${profile.name || '[Not Set]'}</strong></div>
      <div><span style="color: #718096;">State:</span> <strong>${profile.state}</strong></div>
      <div><span style="color: #718096;">Filing Status:</span> <strong>${formatFilingStatus(profile.filingStatus)}</strong></div>
      <div><span style="color: #718096;">Dependents:</span> <strong>${profile.dependents}</strong></div>
      <div><span style="color: #718096;">Age:</span> <strong>${profile.age}</strong></div>
      <div><span style="color: #718096;">Health Insurance:</span> <strong>${profile.hasHealthInsurance ? 'Yes' : 'No'}</strong></div>
    </div>
  </div>
  
  <!-- Financial Summary -->
  <div style="margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Financial Summary</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #edf2f7;"><td style="padding: 8px; font-weight: 500;">Total Gross Income</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(activeIncome.reduce((s, i) => s + i.annualAmount, 0)).toLocaleString()}</td></tr>
      <tr><td style="padding: 8px;">Adjusted Gross Income (AGI)</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(report.agi).toLocaleString()}</td></tr>
      <tr style="background: #edf2f7;"><td style="padding: 8px;">Total Deductions</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(report.totalDeductions).toLocaleString()}</td></tr>
      <tr><td style="padding: 8px;">Taxable Income</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(report.taxableIncome).toLocaleString()}</td></tr>
      <tr style="background: #edf2f7;"><td style="padding: 8px;">Federal Income Tax</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(report.incomeTax).toLocaleString()}</td></tr>
      <tr><td style="padding: 8px;">Self-Employment Tax</td><td style="text-align: right; padding: 8px; font-family: monospace;">$${Math.round(report.selfEmploymentTax).toLocaleString()}</td></tr>
      <tr style="background: #fff3cd; font-weight: bold;"><td style="padding: 10px;">Total Federal Tax Liability</td><td style="text-align: right; padding: 10px; font-family: monospace; font-size: 15px;">$${Math.round(report.totalFederalTax).toLocaleString()}</td></tr>
      <tr><td style="padding: 8px;">Effective Tax Rate</td><td style="text-align: right; padding: 8px; font-family: monospace;">${report.effectiveRate.toFixed(1)}%</td></tr>
      <tr style="background: #edf2f7;"><td style="padding: 8px;">Marginal Tax Rate</td><td style="text-align: right; padding: 8px; font-family: monospace;">${report.marginalRate}%</td></tr>
    </table>
  </div>
  
  <!-- Income Streams -->
  <div style="margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Income Streams (${activeIncome.length})</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #1a365d; color: white;"><th style="padding: 8px; text-align: left;">Source</th><th style="text-align: left; padding: 8px;">Type</th><th style="text-align: left; padding: 8px;">Entity</th><th style="text-align: right; padding: 8px;">Annual Amount</th></tr>
      ${activeIncome.map((s, i) => `
        <tr style="background: ${i % 2 ? '#f7fafc' : '#fff'};">
          <td style="padding: 8px;">${s.name}</td>
          <td style="padding: 8px;">${s.type.replace('_', ' ').toUpperCase()}</td>
          <td style="padding: 8px;">${s.entityId ? (entities.find(e => e.id === s.entityId)?.name || '—') : '—'}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace;">$${s.annualAmount.toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
  </div>
  
  <!-- Entity Structure -->
  ${activeEntities.length > 0 ? `
  <div style="margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Entity Structure (${activeEntities.length})</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #1a365d; color: white;"><th style="padding: 8px; text-align: left;">Entity</th><th style="text-align: left; padding: 8px;">Type</th><th style="text-align: left; padding: 8px;">State</th><th style="text-align: right; padding: 8px;">Annual Cost</th></tr>
      ${activeEntities.map((e, i) => `
        <tr style="background: ${i % 2 ? '#f7fafc' : '#fff'};">
          <td style="padding: 8px; font-weight: 500;">${e.name}</td>
          <td style="padding: 8px;">${e.type.replace('_', ' ').toUpperCase()}</td>
          <td style="padding: 8px;">${e.state}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace;">$${e.annualCost.toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
  </div>` : ''}
  
  <!-- Entity P&L Breakdown -->
  ${(report.entityBreakdown || []).filter(e => e.revenue > 0 || e.expenses > 0).length > 0 ? `
  <div style="margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Entity-Level P&L</div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #1a365d; color: white;">
        <th style="padding: 8px; text-align: left;">Entity</th>
        <th style="text-align: left; padding: 8px;">Flow</th>
        <th style="text-align: right; padding: 8px;">Revenue</th>
        <th style="text-align: right; padding: 8px;">Expenses</th>
        <th style="text-align: right; padding: 8px;">Net Income</th>
        <th style="text-align: right; padding: 8px;">SE Taxable</th>
      </tr>
      ${(report.entityBreakdown || []).filter(e => e.revenue > 0 || e.expenses > 0).map((e, i) => `
        <tr style="background: ${i % 2 ? '#f7fafc' : '#fff'};">
          <td style="padding: 8px; font-weight: 500;">${e.entityName}</td>
          <td style="padding: 8px;">${e.flowThrough === 'schedule_c' ? 'Sched C' : e.flowThrough === 'k1' ? 'K-1' : e.flowThrough === 'corporate' ? 'Corp' : 'Personal'}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace;">$${e.revenue.toLocaleString()}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace;">$${e.expenses.toLocaleString()}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace; color: ${e.netIncome >= 0 ? '#38a169' : '#c53030'};">$${e.netIncome.toLocaleString()}</td>
          <td style="text-align: right; padding: 8px; font-family: monospace;">$${e.seTaxableAmount.toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
  </div>` : ''}
  
  <!-- Strategy Recommendations -->
  <div style="margin-bottom: 24px;">
    <div style="font-size: 16px; font-weight: 600; color: #1a365d; margin-bottom: 12px;">Optimization Opportunities (${strategies.length})</div>
    ${strategies.slice(0, 8).map(s => `
      <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; border-left: 4px solid ${s.priority === 'critical' ? '#c53030' : s.priority === 'high' ? '#dd6b20' : '#38a169'};">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 600; font-size: 14px;">${s.title}</div>
          <div style="font-family: monospace; font-weight: bold; color: #38a169;">${s.impactLabel}</div>
        </div>
        <div style="font-size: 13px; color: #4a5568; margin-top: 6px;">${s.description}</div>
        <div style="font-size: 12px; color: #718096; margin-top: 4px; font-style: italic;">Risk: ${s.risk} • Timeline: ${s.timeline}</div>
      </div>
    `).join('')}
  </div>
  
  <!-- Financial Health Score -->
  <div style="background: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="font-size: 16px; font-weight: 600; color: #22543d;">Financial Health Score</div>
      <div style="font-size: 36px; font-weight: bold; color: ${health.overall >= 70 ? '#38a169' : health.overall >= 50 ? '#dd6b20' : '#c53030'};">${health.overall}<span style="font-size: 16px; color: #718096;">/100</span></div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; font-size: 12px;">
      <div>Tax Efficiency: <strong>${health.components.taxEfficiency}</strong></div>
      <div>Entity Optimization: <strong>${health.components.entityOptimization}</strong></div>
      <div>Income Growth: <strong>${health.components.incomeGrowth}</strong></div>
      <div>Risk Protection: <strong>${health.components.riskProtection}</strong></div>
      <div>Retirement: <strong>${health.components.retirementReadiness}</strong></div>
      <div>Diversification: <strong>${health.components.diversification}</strong></div>
    </div>
  </div>
  
  <div style="font-size: 11px; color: #a0aec0; padding-top: 12px; border-top: 1px solid #e2e8f0;">
    This analysis was generated by Fortuna Engine v5 and is intended as a strategic planning document for discussion with your tax professional. It does not constitute tax advice. All calculations should be verified by a qualified CPA.
  </div>
</div>`

  return {
    id: `cpa-package-${year}`,
    title: `CPA Strategy Handoff — ${year}`,
    type: 'report',
    category: 'cpa',
    content,
    generatedAt: new Date().toISOString(),
    applicableYear: year,
  }
}

// ==================== Entity Formation Checklist ====================

export function generateEntityFormationChecklist(entityType: string, stateName: string): GeneratedDocument {
  const year = new Date().getFullYear()
  
  const entitySteps: Record<string, { title: string; steps: { text: string; detail: string }[] }[]> = {
    'llc': [
      { title: 'Pre-Formation', steps: [
        { text: 'Choose a business name', detail: 'Must include "LLC" or "Limited Liability Company". Check availability with your state\'s Secretary of State.' },
        { text: 'Designate a registered agent', detail: 'Must have a physical address in the state of formation. Can be yourself or a registered agent service ($50-300/yr).' },
        { text: 'Determine member structure', detail: 'Single-member or multi-member. This affects default tax treatment (disregarded entity vs partnership).' },
      ]},
      { title: 'State Filing', steps: [
        { text: 'File Articles of Organization', detail: `File with ${stateName} Secretary of State. Typical cost: $50-500 depending on state. Processing: 1-4 weeks standard, 1-3 days expedited.` },
        { text: 'Draft Operating Agreement', detail: 'Not required in all states but strongly recommended. Defines member responsibilities, profit sharing, and dissolution procedures.' },
        { text: 'Publish formation notice (if required)', detail: 'Some states (NY, AZ, NE) require newspaper publication. Cost varies.' },
      ]},
      { title: 'Federal Setup', steps: [
        { text: 'Apply for EIN (Form SS-4)', detail: 'Free from IRS. Apply online at irs.gov — takes minutes. Required for bank accounts and tax filing.' },
        { text: 'Determine tax classification', detail: 'Default: disregarded (single-member) or partnership (multi-member). Can elect S-Corp (Form 2553) or C-Corp (Form 8832).' },
        { text: 'Set up accounting method', detail: 'Choose cash or accrual basis. Cash is simpler for most small businesses.' },
      ]},
      { title: 'Compliance Setup', steps: [
        { text: 'Open business bank account', detail: 'Mandatory for liability protection. Never commingle personal and business funds.' },
        { text: 'Obtain business licenses/permits', detail: 'Check state and local requirements. May need professional licenses depending on industry.' },
        { text: 'Set up estimated tax payments', detail: 'If expecting to owe $1,000+ in taxes, begin quarterly estimated payments (1040-ES).' },
        { text: 'Mark annual report deadline', detail: 'Most states require annual or biennial reports. Missing this can result in dissolution.' },
      ]},
    ],
    'llc_scorp': [
      { title: 'Step 1: Form the LLC', steps: [
        { text: 'Complete all LLC formation steps first', detail: 'File Articles of Organization, get EIN, open bank account — follow LLC checklist above.' },
      ]},
      { title: 'Step 2: S-Corp Election', steps: [
        { text: 'File Form 2553 with IRS', detail: 'Must be filed within 75 days of formation OR by March 15 for current-year election. All members must consent.' },
        { text: 'Determine reasonable compensation', detail: 'IRS requires S-Corp owner-employees to pay themselves a "reasonable salary" before taking distributions. Research comparable positions.' },
        { text: 'Set up payroll system', detail: 'Required for paying yourself salary. Options: Gusto, ADP, or accountant-managed payroll. Budget $50-200/month.' },
      ]},
      { title: 'Step 3: Ongoing Compliance', steps: [
        { text: 'Run payroll regularly (monthly or semi-monthly)', detail: 'Must withhold federal/state income tax, Social Security, Medicare. File payroll tax returns (941 quarterly, W-2/W-3 annually).' },
        { text: 'File Form 1120-S annually (due March 15)', detail: 'S-Corp return with K-1 generation. Extension available via Form 7004.' },
        { text: 'Maintain corporate formalities', detail: 'Meeting minutes, documented officer decisions, separation of business and personal expenses.' },
        { text: 'Track distributions separately from salary', detail: 'Distributions from profits after reasonable salary are not subject to SE tax — this is the key savings mechanism.' },
      ]},
    ],
  }
  
  const steps = entitySteps[entityType] || entitySteps['llc']
  
  const content = `
<div style="font-family: -apple-system, sans-serif; max-width: 720px; padding: 32px; background: #fff; color: #111;">
  <div style="border-bottom: 3px solid #2b6cb0; padding-bottom: 16px; margin-bottom: 24px;">
    <div style="font-size: 24px; font-weight: bold; color: #2b6cb0;">${entityType.replace('_', ' ').toUpperCase()} Formation Checklist</div>
    <div style="font-size: 14px; color: #666; margin-top: 4px;">State: ${stateName} • ${year}</div>
  </div>
  
  ${steps.map((section, si) => `
    <div style="margin-bottom: 28px;">
      <div style="font-size: 16px; font-weight: 600; color: #2b6cb0; margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
        <span style="background: #2b6cb0; color: white; width: 28px; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0;">${si + 1}</span>
        ${section.title}
      </div>
      ${section.steps.map(step => `
        <div style="margin-left: 38px; margin-bottom: 14px; padding: 12px; background: #f7fafc; border-radius: 8px; border-left: 3px solid #bee3f8;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="width: 16px; height: 16px; border: 2px solid #4299e1; border-radius: 3px; flex-shrink: 0;"></span>
            <span style="font-weight: 600; font-size: 14px;">${step.text}</span>
          </div>
          <div style="margin-left: 24px; font-size: 12px; color: #4a5568; line-height: 1.5;">${step.detail}</div>
        </div>
      `).join('')}
    </div>
  `).join('')}
  
  <div style="font-size: 11px; color: #a0aec0; padding-top: 12px; border-top: 1px solid #e2e8f0;">
    Generated by Fortuna Engine v5 • State requirements vary — verify with your state's Secretary of State and a qualified attorney.
  </div>
</div>`

  return {
    id: `entity-formation-${entityType}-${year}`,
    title: `${entityType.replace('_', ' ').toUpperCase()} Formation Checklist — ${stateName}`,
    type: 'checklist',
    category: 'entity',
    content,
    generatedAt: new Date().toISOString(),
    applicableYear: year,
  }
}

// ==================== All Available Documents ====================

export interface DocumentTemplate {
  id: string
  title: string
  description: string
  type: GeneratedDocument['type']
  category: GeneratedDocument['category']
  generator: (state: FortunaState) => GeneratedDocument
}

export function getAvailableDocuments(state: FortunaState): DocumentTemplate[] {
  const docs: DocumentTemplate[] = []
  const year = new Date().getFullYear()
  
  // 1040-ES for each quarter
  for (let q = 1; q <= 4; q++) {
    docs.push({
      id: `1040es-q${q}`,
      title: `1040-ES Voucher — Q${q} ${year}`,
      description: `Estimated tax payment worksheet for Quarter ${q}`,
      type: 'voucher',
      category: 'tax',
      generator: (s) => generate1040ES(s, q as 1 | 2 | 3 | 4),
    })
  }
  
  // Audit checklist
  docs.push({
    id: 'audit-checklist',
    title: 'Audit Preparedness Checklist',
    description: 'Complete documentation checklist based on your deductions and entity structure',
    type: 'checklist',
    category: 'audit',
    generator: generateAuditChecklist,
  })
  
  // CPA package
  docs.push({
    id: 'cpa-package',
    title: 'CPA Strategy Handoff',
    description: 'Comprehensive financial analysis package for your tax professional',
    type: 'report',
    category: 'cpa',
    generator: generateCPAPackage,
  })
  
  // Entity formation checklists
  const entityTypes = ['llc', 'llc_scorp'] as const
  for (const type of entityTypes) {
    docs.push({
      id: `formation-${type}`,
      title: `${type.replace('_', ' ').toUpperCase()} Formation Checklist`,
      description: `Step-by-step guide for forming a ${type.replace('_', ' ').toUpperCase()} in ${state.profile.state}`,
      type: 'checklist',
      category: 'entity',
      generator: (s) => generateEntityFormationChecklist(type, s.profile.state),
    })
  }
  
  return docs
}

// ==================== Utilities ====================

function formatFilingStatus(status: string): string {
  const map: Record<string, string> = {
    single: 'Single',
    married_joint: 'Married Filing Jointly',
    married_separate: 'Married Filing Separately',
    head_of_household: 'Head of Household',
  }
  return map[status] || status
}

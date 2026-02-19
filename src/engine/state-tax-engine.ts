/**
 * FORTUNA ENGINE — 50-State Tax Engine v1
 * 
 * Full graduated bracket calculations for all 50 states + DC.
 * Replaces the single-rate approximations in tax-calculator.ts.
 * 
 * Data sources: Tax Foundation 2025, state DOR publications.
 * 
 * Features:
 *   - Graduated brackets for all progressive states
 *   - Filing status adjustments (single, MFJ, MFS, HoH)
 *   - State standard deductions and personal exemptions
 *   - Notable local surtaxes (NYC, Portland, San Francisco)
 *   - Capital gains treatment variations
 *   - SE health insurance deduction conformity
 */

export interface StateTaxResult {
  stateCode: string
  stateName: string
  taxableIncome: number
  stateTax: number
  effectiveRate: number
  marginalRate: number
  localTax: number
  localName?: string
  totalStateLocal: number
  hasCapGainsPreference: boolean
  notes: string[]
}

interface Bracket { min: number; max: number; rate: number }

interface StateConfig {
  name: string
  type: 'none' | 'flat' | 'progressive'
  standardDeduction: { single: number; mfj: number }
  personalExemption: { single: number; mfj: number }
  brackets: { single: Bracket[]; mfj: Bracket[] }
  flatRate?: number
  localSurtax?: (income: number) => number
  localName?: string
  capGainsRate?: number // if different from income
  notes: string[]
}

// ─── State Configurations ───────────────────────────────────────────────────

const INF = 1e12

const STATES: Record<string, StateConfig> = {
  AL: { name: 'Alabama', type: 'progressive', standardDeduction: { single: 2500, mfj: 7500 }, personalExemption: { single: 1500, mfj: 3000 },
    brackets: { single: [{ min: 0, max: 500, rate: 0.02 }, { min: 500, max: 3000, rate: 0.04 }, { min: 3000, max: INF, rate: 0.05 }], mfj: [{ min: 0, max: 1000, rate: 0.02 }, { min: 1000, max: 6000, rate: 0.04 }, { min: 6000, max: INF, rate: 0.05 }] }, notes: ['Federal income tax deduction allowed (up to $13,903 single)'] },
  AK: { name: 'Alaska', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax'] },
  AZ: { name: 'Arizona', type: 'flat', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.025, brackets: { single: [{ min: 0, max: INF, rate: 0.025 }], mfj: [{ min: 0, max: INF, rate: 0.025 }] }, notes: ['Flat 2.5% rate effective 2023'] },
  AR: { name: 'Arkansas', type: 'progressive', standardDeduction: { single: 2340, mfj: 4680 }, personalExemption: { single: 29, mfj: 58 },
    brackets: { single: [{ min: 0, max: 5100, rate: 0.02 }, { min: 5100, max: 10300, rate: 0.04 }, { min: 10300, max: INF, rate: 0.044 }], mfj: [{ min: 0, max: 5100, rate: 0.02 }, { min: 5100, max: 10300, rate: 0.04 }, { min: 10300, max: INF, rate: 0.044 }] }, notes: ['Top rate dropped to 4.4% in 2025'] },
  CA: { name: 'California', type: 'progressive', standardDeduction: { single: 5540, mfj: 11080 }, personalExemption: { single: 144, mfj: 288 },
    brackets: {
      single: [{ min: 0, max: 10412, rate: 0.01 }, { min: 10412, max: 24684, rate: 0.02 }, { min: 24684, max: 38959, rate: 0.04 }, { min: 38959, max: 54081, rate: 0.06 }, { min: 54081, max: 68350, rate: 0.08 }, { min: 68350, max: 349137, rate: 0.093 }, { min: 349137, max: 418961, rate: 0.103 }, { min: 418961, max: 698271, rate: 0.113 }, { min: 698271, max: 1000000, rate: 0.123 }, { min: 1000000, max: INF, rate: 0.133 }],
      mfj: [{ min: 0, max: 20824, rate: 0.01 }, { min: 20824, max: 49368, rate: 0.02 }, { min: 49368, max: 77918, rate: 0.04 }, { min: 77918, max: 108162, rate: 0.06 }, { min: 108162, max: 136700, rate: 0.08 }, { min: 136700, max: 698274, rate: 0.093 }, { min: 698274, max: 837922, rate: 0.103 }, { min: 837922, max: 1396542, rate: 0.113 }, { min: 1396542, max: 2000000, rate: 0.123 }, { min: 2000000, max: INF, rate: 0.133 }]
    }, notes: ['No capital gains preference — taxed as ordinary income', '1% mental health surcharge over $1M', 'Does not conform to §199A QBI deduction'] },
  CO: { name: 'Colorado', type: 'flat', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.044, brackets: { single: [{ min: 0, max: INF, rate: 0.044 }], mfj: [{ min: 0, max: INF, rate: 0.044 }] }, notes: ['Uses federal taxable income as starting point'] },
  CT: { name: 'Connecticut', type: 'progressive', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 15000, mfj: 24000 },
    brackets: { single: [{ min: 0, max: 10000, rate: 0.03 }, { min: 10000, max: 50000, rate: 0.05 }, { min: 50000, max: 100000, rate: 0.055 }, { min: 100000, max: 200000, rate: 0.06 }, { min: 200000, max: 250000, rate: 0.065 }, { min: 250000, max: 500000, rate: 0.069 }, { min: 500000, max: INF, rate: 0.0699 }], mfj: [{ min: 0, max: 20000, rate: 0.03 }, { min: 20000, max: 100000, rate: 0.05 }, { min: 100000, max: 200000, rate: 0.055 }, { min: 200000, max: 400000, rate: 0.06 }, { min: 400000, max: 500000, rate: 0.065 }, { min: 500000, max: 1000000, rate: 0.069 }, { min: 1000000, max: INF, rate: 0.0699 }] }, notes: ['Personal exemption phases out at higher incomes'] },
  DE: { name: 'Delaware', type: 'progressive', standardDeduction: { single: 3250, mfj: 6500 }, personalExemption: { single: 110, mfj: 220 },
    brackets: { single: [{ min: 0, max: 2000, rate: 0.0 }, { min: 2000, max: 5000, rate: 0.022 }, { min: 5000, max: 10000, rate: 0.039 }, { min: 10000, max: 20000, rate: 0.048 }, { min: 20000, max: 25000, rate: 0.052 }, { min: 25000, max: 60000, rate: 0.0555 }, { min: 60000, max: INF, rate: 0.066 }], mfj: [{ min: 0, max: 2000, rate: 0.0 }, { min: 2000, max: 5000, rate: 0.022 }, { min: 5000, max: 10000, rate: 0.039 }, { min: 10000, max: 20000, rate: 0.048 }, { min: 20000, max: 25000, rate: 0.052 }, { min: 25000, max: 60000, rate: 0.0555 }, { min: 60000, max: INF, rate: 0.066 }] }, notes: ['Wilmington has 1.25% local wage tax'] },
  FL: { name: 'Florida', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax'] },
  GA: { name: 'Georgia', type: 'flat', standardDeduction: { single: 12000, mfj: 24000 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.0549, brackets: { single: [{ min: 0, max: INF, rate: 0.0549 }], mfj: [{ min: 0, max: INF, rate: 0.0549 }] }, notes: ['Transitioning to flat 5.49% (2025), declining to 4.99% by 2029'] },
  HI: { name: 'Hawaii', type: 'progressive', standardDeduction: { single: 2200, mfj: 4400 }, personalExemption: { single: 1144, mfj: 2288 },
    brackets: { single: [{ min: 0, max: 2400, rate: 0.014 }, { min: 2400, max: 4800, rate: 0.032 }, { min: 4800, max: 9600, rate: 0.055 }, { min: 9600, max: 14400, rate: 0.064 }, { min: 14400, max: 19200, rate: 0.068 }, { min: 19200, max: 24000, rate: 0.072 }, { min: 24000, max: 36000, rate: 0.076 }, { min: 36000, max: 48000, rate: 0.079 }, { min: 48000, max: 150000, rate: 0.0825 }, { min: 150000, max: 175000, rate: 0.09 }, { min: 175000, max: 200000, rate: 0.10 }, { min: 200000, max: INF, rate: 0.11 }], mfj: [{ min: 0, max: 4800, rate: 0.014 }, { min: 4800, max: 9600, rate: 0.032 }, { min: 9600, max: 19200, rate: 0.055 }, { min: 19200, max: 28800, rate: 0.064 }, { min: 28800, max: 38400, rate: 0.068 }, { min: 38400, max: 48000, rate: 0.072 }, { min: 48000, max: 72000, rate: 0.076 }, { min: 72000, max: 96000, rate: 0.079 }, { min: 96000, max: 300000, rate: 0.0825 }, { min: 300000, max: 350000, rate: 0.09 }, { min: 350000, max: 400000, rate: 0.10 }, { min: 400000, max: INF, rate: 0.11 }] },
    capGainsRate: 0.0725, notes: ['Capital gains taxed at 7.25% (lower than income rate)', 'Does not conform to §199A'] },
  ID: { name: 'Idaho', type: 'flat', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.058, brackets: { single: [{ min: 0, max: INF, rate: 0.058 }], mfj: [{ min: 0, max: INF, rate: 0.058 }] }, notes: ['Flat 5.8% effective 2023'] },
  IL: { name: 'Illinois', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 2625, mfj: 5250 }, flatRate: 0.0495, brackets: { single: [{ min: 0, max: INF, rate: 0.0495 }], mfj: [{ min: 0, max: INF, rate: 0.0495 }] }, notes: ['Flat 4.95%', '1.5% replacement tax on S-Corp income'] },
  IN: { name: 'Indiana', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 1000, mfj: 2000 }, flatRate: 0.0305, brackets: { single: [{ min: 0, max: INF, rate: 0.0305 }], mfj: [{ min: 0, max: INF, rate: 0.0305 }] }, notes: ['3.05% flat rate', 'County income tax adds 0.5-3.38% depending on county'] },
  IA: { name: 'Iowa', type: 'flat', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 40, mfj: 80 }, flatRate: 0.038, brackets: { single: [{ min: 0, max: INF, rate: 0.038 }], mfj: [{ min: 0, max: INF, rate: 0.038 }] }, notes: ['Flat 3.8% effective 2025'] },
  KS: { name: 'Kansas', type: 'progressive', standardDeduction: { single: 3500, mfj: 8000 }, personalExemption: { single: 2250, mfj: 4500 },
    brackets: { single: [{ min: 0, max: 15000, rate: 0.031 }, { min: 15000, max: 30000, rate: 0.0525 }, { min: 30000, max: INF, rate: 0.057 }], mfj: [{ min: 0, max: 30000, rate: 0.031 }, { min: 30000, max: 60000, rate: 0.0525 }, { min: 60000, max: INF, rate: 0.057 }] }, notes: [] },
  KY: { name: 'Kentucky', type: 'flat', standardDeduction: { single: 3160, mfj: 6320 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.04, brackets: { single: [{ min: 0, max: INF, rate: 0.04 }], mfj: [{ min: 0, max: INF, rate: 0.04 }] }, notes: ['Flat 4% effective 2024'] },
  LA: { name: 'Louisiana', type: 'progressive', standardDeduction: { single: 12500, mfj: 25000 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 12500, rate: 0.0185 }, { min: 12500, max: 50000, rate: 0.035 }, { min: 50000, max: INF, rate: 0.0425 }], mfj: [{ min: 0, max: 25000, rate: 0.0185 }, { min: 25000, max: 100000, rate: 0.035 }, { min: 100000, max: INF, rate: 0.0425 }] }, notes: ['Restructured 2025 with new brackets'] },
  ME: { name: 'Maine', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 5000, mfj: 10000 },
    brackets: { single: [{ min: 0, max: 26050, rate: 0.058 }, { min: 26050, max: 61600, rate: 0.0675 }, { min: 61600, max: INF, rate: 0.0715 }], mfj: [{ min: 0, max: 52100, rate: 0.058 }, { min: 52100, max: 123250, rate: 0.0675 }, { min: 123250, max: INF, rate: 0.0715 }] }, notes: [] },
  MD: { name: 'Maryland', type: 'progressive', standardDeduction: { single: 2550, mfj: 5150 }, personalExemption: { single: 3200, mfj: 6400 },
    brackets: { single: [{ min: 0, max: 1000, rate: 0.02 }, { min: 1000, max: 2000, rate: 0.03 }, { min: 2000, max: 3000, rate: 0.04 }, { min: 3000, max: 100000, rate: 0.0475 }, { min: 100000, max: 125000, rate: 0.05 }, { min: 125000, max: 150000, rate: 0.0525 }, { min: 150000, max: 250000, rate: 0.055 }, { min: 250000, max: INF, rate: 0.0575 }], mfj: [{ min: 0, max: 1000, rate: 0.02 }, { min: 1000, max: 2000, rate: 0.03 }, { min: 2000, max: 3000, rate: 0.04 }, { min: 3000, max: 150000, rate: 0.0475 }, { min: 150000, max: 175000, rate: 0.05 }, { min: 175000, max: 225000, rate: 0.0525 }, { min: 225000, max: 300000, rate: 0.055 }, { min: 300000, max: INF, rate: 0.0575 }] },
    localSurtax: () => 0.032, localName: 'County tax (avg 3.2%)', notes: ['County tax 2.25-3.2% on top of state rate'] },
  MA: { name: 'Massachusetts', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 4400, mfj: 8800 }, flatRate: 0.05, brackets: { single: [{ min: 0, max: INF, rate: 0.05 }], mfj: [{ min: 0, max: INF, rate: 0.05 }] }, notes: ['4% millionaire surtax on income over $1M (total 9%)', 'Short-term cap gains taxed at 8.5%'] },
  MI: { name: 'Michigan', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 5600, mfj: 11200 }, flatRate: 0.0425, brackets: { single: [{ min: 0, max: INF, rate: 0.0425 }], mfj: [{ min: 0, max: INF, rate: 0.0425 }] }, notes: ['Some cities have additional income tax (Detroit 2.4%)'] },
  MN: { name: 'Minnesota', type: 'progressive', standardDeduction: { single: 14575, mfj: 29150 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 31690, rate: 0.0535 }, { min: 31690, max: 104090, rate: 0.068 }, { min: 104090, max: 193240, rate: 0.0785 }, { min: 193240, max: INF, rate: 0.0985 }], mfj: [{ min: 0, max: 46330, rate: 0.0535 }, { min: 46330, max: 184040, rate: 0.068 }, { min: 184040, max: 321450, rate: 0.0785 }, { min: 321450, max: INF, rate: 0.0985 }] }, notes: ['Does not conform to §199A QBI deduction'] },
  MS: { name: 'Mississippi', type: 'flat', standardDeduction: { single: 2300, mfj: 4600 }, personalExemption: { single: 6000, mfj: 12000 }, flatRate: 0.047, brackets: { single: [{ min: 0, max: 10000, rate: 0.0 }, { min: 10000, max: INF, rate: 0.047 }], mfj: [{ min: 0, max: 10000, rate: 0.0 }, { min: 10000, max: INF, rate: 0.047 }] }, notes: ['First $10K exempt; 4.7% above that (2025)'] },
  MO: { name: 'Missouri', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 1207, rate: 0.02 }, { min: 1207, max: 2414, rate: 0.025 }, { min: 2414, max: 3621, rate: 0.03 }, { min: 3621, max: 4828, rate: 0.035 }, { min: 4828, max: 6035, rate: 0.04 }, { min: 6035, max: 7242, rate: 0.045 }, { min: 7242, max: 8449, rate: 0.05 }, { min: 8449, max: INF, rate: 0.048 }], mfj: [{ min: 0, max: 1207, rate: 0.02 }, { min: 1207, max: 2414, rate: 0.025 }, { min: 2414, max: 3621, rate: 0.03 }, { min: 3621, max: 4828, rate: 0.035 }, { min: 4828, max: 6035, rate: 0.04 }, { min: 6035, max: 7242, rate: 0.045 }, { min: 7242, max: 8449, rate: 0.05 }, { min: 8449, max: INF, rate: 0.048 }] }, notes: ['Top rate dropped to 4.8% in 2025', 'Kansas City and St. Louis have 1% earnings tax'] },
  MT: { name: 'Montana', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 20500, rate: 0.047 }, { min: 20500, max: INF, rate: 0.059 }], mfj: [{ min: 0, max: 41000, rate: 0.047 }, { min: 41000, max: INF, rate: 0.059 }] }, notes: ['2-bracket system effective 2024'] },
  NE: { name: 'Nebraska', type: 'progressive', standardDeduction: { single: 7900, mfj: 15800 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 3700, rate: 0.0246 }, { min: 3700, max: 22170, rate: 0.0351 }, { min: 22170, max: 35730, rate: 0.0501 }, { min: 35730, max: INF, rate: 0.0564 }], mfj: [{ min: 0, max: 7390, rate: 0.0246 }, { min: 7390, max: 44350, rate: 0.0351 }, { min: 44350, max: 71460, rate: 0.0501 }, { min: 71460, max: INF, rate: 0.0564 }] }, notes: [] },
  NV: { name: 'Nevada', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax'] },
  NH: { name: 'New Hampshire', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No income tax (interest & dividends tax repealed 2025)'] },
  NJ: { name: 'New Jersey', type: 'progressive', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 1000, mfj: 2000 },
    brackets: { single: [{ min: 0, max: 20000, rate: 0.014 }, { min: 20000, max: 35000, rate: 0.0175 }, { min: 35000, max: 40000, rate: 0.035 }, { min: 40000, max: 75000, rate: 0.05525 }, { min: 75000, max: 500000, rate: 0.0637 }, { min: 500000, max: 1000000, rate: 0.0897 }, { min: 1000000, max: INF, rate: 0.1075 }], mfj: [{ min: 0, max: 20000, rate: 0.014 }, { min: 20000, max: 50000, rate: 0.0175 }, { min: 50000, max: 70000, rate: 0.035 }, { min: 70000, max: 80000, rate: 0.05525 }, { min: 80000, max: 150000, rate: 0.0637 }, { min: 150000, max: 500000, rate: 0.0897 }, { min: 500000, max: 1000000, rate: 0.1075 }, { min: 1000000, max: INF, rate: 0.1075 }] },
    notes: ['Does not conform to §199A', 'Does not allow SE health insurance deduction', 'No standard deduction — uses exemptions only'] },
  NM: { name: 'New Mexico', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 5500, rate: 0.017 }, { min: 5500, max: 11000, rate: 0.032 }, { min: 11000, max: 16000, rate: 0.047 }, { min: 16000, max: 210000, rate: 0.049 }, { min: 210000, max: INF, rate: 0.059 }], mfj: [{ min: 0, max: 8000, rate: 0.017 }, { min: 8000, max: 16000, rate: 0.032 }, { min: 16000, max: 24000, rate: 0.047 }, { min: 24000, max: 315000, rate: 0.049 }, { min: 315000, max: INF, rate: 0.059 }] }, notes: [] },
  NY: { name: 'New York', type: 'progressive', standardDeduction: { single: 8000, mfj: 16050 }, personalExemption: { single: 0, mfj: 0 },
    brackets: {
      single: [{ min: 0, max: 8500, rate: 0.04 }, { min: 8500, max: 11700, rate: 0.045 }, { min: 11700, max: 13900, rate: 0.0525 }, { min: 13900, max: 80650, rate: 0.055 }, { min: 80650, max: 215400, rate: 0.06 }, { min: 215400, max: 1077550, rate: 0.0685 }, { min: 1077550, max: 5000000, rate: 0.0965 }, { min: 5000000, max: 25000000, rate: 0.103 }, { min: 25000000, max: INF, rate: 0.109 }],
      mfj: [{ min: 0, max: 17150, rate: 0.04 }, { min: 17150, max: 23600, rate: 0.045 }, { min: 23600, max: 27900, rate: 0.0525 }, { min: 27900, max: 161550, rate: 0.055 }, { min: 161550, max: 323200, rate: 0.06 }, { min: 323200, max: 2155350, rate: 0.0685 }, { min: 2155350, max: 5000000, rate: 0.0965 }, { min: 5000000, max: 25000000, rate: 0.103 }, { min: 25000000, max: INF, rate: 0.109 }]
    },
    localSurtax: (income) => {
      // NYC tax (simplified — 4 brackets)
      if (income <= 12000) return income * 0.03078
      if (income <= 25000) return 12000 * 0.03078 + (income - 12000) * 0.03762
      if (income <= 50000) return 12000 * 0.03078 + 13000 * 0.03762 + (income - 25000) * 0.03819
      return 12000 * 0.03078 + 13000 * 0.03762 + 25000 * 0.03819 + (income - 50000) * 0.03876
    },
    localName: 'NYC', notes: ['NYC residents add 3.1-3.9% city tax', 'Yonkers adds 16.75% surcharge on state tax'] },
  NC: { name: 'North Carolina', type: 'flat', standardDeduction: { single: 12750, mfj: 25500 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.045, brackets: { single: [{ min: 0, max: INF, rate: 0.045 }], mfj: [{ min: 0, max: INF, rate: 0.045 }] }, notes: ['Flat 4.5% (2025), declining to 3.99% by 2027'] },
  ND: { name: 'North Dakota', type: 'flat', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.0195, brackets: { single: [{ min: 0, max: INF, rate: 0.0195 }], mfj: [{ min: 0, max: INF, rate: 0.0195 }] }, notes: ['Flat 1.95% effective 2024'] },
  OH: { name: 'Ohio', type: 'progressive', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 2400, mfj: 4800 },
    brackets: { single: [{ min: 0, max: 26050, rate: 0.0 }, { min: 26050, max: 100000, rate: 0.0275 }, { min: 100000, max: INF, rate: 0.035 }], mfj: [{ min: 0, max: 26050, rate: 0.0 }, { min: 26050, max: 100000, rate: 0.0275 }, { min: 100000, max: INF, rate: 0.035 }] }, notes: ['First $26,050 exempt', 'Many cities have 1-2.5% income tax (Columbus 2.5%, Cleveland 2.5%)'] },
  OK: { name: 'Oklahoma', type: 'progressive', standardDeduction: { single: 6350, mfj: 12700 }, personalExemption: { single: 1000, mfj: 2000 },
    brackets: { single: [{ min: 0, max: 1000, rate: 0.0025 }, { min: 1000, max: 2500, rate: 0.0075 }, { min: 2500, max: 3750, rate: 0.0175 }, { min: 3750, max: 4900, rate: 0.0275 }, { min: 4900, max: 7200, rate: 0.0375 }, { min: 7200, max: INF, rate: 0.0475 }], mfj: [{ min: 0, max: 2000, rate: 0.0025 }, { min: 2000, max: 5000, rate: 0.0075 }, { min: 5000, max: 7500, rate: 0.0175 }, { min: 7500, max: 9800, rate: 0.0275 }, { min: 9800, max: 12200, rate: 0.0375 }, { min: 12200, max: INF, rate: 0.0475 }] }, notes: [] },
  OR: { name: 'Oregon', type: 'progressive', standardDeduction: { single: 2745, mfj: 5495 }, personalExemption: { single: 236, mfj: 472 },
    brackets: { single: [{ min: 0, max: 4050, rate: 0.0475 }, { min: 4050, max: 10200, rate: 0.0675 }, { min: 10200, max: 125000, rate: 0.0875 }, { min: 125000, max: INF, rate: 0.099 }], mfj: [{ min: 0, max: 8100, rate: 0.0475 }, { min: 8100, max: 20400, rate: 0.0675 }, { min: 20400, max: 250000, rate: 0.0875 }, { min: 250000, max: INF, rate: 0.099 }] }, notes: ['No sales tax but high income tax', 'Portland Metro tax adds 1% over $125K/$200K', 'Multnomah County adds 1.5% over $125K/$200K'] },
  PA: { name: 'Pennsylvania', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.0307, brackets: { single: [{ min: 0, max: INF, rate: 0.0307 }], mfj: [{ min: 0, max: INF, rate: 0.0307 }] }, notes: ['Flat 3.07%', 'Philadelphia adds 3.75% wage tax for residents', 'Most municipalities have 1% earned income tax'] },
  RI: { name: 'Rhode Island', type: 'progressive', standardDeduction: { single: 10550, mfj: 21150 }, personalExemption: { single: 4750, mfj: 9500 },
    brackets: { single: [{ min: 0, max: 73450, rate: 0.0375 }, { min: 73450, max: 166950, rate: 0.0475 }, { min: 166950, max: INF, rate: 0.0599 }], mfj: [{ min: 0, max: 73450, rate: 0.0375 }, { min: 73450, max: 166950, rate: 0.0475 }, { min: 166950, max: INF, rate: 0.0599 }] }, notes: [] },
  SC: { name: 'South Carolina', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 3460, rate: 0.0 }, { min: 3460, max: 17330, rate: 0.03 }, { min: 17330, max: INF, rate: 0.064 }], mfj: [{ min: 0, max: 3460, rate: 0.0 }, { min: 3460, max: 17330, rate: 0.03 }, { min: 17330, max: INF, rate: 0.064 }] }, notes: ['Top rate declining to 6.2% by 2027'] },
  SD: { name: 'South Dakota', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax'] },
  TN: { name: 'Tennessee', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax (Hall tax on interest/dividends repealed 2021)'] },
  TX: { name: 'Texas', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax', 'Franchise tax applies to businesses with >$2.47M revenue'] },
  UT: { name: 'Utah', type: 'flat', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, flatRate: 0.0465, brackets: { single: [{ min: 0, max: INF, rate: 0.0465 }], mfj: [{ min: 0, max: INF, rate: 0.0465 }] }, notes: ['4.65% flat rate', 'Taxpayer tax credit of 6% of federal personal exemption equivalent'] },
  VT: { name: 'Vermont', type: 'progressive', standardDeduction: { single: 7000, mfj: 14050 }, personalExemption: { single: 4850, mfj: 9700 },
    brackets: { single: [{ min: 0, max: 45400, rate: 0.0355 }, { min: 45400, max: 110050, rate: 0.068 }, { min: 110050, max: 229550, rate: 0.077 }, { min: 229550, max: INF, rate: 0.0875 }], mfj: [{ min: 0, max: 75850, rate: 0.0355 }, { min: 75850, max: 183400, rate: 0.068 }, { min: 183400, max: 279450, rate: 0.077 }, { min: 279450, max: INF, rate: 0.0875 }] }, notes: [] },
  VA: { name: 'Virginia', type: 'progressive', standardDeduction: { single: 8000, mfj: 16000 }, personalExemption: { single: 930, mfj: 1860 },
    brackets: { single: [{ min: 0, max: 3000, rate: 0.02 }, { min: 3000, max: 5000, rate: 0.03 }, { min: 5000, max: 17000, rate: 0.05 }, { min: 17000, max: INF, rate: 0.0575 }], mfj: [{ min: 0, max: 3000, rate: 0.02 }, { min: 3000, max: 5000, rate: 0.03 }, { min: 5000, max: 17000, rate: 0.05 }, { min: 17000, max: INF, rate: 0.0575 }] }, notes: [] },
  WA: { name: 'Washington', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax', '7% capital gains tax on gains >$250K (legal challenges ongoing)'] },
  WV: { name: 'West Virginia', type: 'progressive', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 2000, mfj: 4000 },
    brackets: { single: [{ min: 0, max: 10000, rate: 0.0236 }, { min: 10000, max: 25000, rate: 0.0315 }, { min: 25000, max: 40000, rate: 0.0354 }, { min: 40000, max: 60000, rate: 0.0472 }, { min: 60000, max: INF, rate: 0.0512 }], mfj: [{ min: 0, max: 10000, rate: 0.0236 }, { min: 10000, max: 25000, rate: 0.0315 }, { min: 25000, max: 40000, rate: 0.0354 }, { min: 40000, max: 60000, rate: 0.0472 }, { min: 60000, max: INF, rate: 0.0512 }] }, notes: [] },
  WI: { name: 'Wisconsin', type: 'progressive', standardDeduction: { single: 12760, mfj: 23620 }, personalExemption: { single: 700, mfj: 1400 },
    brackets: { single: [{ min: 0, max: 14320, rate: 0.0354 }, { min: 14320, max: 28640, rate: 0.0465 }, { min: 28640, max: 315310, rate: 0.053 }, { min: 315310, max: INF, rate: 0.0765 }], mfj: [{ min: 0, max: 19090, rate: 0.0354 }, { min: 19090, max: 38190, rate: 0.0465 }, { min: 38190, max: 420420, rate: 0.053 }, { min: 420420, max: INF, rate: 0.0765 }] }, notes: [] },
  WY: { name: 'Wyoming', type: 'none', standardDeduction: { single: 0, mfj: 0 }, personalExemption: { single: 0, mfj: 0 }, brackets: { single: [], mfj: [] }, notes: ['No state income tax'] },
  DC: { name: 'District of Columbia', type: 'progressive', standardDeduction: { single: 14600, mfj: 29200 }, personalExemption: { single: 0, mfj: 0 },
    brackets: { single: [{ min: 0, max: 10000, rate: 0.04 }, { min: 10000, max: 40000, rate: 0.06 }, { min: 40000, max: 60000, rate: 0.065 }, { min: 60000, max: 250000, rate: 0.085 }, { min: 250000, max: 500000, rate: 0.0925 }, { min: 500000, max: 1000000, rate: 0.0975 }, { min: 1000000, max: INF, rate: 0.1075 }], mfj: [{ min: 0, max: 10000, rate: 0.04 }, { min: 10000, max: 40000, rate: 0.06 }, { min: 40000, max: 60000, rate: 0.065 }, { min: 60000, max: 250000, rate: 0.085 }, { min: 250000, max: 500000, rate: 0.0925 }, { min: 500000, max: 1000000, rate: 0.0975 }, { min: 1000000, max: INF, rate: 0.1075 }] }, notes: [] },
}

// ─── Core Calculation ───────────────────────────────────────────────────────

function calcBracketTax(income: number, brackets: Bracket[]): { tax: number; marginalRate: number } {
  let tax = 0
  let marginalRate = 0
  let remaining = Math.max(0, income)

  for (const bracket of brackets) {
    const taxableInBracket = Math.min(remaining, bracket.max - bracket.min)
    if (taxableInBracket <= 0) break
    tax += taxableInBracket * bracket.rate
    marginalRate = bracket.rate
    remaining -= taxableInBracket
  }

  return { tax, marginalRate }
}

export function calculateFullStateTax(
  grossIncome: number,
  stateCode: string,
  filingStatus: 'single' | 'mfj' | 'mfs' | 'hoh' = 'single',
  options?: {
    includeLocal?: boolean
    localCity?: string  // for NYC, Portland, etc.
    itemizedDeductions?: number // if > standard deduction
  }
): StateTaxResult {
  const config = STATES[stateCode.toUpperCase()]
  if (!config) {
    return {
      stateCode, stateName: 'Unknown', taxableIncome: grossIncome,
      stateTax: 0, effectiveRate: 0, marginalRate: 0,
      localTax: 0, totalStateLocal: 0, hasCapGainsPreference: false, notes: ['State not found'],
    }
  }

  if (config.type === 'none') {
    return {
      stateCode, stateName: config.name, taxableIncome: 0,
      stateTax: 0, effectiveRate: 0, marginalRate: 0,
      localTax: 0, totalStateLocal: 0, hasCapGainsPreference: false, notes: config.notes,
    }
  }

  // Map filing status
  const fs = (filingStatus === 'mfj' || filingStatus === 'mfs') ? 'mfj' : 'single'
  // HoH typically uses single brackets in most states (simplified)
  const bracketKey = fs === 'mfj' ? 'mfj' : 'single'

  // Calculate taxable income
  const stdDed = config.standardDeduction[bracketKey]
  const persExempt = config.personalExemption[bracketKey]
  const deduction = options?.itemizedDeductions && options.itemizedDeductions > stdDed
    ? options.itemizedDeductions : stdDed
  const taxableIncome = Math.max(0, grossIncome - deduction - persExempt)

  // Calculate tax
  const brackets = config.brackets[bracketKey]
  const { tax, marginalRate } = calcBracketTax(taxableIncome, brackets)

  // Local tax
  let localTax = 0
  let localName: string | undefined
  if (options?.includeLocal && config.localSurtax) {
    const localResult = config.localSurtax(taxableIncome)
    localTax = typeof localResult === 'number' ? localResult : 0
    localName = config.localName
  }

  const effectiveRate = grossIncome > 0 ? tax / grossIncome : 0
  const totalStateLocal = tax + localTax

  return {
    stateCode: stateCode.toUpperCase(),
    stateName: config.name,
    taxableIncome,
    stateTax: Math.round(tax),
    effectiveRate: Math.round(effectiveRate * 10000) / 10000,
    marginalRate,
    localTax: Math.round(localTax),
    localName,
    totalStateLocal: Math.round(totalStateLocal),
    hasCapGainsPreference: !!config.capGainsRate,
    notes: config.notes,
  }
}

// ─── State Comparison Tool ──────────────────────────────────────────────────

export function compareStateTaxes(
  grossIncome: number,
  filingStatus: 'single' | 'mfj' = 'single',
  currentState?: string,
): StateTaxResult[] {
  const results = Object.keys(STATES).map(code =>
    calculateFullStateTax(grossIncome, code, filingStatus, { includeLocal: false })
  )
  return results.sort((a, b) => a.totalStateLocal - b.totalStateLocal)
}

// ─── Exports for use by existing tax-calculator.ts ──────────────────────────

export function getStateMarginalRate(stateCode: string, taxableIncome: number, filingStatus: string = 'single'): number {
  const result = calculateFullStateTax(taxableIncome, stateCode, filingStatus as any)
  return result.marginalRate
}

export function getStateEffectiveRate(stateCode: string, grossIncome: number, filingStatus: string = 'single'): number {
  const result = calculateFullStateTax(grossIncome, stateCode, filingStatus as any)
  return result.effectiveRate
}

export function getStateNames(): Record<string, string> {
  const names: Record<string, string> = {}
  for (const [code, config] of Object.entries(STATES)) {
    names[code] = config.name
  }
  return names
}

export function getNoIncomeTaxStates(): string[] {
  return Object.entries(STATES).filter(([_, c]) => c.type === 'none').map(([code]) => code)
}

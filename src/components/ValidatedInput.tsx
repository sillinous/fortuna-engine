/**
 * FORTUNA ENGINE — Validated Input Components
 * Form inputs with real-time validation, formatting, and accessibility.
 */

import { useState, useCallback, useId, type ReactNode, type ChangeEvent } from 'react'
import { AlertCircle, Check, HelpCircle } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────

type ValidationRule = {
  test: (value: string) => boolean
  message: string
}

interface ValidatedInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'email' | 'tel' | 'password' | 'currency' | 'percentage' | 'date' | 'ein' | 'ssn'
  placeholder?: string
  required?: boolean
  disabled?: boolean
  helpText?: string
  validationRules?: ValidationRule[]
  min?: number
  max?: number
  prefix?: string
  suffix?: string
  autoFocus?: boolean
  onBlur?: () => void
}

// ─── Format Helpers ─────────────────────────────────────────────────

function formatCurrency(val: string): string {
  const num = val.replace(/[^0-9.]/g, '')
  const parts = num.split('.')
  if (parts.length > 2) return formatCurrency(parts[0] + '.' + parts.slice(1).join(''))
  if (parts[0]) {
    parts[0] = parseInt(parts[0]).toLocaleString()
  }
  if (parts[1] !== undefined) {
    parts[1] = parts[1].slice(0, 2)
    return parts.join('.')
  }
  return parts[0] || ''
}

function parseCurrency(val: string): string {
  return val.replace(/[^0-9.]/g, '')
}

function formatPercentage(val: string): string {
  return val.replace(/[^0-9.]/g, '').slice(0, 6)
}

function formatEIN(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 9)
  if (digits.length > 2) return digits.slice(0, 2) + '-' + digits.slice(2)
  return digits
}

function formatSSN(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 9)
  if (digits.length > 5) return digits.slice(0, 3) + '-' + digits.slice(3, 5) + '-' + digits.slice(5)
  if (digits.length > 3) return digits.slice(0, 3) + '-' + digits.slice(3)
  return digits
}

function formatPhone(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10)
  if (digits.length > 6) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6)
  if (digits.length > 3) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3)
  return digits
}

// ─── Built-in Validations ───────────────────────────────────────────

function getBuiltinRules(type: string, required?: boolean, min?: number, max?: number): ValidationRule[] {
  const rules: ValidationRule[] = []

  if (required) {
    rules.push({ test: v => v.trim().length > 0, message: 'This field is required' })
  }

  switch (type) {
    case 'email':
      rules.push({ test: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), message: 'Enter a valid email address' })
      break
    case 'currency':
      if (min !== undefined) rules.push({ test: v => !v || parseFloat(parseCurrency(v)) >= min, message: `Minimum: $${min.toLocaleString()}` })
      if (max !== undefined) rules.push({ test: v => !v || parseFloat(parseCurrency(v)) <= max, message: `Maximum: $${max.toLocaleString()}` })
      break
    case 'percentage':
      rules.push({ test: v => !v || (parseFloat(v) >= 0 && parseFloat(v) <= 100), message: 'Enter a value between 0 and 100' })
      break
    case 'ein':
      rules.push({ test: v => !v || v.replace(/\D/g, '').length === 9, message: 'EIN must be 9 digits (XX-XXXXXXX)' })
      break
    case 'ssn':
      rules.push({ test: v => !v || v.replace(/\D/g, '').length === 9, message: 'SSN must be 9 digits (XXX-XX-XXXX)' })
      break
    case 'tel':
      rules.push({ test: v => !v || v.replace(/\D/g, '').length === 10, message: 'Enter a 10-digit phone number' })
      break
  }

  return rules
}

// ─── Component ──────────────────────────────────────────────────────

export function ValidatedInput({
  label, value, onChange, type = 'text', placeholder, required, disabled,
  helpText, validationRules = [], min, max, prefix, suffix, autoFocus, onBlur,
}: ValidatedInputProps) {
  const [touched, setTouched] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const uid = useId()
  const inputId = `input-${uid}`
  const errorId = `error-${uid}`
  const helpId = `help-${uid}`

  const allRules = [...getBuiltinRules(type, required, min, max), ...validationRules]

  const errors = touched ? allRules.filter(r => !r.test(value)).map(r => r.message) : []
  const isValid = touched && value.length > 0 && errors.length === 0
  const isError = touched && errors.length > 0

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    switch (type) {
      case 'currency': val = formatCurrency(val); break
      case 'percentage': val = formatPercentage(val); break
      case 'ein': val = formatEIN(val); break
      case 'ssn': val = formatSSN(val); break
      case 'tel': val = formatPhone(val); break
    }
    onChange(val)
  }, [type, onChange])

  const handleBlur = useCallback(() => {
    setTouched(true)
    onBlur?.()
  }, [onBlur])

  const inputType = ['currency', 'percentage', 'ein', 'ssn'].includes(type) ? 'text'
    : type === 'number' ? 'text' : type

  const inputMode = ['currency', 'number', 'percentage'].includes(type) ? 'decimal' as const
    : ['ein', 'ssn', 'tel'].includes(type) ? 'numeric' as const
    : undefined

  return (
    <div className="form-field">
      <label className="form-label" htmlFor={inputId}>
        {label}
        {required && <span className="required" aria-hidden="true">*</span>}
        {helpText && (
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 2, display: 'flex', color: 'var(--text-muted)',
            }}
            aria-label={`Help for ${label}`}
            aria-expanded={showHelp}
            aria-controls={helpId}
          >
            <HelpCircle size={14} />
          </button>
        )}
      </label>

      {showHelp && helpText && (
        <div id={helpId} className="form-helper" role="note">{helpText}</div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 14, color: 'var(--text-muted)',
            fontSize: 14, pointerEvents: 'none', zIndex: 1,
          }}>{prefix}</span>
        )}

        <input
          id={inputId}
          type={inputType}
          inputMode={inputMode}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          required={required}
          aria-required={required}
          aria-invalid={isError}
          aria-describedby={isError ? errorId : helpText ? helpId : undefined}
          className={`form-input ${isError ? 'error' : ''} ${isValid ? 'valid' : ''}`}
          style={{
            flex: 1,
            paddingLeft: prefix ? 32 : 14,
            paddingRight: suffix || isValid || isError ? 36 : 14,
          }}
        />

        {/* Status icon */}
        {(isValid || isError) && (
          <span style={{
            position: 'absolute', right: 12,
            display: 'flex', pointerEvents: 'none',
          }}>
            {isValid && <Check size={16} color="var(--accent-emerald)" />}
            {isError && <AlertCircle size={16} color="var(--accent-red)" />}
          </span>
        )}

        {suffix && !isValid && !isError && (
          <span style={{
            position: 'absolute', right: 14, color: 'var(--text-muted)',
            fontSize: 13, pointerEvents: 'none',
          }}>{suffix}</span>
        )}
      </div>

      {isError && (
        <div id={errorId} className="form-error" role="alert">
          <AlertCircle size={12} />
          {errors[0]}
        </div>
      )}
    </div>
  )
}

// ─── Currency Shorthand ─────────────────────────────────────────────

export function CurrencyInput(props: Omit<ValidatedInputProps, 'type' | 'prefix'>) {
  return <ValidatedInput {...props} type="currency" prefix="$" />
}

export function PercentInput(props: Omit<ValidatedInputProps, 'type' | 'suffix'>) {
  return <ValidatedInput {...props} type="percentage" suffix="%" />
}

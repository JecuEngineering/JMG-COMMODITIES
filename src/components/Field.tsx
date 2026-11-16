import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import './ui.css'

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="ui-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error ? <span className="ui-field-hint">{hint}</span> : null}
      {error ? <span className="ui-field-error">{error}</span> : null}
    </div>
  )
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />
}

export function SelectInput({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-input ${className}`.trim()} {...props} />
}

export function TextArea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-input ui-textarea ${className}`.trim()} {...props} />
}

import styles from './Segmented.module.css'

/** One setting as a row of segments: its name above, the choices below, the chosen one lit. */
export default function Segmented<T extends string | number | boolean>({ name, label, hint, options, value, onChange }: {
  name: string
  label: string
  /** A short line under the choices, for what the name alone doesn't say. */
  hint?: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.setting}>
      <span id={`${name}-label`}>{label}</span>
      <div className={styles.segmented} role="radiogroup" aria-labelledby={`${name}-label`}>
        {options.map(o => (
          <label key={String(o.value)} className={styles.segment}>
            <input
              className={styles.visuallyHidden}
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

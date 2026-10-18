import { useTranslation } from 'react-i18next'
import styles from './TokenChip.module.css'

const TOKEN_ICON = { knight: '⚔️', windmill: '⚖️' } as const

/** A held Knight/Windmill Token: a gold pill worth +1 VP, with the rule in its tooltip. */
export default function TokenChip({ token }: { token: 'knight' | 'windmill' }) {
  const { t } = useTranslation()
  const name = t(`advantage.${token}`)
  return (
    <span className={styles.chip} title={`${name}: ${t(`advantage.${token}Hint`)}`}>
      {TOKEN_ICON[token]}
      <span className={styles.name}>{name}</span>
      <span className={styles.bonus}>+1</span>
    </span>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateSettings, useClientSettings } from '../settings/clientSettings'
import Modal from './Modal'
import Segmented from './Segmented'
import dialog from './Dialog.module.css'
import help from './HelpButton.module.css'

/** ⚙️ in the lobby and game headers: this browser's Client Settings. Changes apply at once. */
export default function SettingsButton() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const settings = useClientSettings()
  const onOff = [{ value: true, label: t('settings.on') }, { value: false, label: t('settings.off') }]

  return (
    <>
      <button className={help.button} onClick={() => setOpen(true)} aria-label={t('settings.title')} title={t('settings.title')}>
        <span aria-hidden="true">⚙️</span>
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <div className={dialog.title}>{t('settings.title')}</div>
          {/* Each language in its own words, so it can be found without reading the other. */}
          <Segmented
            name="language"
            label={t('lobby.language')}
            value={i18n.language.startsWith('de') ? 'de' : 'en'}
            onChange={lng => i18n.changeLanguage(lng)}
            options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]}
          />
          <Segmented
            name="computer-speed"
            label={t('settings.computerSpeed')}
            value={settings.computerSpeed}
            onChange={computerSpeed => updateSettings({ computerSpeed })}
            options={[
              { value: 'slow', label: t('settings.slow') },
              { value: 'normal', label: t('settings.normal') },
              { value: 'fast', label: t('settings.fast') },
            ]}
          />
          <Segmented
            name="turn-alert"
            label={t('settings.turnAlert')}
            hint={t('settings.turnAlertHint')}
            value={settings.turnAlert}
            onChange={turnAlert => updateSettings({ turnAlert })}
            options={onOff}
          />
          <Segmented
            name="motion"
            label={t('settings.motion')}
            value={settings.motion}
            onChange={motion => updateSettings({ motion })}
            options={[
              { value: 'system', label: t('settings.motionSystem') },
              { value: 'on', label: t('settings.on') },
              { value: 'off', label: t('settings.off') },
            ]}
          />
          <Segmented
            name="confirm-builds"
            label={t('settings.confirmBuilds')}
            hint={t('settings.confirmBuildsHint')}
            value={settings.confirmBuilds}
            onChange={confirmBuilds => updateSettings({ confirmBuilds })}
            options={onOff}
          />
          <Segmented
            name="toasts"
            label={t('settings.toasts')}
            value={settings.toasts}
            onChange={toasts => updateSettings({ toasts })}
            options={[
              { value: 'normal', label: t('settings.normal') },
              { value: 'short', label: t('settings.short') },
              { value: 'off', label: t('settings.off') },
            ]}
          />
          <div className={dialog.actions}>
            <button className="primary" onClick={() => setOpen(false)}>{t('rules.done')}</button>
          </div>
        </Modal>
      )}
    </>
  )
}

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import de from './de.json'

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, de: { translation: de } },
    lng: navigator.language.startsWith('de') ? 'de' : 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

// Keep <html lang> in step, so the browser hyphenates long card names in the right language.
document.documentElement.lang = i18n.language
i18n.on('languageChanged', lng => { document.documentElement.lang = lng })

export default i18n

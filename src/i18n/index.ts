import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import de from './de.json'

// The player's last choice survives reloads and later visits (localStorage, per browser).
const STORAGE_KEY = 'catan-duel-language'

function storedLanguage(): 'en' | 'de' | null {
  try {
    const lng = localStorage.getItem(STORAGE_KEY)
    return lng === 'en' || lng === 'de' ? lng : null
  } catch {
    // localStorage may be unavailable (private mode) — fall back to the browser language.
    return null
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, de: { translation: de } },
    lng: storedLanguage() ?? (navigator.language.startsWith('de') ? 'de' : 'en'),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

// Keep <html lang> in step, so the browser hyphenates long card names in the right language.
document.documentElement.lang = i18n.language
i18n.on('languageChanged', lng => {
  document.documentElement.lang = lng
  try {
    localStorage.setItem(STORAGE_KEY, lng)
  } catch {
    // Not remembered then; the switch still works for this page.
  }
})

export default i18n

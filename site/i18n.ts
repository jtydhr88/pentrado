import { createI18n } from 'vue-i18n'

import en from '../src/locales/en.json'
import zh from '../src/locales/zh.json'

const locale = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'

export const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'en',
  messages: {
    en: { pentrado: en },
    zh: { pentrado: zh },
  },
})

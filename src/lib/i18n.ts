import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enCommon from '@/locales/en/common.json';
import zhCnCommon from '@/locales/zh-CN/common.json';
import zhTwCommon from '@/locales/zh-TW/common.json';
import zhMicroCommon from '@/locales/zh-micro/common.json';

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon
      },
      'zh-CN': {
        common: zhCnCommon
      },
      'zh-TW': {
        common: zhTwCommon
      },
      'zh-micro': {
        common: zhMicroCommon
      }
    },
    lng: 'zh-micro',
    fallbackLng: ['zh-micro', 'zh-CN', 'en'],
    ns: ['common'],
    defaultNS: 'common',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    load: 'languageOnly',
    returnNull: false,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;


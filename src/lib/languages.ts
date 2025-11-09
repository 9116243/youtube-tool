export type LanguageCode =
  | "zh-CN"
  | "zh-TW"
  | "en-US"
  | "en-GB"
  | "de-DE"
  | "fr-FR"
  | "es-ES"
  | "es-MX"
  | "pt-BR"
  | "pt-PT"
  | "it-IT"
  | "ru-RU"
  | "ja-JP"
  | "ko-KR"
  | "vi-VN"
  | "th-TH"
  | "id-ID"
  | "ms-MY"
  | "hi-IN"
  | "bn-BD"
  | "ur-PK"
  | "ta-IN"
  | "te-IN"
  | "mr-IN"
  | "gu-IN"
  | "kn-IN"
  | "pa-IN"
  | "ne-NP"
  | "si-LK"
  | "ar-SA"
  | "fa-IR"
  | "he-IL"
  | "tr-TR"
  | "pl-PL"
  | "nl-NL"
  | "sv-SE"
  | "no-NO"
  | "da-DK"
  | "fi-FI"
  | "cs-CZ"
  | "ro-RO"
  | "uk-UA"
  | "el-GR"
  | "hu-HU"
  | "bg-BG"
  | "sr-RS"
  | "hr-HR"
  | "sk-SK"
  | "sl-SI"
  | "mk-MK"
  | "lt-LT"
  | "lv-LV"
  | "et-EE"
  | "az-AZ"
  | "kk-KZ"
  | "ka-GE"
  | "hy-AM"
  | "am-ET"
  | "sw-KE"
  | "af-ZA"
  | "zu-ZA"
  | "fil-PH";

export interface LangMeta {
  code: LanguageCode;
  iso639_1: string;
  name: string;
  englishName: string;
  flag: string;
  rtl?: boolean;
  ttsHint?: string[];
}

const f = (cc: string) => cc; // ASCII placeholder for flag codes

export const LANGUAGES: LangMeta[] = [
  { code: "zh-CN", iso639_1: "zh", name: "Chinese (Simplified)", englishName: "Chinese (Simplified)", flag: f("CN"), ttsHint: ["chinese", "zh", "zh-CN"] },
  { code: "zh-TW", iso639_1: "zh", name: "Chinese (Traditional)", englishName: "Chinese (Traditional)", flag: f("TW"), ttsHint: ["zh-TW", "traditional"] },
  { code: "en-US", iso639_1: "en", name: "English (US)", englishName: "English (US)", flag: f("US"), ttsHint: ["en", "us"] },
  { code: "en-GB", iso639_1: "en", name: "English (UK)", englishName: "English (UK)", flag: f("GB"), ttsHint: ["en", "gb", "uk"] },
  { code: "de-DE", iso639_1: "de", name: "German", englishName: "German", flag: f("DE") },
  { code: "fr-FR", iso639_1: "fr", name: "French", englishName: "French", flag: f("FR") },
  { code: "es-ES", iso639_1: "es", name: "Spanish (EU)", englishName: "Spanish (EU)", flag: f("ES") },
  { code: "es-MX", iso639_1: "es", name: "Spanish (MX)", englishName: "Spanish (MX)", flag: f("MX") },
  { code: "pt-BR", iso639_1: "pt", name: "Portuguese (BR)", englishName: "Portuguese (BR)", flag: f("BR") },
  { code: "pt-PT", iso639_1: "pt", name: "Portuguese (EU)", englishName: "Portuguese (EU)", flag: f("PT") },
  { code: "it-IT", iso639_1: "it", name: "Italian", englishName: "Italian", flag: f("IT") },
  { code: "ru-RU", iso639_1: "ru", name: "Russian", englishName: "Russian", flag: f("RU") },
  { code: "ja-JP", iso639_1: "ja", name: "Japanese", englishName: "Japanese", flag: f("JP") },
  { code: "ko-KR", iso639_1: "ko", name: "Korean", englishName: "Korean", flag: f("KR") },
  { code: "vi-VN", iso639_1: "vi", name: "Vietnamese", englishName: "Vietnamese", flag: f("VN") },
  { code: "th-TH", iso639_1: "th", name: "Thai", englishName: "Thai", flag: f("TH") },
  { code: "id-ID", iso639_1: "id", name: "Indonesian", englishName: "Indonesian", flag: f("ID") },
  { code: "ms-MY", iso639_1: "ms", name: "Malay", englishName: "Malay", flag: f("MY") },
  { code: "hi-IN", iso639_1: "hi", name: "Hindi", englishName: "Hindi", flag: f("IN") },
  { code: "bn-BD", iso639_1: "bn", name: "Bengali", englishName: "Bengali", flag: f("BD") },
  { code: "ur-PK", iso639_1: "ur", name: "Urdu", englishName: "Urdu", flag: f("PK"), rtl: true },
  { code: "ta-IN", iso639_1: "ta", name: "Tamil", englishName: "Tamil", flag: f("IN") },
  { code: "te-IN", iso639_1: "te", name: "Telugu", englishName: "Telugu", flag: f("IN") },
  { code: "mr-IN", iso639_1: "mr", name: "Marathi", englishName: "Marathi", flag: f("IN") },
  { code: "gu-IN", iso639_1: "gu", name: "Gujarati", englishName: "Gujarati", flag: f("IN") },
  { code: "kn-IN", iso639_1: "kn", name: "Kannada", englishName: "Kannada", flag: f("IN") },
  { code: "pa-IN", iso639_1: "pa", name: "Punjabi", englishName: "Punjabi", flag: f("IN") },
  { code: "ne-NP", iso639_1: "ne", name: "Nepali", englishName: "Nepali", flag: f("NP") },
  { code: "si-LK", iso639_1: "si", name: "Sinhala", englishName: "Sinhala", flag: f("LK") },
  { code: "ar-SA", iso639_1: "ar", name: "Arabic", englishName: "Arabic", flag: f("SA"), rtl: true },
  { code: "fa-IR", iso639_1: "fa", name: "Persian", englishName: "Persian", flag: f("IR"), rtl: true },
  { code: "he-IL", iso639_1: "he", name: "Hebrew", englishName: "Hebrew", flag: f("IL"), rtl: true },
  { code: "tr-TR", iso639_1: "tr", name: "Turkish", englishName: "Turkish", flag: f("TR") },
  { code: "pl-PL", iso639_1: "pl", name: "Polish", englishName: "Polish", flag: f("PL") },
  { code: "nl-NL", iso639_1: "nl", name: "Dutch", englishName: "Dutch", flag: f("NL") },
  { code: "sv-SE", iso639_1: "sv", name: "Swedish", englishName: "Swedish", flag: f("SE") },
  { code: "no-NO", iso639_1: "no", name: "Norwegian", englishName: "Norwegian", flag: f("NO") },
  { code: "da-DK", iso639_1: "da", name: "Danish", englishName: "Danish", flag: f("DK") },
  { code: "fi-FI", iso639_1: "fi", name: "Finnish", englishName: "Finnish", flag: f("FI") },
  { code: "cs-CZ", iso639_1: "cs", name: "Czech", englishName: "Czech", flag: f("CZ") },
  { code: "ro-RO", iso639_1: "ro", name: "Romanian", englishName: "Romanian", flag: f("RO") },
  { code: "uk-UA", iso639_1: "uk", name: "Ukrainian", englishName: "Ukrainian", flag: f("UA") },
  { code: "el-GR", iso639_1: "el", name: "Greek", englishName: "Greek", flag: f("GR") },
  { code: "hu-HU", iso639_1: "hu", name: "Hungarian", englishName: "Hungarian", flag: f("HU") },
  { code: "bg-BG", iso639_1: "bg", name: "Bulgarian", englishName: "Bulgarian", flag: f("BG") },
  { code: "sr-RS", iso639_1: "sr", name: "Serbian", englishName: "Serbian", flag: f("RS") },
  { code: "hr-HR", iso639_1: "hr", name: "Croatian", englishName: "Croatian", flag: f("HR") },
  { code: "sk-SK", iso639_1: "sk", name: "Slovak", englishName: "Slovak", flag: f("SK") },
  { code: "sl-SI", iso639_1: "sl", name: "Slovene", englishName: "Slovene", flag: f("SI") },
  { code: "mk-MK", iso639_1: "mk", name: "Macedonian", englishName: "Macedonian", flag: f("MK") },
  { code: "lt-LT", iso639_1: "lt", name: "Lithuanian", englishName: "Lithuanian", flag: f("LT") },
  { code: "lv-LV", iso639_1: "lv", name: "Latvian", englishName: "Latvian", flag: f("LV") },
  { code: "et-EE", iso639_1: "et", name: "Estonian", englishName: "Estonian", flag: f("EE") },
  { code: "az-AZ", iso639_1: "az", name: "Azerbaijani", englishName: "Azerbaijani", flag: f("AZ") },
  { code: "kk-KZ", iso639_1: "kk", name: "Kazakh", englishName: "Kazakh", flag: f("KZ") },
  { code: "ka-GE", iso639_1: "ka", name: "Georgian", englishName: "Georgian", flag: f("GE") },
  { code: "hy-AM", iso639_1: "hy", name: "Armenian", englishName: "Armenian", flag: f("AM") },
  { code: "am-ET", iso639_1: "am", name: "Amharic", englishName: "Amharic", flag: f("ET") },
  { code: "sw-KE", iso639_1: "sw", name: "Swahili", englishName: "Swahili", flag: f("KE") },
  { code: "af-ZA", iso639_1: "af", name: "Afrikaans", englishName: "Afrikaans", flag: f("ZA") },
  { code: "zu-ZA", iso639_1: "zu", name: "Zulu", englishName: "Zulu", flag: f("ZA") },
  { code: "fil-PH", iso639_1: "fil", name: "Filipino", englishName: "Filipino", flag: f("PH") },
];

export const isRTL = (code: LanguageCode) => Boolean(LANGUAGES.find((lang) => lang.code === code)?.rtl);

export function findLang(code: LanguageCode | string) {
  return LANGUAGES.find((lang) => lang.code === code) ?? null;
}


// SubDL's languages. `encoding` is the usual format of older subtitle files in that language.

export const LANGUAGES = [
  { code: "SQ", name: "Albanian", encoding: "windows-1250" },
  { code: "AR", name: "Arabic", encoding: "windows-1256" },
  { code: "AZ", name: "Azerbaijani", encoding: "windows-1254" },
  { code: "BE", name: "Belarusian", encoding: "windows-1251" },
  { code: "BN", name: "Bengali" },
  { code: "BS", name: "Bosnian", encoding: "windows-1250" },
  { code: "BG", name: "Bulgarian", encoding: "windows-1251" },
  { code: "BG_EN", name: "Bulgarian & English", encoding: "windows-1251" },
  { code: "MY", name: "Burmese" },
  { code: "CA", name: "Catalan" },
  { code: "ZH", name: "Chinese (Simplified)", encoding: "gbk" },
  { code: "ZH_BG", name: "Chinese (Traditional)", encoding: "big5" },
  { code: "HR", name: "Croatian", encoding: "windows-1250" },
  { code: "CS", name: "Czech", encoding: "windows-1250" },
  { code: "DA", name: "Danish" },
  { code: "NL", name: "Dutch" },
  { code: "NL_EN", name: "Dutch & English" },
  { code: "EN", name: "English" },
  { code: "EN_DE", name: "English & German" },
  { code: "EO", name: "Esperanto" },
  { code: "ET", name: "Estonian", encoding: "windows-1257" },
  { code: "FA", name: "Farsi (Persian)", encoding: "windows-1256" },
  { code: "FI", name: "Finnish" },
  { code: "FR", name: "French" },
  { code: "KA", name: "Georgian" },
  { code: "DE", name: "German" },
  { code: "EL", name: "Greek", encoding: "windows-1253" },
  { code: "KL", name: "Greenlandic" },
  { code: "HE", name: "Hebrew", encoding: "windows-1255" },
  { code: "HI", name: "Hindi" },
  { code: "HU", name: "Hungarian", encoding: "windows-1250" },
  { code: "HU_EN", name: "Hungarian & English", encoding: "windows-1250" },
  { code: "IS", name: "Icelandic" },
  { code: "ID", name: "Indonesian" },
  { code: "IT", name: "Italian" },
  { code: "JA", name: "Japanese", encoding: "shift_jis" },
  { code: "KO", name: "Korean", encoding: "euc-kr" },
  { code: "KU", name: "Kurdish", encoding: "windows-1256" },
  { code: "LV", name: "Latvian", encoding: "windows-1257" },
  { code: "LT", name: "Lithuanian", encoding: "windows-1257" },
  { code: "MK", name: "Macedonian", encoding: "windows-1251" },
  { code: "MS", name: "Malay" },
  { code: "ML", name: "Malayalam" },
  { code: "MNI", name: "Manipuri" },
  { code: "NO", name: "Norwegian" },
  { code: "PL", name: "Polish", encoding: "windows-1250" },
  { code: "PT", name: "Portuguese" },
  { code: "BR_PT", name: "Portuguese (Brazil)" },
  { code: "RO", name: "Romanian", encoding: "windows-1250" },
  { code: "RU", name: "Russian", encoding: "windows-1251" },
  { code: "SR", name: "Serbian", encoding: "windows-1250" },
  { code: "SI", name: "Sinhala" },
  { code: "SK", name: "Slovak", encoding: "windows-1250" },
  { code: "SL", name: "Slovenian", encoding: "windows-1250" },
  { code: "ES", name: "Spanish" },
  { code: "SV", name: "Swedish" },
  { code: "TL", name: "Tagalog" },
  { code: "TA", name: "Tamil" },
  { code: "TE", name: "Telugu" },
  { code: "TH", name: "Thai", encoding: "windows-874" },
  { code: "TR", name: "Turkish", encoding: "windows-1254" },
  { code: "UK", name: "Ukrainian", encoding: "windows-1251" },
  { code: "UR", name: "Urdu", encoding: "windows-1256" },
  { code: "VI", name: "Vietnamese", encoding: "windows-1258" },
];

const LOCALE_CODES = { "pt-br": "BR_PT", "zh-tw": "ZH_BG", "zh-hk": "ZH_BG" };

export function findLanguage(code) {
  return LANGUAGES.find((language) => language.code === code);
}

export function defaultLanguage(locale = navigator.language) {
  const lower = locale.toLowerCase();
  const code = LOCALE_CODES[lower] ?? lower.split("-")[0].toUpperCase();
  return findLanguage(code) ? code : "EN";
}

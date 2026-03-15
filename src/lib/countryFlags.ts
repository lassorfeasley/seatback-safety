/**
 * Country name -> ISO 3166-1 alpha-2 code mapping (subset used in collection).
 * Fallback: first two letters of country name for flag emoji, or globe if invalid.
 */
const COUNTRY_TO_ISO: Record<string, string> = {
  "United States": "US", "Canada": "CA", "United Kingdom": "GB", "France": "FR",
  "Germany": "DE", "Japan": "JP", "Australia": "AU", "Brazil": "BR",
  "Mexico": "MX", "Spain": "ES", "Italy": "IT", "Netherlands": "NL",
  "Switzerland": "CH", "Ireland": "IE", "South Korea": "KR", "China": "CN",
  "India": "IN", "Singapore": "SG", "Hong Kong": "HK", "Thailand": "TH",
  "Indonesia": "ID", "Malaysia": "MY", "Philippines": "PH", "New Zealand": "NZ",
  "South Africa": "ZA", "United Arab Emirates": "AE", "Saudi Arabia": "SA",
  "Turkey": "TR", "Russia": "RU", "Egypt": "EG", "Israel": "IL",
  "Portugal": "PT", "Belgium": "BE", "Austria": "AT", "Sweden": "SE",
  "Norway": "NO", "Finland": "FI", "Denmark": "DK", "Poland": "PL",
  "Greece": "GR", "Czech Republic": "CZ", "Hungary": "HU", "Romania": "RO",
  "Argentina": "AR", "Chile": "CL", "Colombia": "CO", "Peru": "PE",
  "Venezuela": "VE", "Jamaica": "JM", "Trinidad and Tobago": "TT",
  "Bahamas": "BS", "Barbados": "BB", "Panama": "PA", "Costa Rica": "CR",
  "Cuba": "CU", "Dominican Republic": "DO", "Puerto Rico": "PR",
  "Ivory Coast": "CI", "Kenya": "KE", "Nigeria": "NG", "Ethiopia": "ET",
  "Morocco": "MA", "Tunisia": "TN", "Ghana": "GH",
  "Taiwan": "TW", "Vietnam": "VN", "Pakistan": "PK", "Bangladesh": "BD",
  "Ukraine": "UA", "Belarus": "BY", "Kazakhstan": "KZ", "Iceland": "IS",
  "Luxembourg": "LU", "Slovenia": "SI", "Slovakia": "SK", "Croatia": "HR",
  "Serbia": "RS", "Bulgaria": "BG", "Estonia": "EE", "Latvia": "LV",
  "Lithuania": "LT", "North Macedonia": "MK", "Bosnia and Herzegovina": "BA",
  "Albania": "AL", "Georgia": "GE", "Armenia": "AM", "Azerbaijan": "AZ",
  "Uzbekistan": "UZ", "Sri Lanka": "LK", "Myanmar": "MM", "Cambodia": "KH",
  "Laos": "LA", "Mongolia": "MN", "North Korea": "KP", "Macau": "MO",
};

function isoToFlag(iso: string): string {
  if (!iso || iso.length !== 2 || !/^[a-zA-Z]+$/.test(iso)) return "🌐";
  const code = iso.toUpperCase();
  const offset = 127397;
  return [...code].map((c) => String.fromCodePoint(c.charCodeAt(0) + offset)).join("");
}

export function countryToFlag(name: string): string {
  const iso = COUNTRY_TO_ISO[name];
  if (iso) return isoToFlag(iso);
  // Try matching common variants
  const normalized = name.trim();
  const match = Object.entries(COUNTRY_TO_ISO).find(
    ([k]) => k.toLowerCase() === normalized.toLowerCase()
  );
  if (match) return isoToFlag(match[1]);
  // Fallback: use first two chars if they look like a code (e.g. "US")
  if (normalized.length >= 2 && /^[A-Za-z]{2}$/.test(normalized.slice(0, 2))) {
    return isoToFlag(normalized.slice(0, 2).toUpperCase());
  }
  return "🌐";
}

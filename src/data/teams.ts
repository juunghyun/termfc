/**
 * FIFA 3-letter code -> ISO 3166-1 alpha-2, for flag emoji derivation.
 * Static bundle (48-team World Cup + common codes) — zero network.
 */
const FIFA_TO_ISO2: Record<string, string> = {
  // Hosts + Americas
  USA: "us", MEX: "mx", CAN: "ca", ARG: "ar", BRA: "br", URU: "uy",
  COL: "co", ECU: "ec", PAR: "py", CHI: "cl", PER: "pe", VEN: "ve",
  BOL: "bo", PAN: "pa", CRC: "cr", HON: "hn", SLV: "sv", GUA: "gt",
  JAM: "jm", HAI: "ht", CUW: "cw", TRI: "tt", CUB: "cu",
  // Europe
  ENG: "gb-eng", SCO: "gb-sct", WAL: "gb-wls", NIR: "gb-nir",
  FRA: "fr", GER: "de", ESP: "es", POR: "pt", ITA: "it", NED: "nl",
  BEL: "be", CRO: "hr", SUI: "ch", AUT: "at", DEN: "dk", SWE: "se",
  NOR: "no", POL: "pl", CZE: "cz", SVK: "sk", SVN: "si", SRB: "rs",
  UKR: "ua", ROU: "ro", HUN: "hu", GRE: "gr", TUR: "tr", IRL: "ie",
  ISL: "is", FIN: "fi", ALB: "al", BIH: "ba", MKD: "mk", GEO: "ge",
  // Africa
  MAR: "ma", SEN: "sn", TUN: "tn", ALG: "dz", EGY: "eg", NGA: "ng",
  GHA: "gh", CMR: "cm", CIV: "ci", MLI: "ml", BFA: "bf", RSA: "za",
  COD: "cd", CPV: "cv", GAB: "ga", GUI: "gn", ZAM: "zm", ANG: "ao",
  // Asia / Oceania
  KOR: "kr", JPN: "jp", KSA: "sa", IRN: "ir", AUS: "au", QAT: "qa",
  UAE: "ae", IRQ: "iq", UZB: "uz", JOR: "jo", OMA: "om", BHR: "bh",
  KUW: "kw", CHN: "cn", IND: "in", THA: "th", VIE: "vn", IDN: "id",
  MAS: "my", NZL: "nz", FIJ: "fj",
};

/** Regional-indicator flag emoji from a FIFA team code. */
export function flagEmoji(fifaCode: string | undefined): string {
  if (!fifaCode) return "🏳️";
  const iso = FIFA_TO_ISO2[fifaCode.toUpperCase()];
  if (!iso) return "🏳️";
  if (iso.startsWith("gb-")) {
    // UK sub-flags render inconsistently across terminals — use 🏴 variants.
    const tags: Record<string, string> = {
      "gb-eng": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
      "gb-sct": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
      "gb-wls": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
      "gb-nir": "🇬🇧",
    };
    return tags[iso] ?? "🇬🇧";
  }
  const A = 0x1f1e6;
  const chars = iso
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(A + c.charCodeAt(0) - 65));
  return chars.join("");
}

/**
 * Content-policy gate data (requirements §3): expressions that must never
 * appear in any tone's output — profanity, personal disparagement, mockery
 * markers. Lives under test/ ON PURPOSE: this list must never be bundled
 * into the published CLI (a banned-word list inside dist/cli.js is its own
 * reputational risk).
 *
 * The community tone is the 순한맛 (mild) register by decision — laughter
 * markers (ㅋ/ㄷㄷ) are banned globally, not just for sensitive events.
 */

/** Substrings banned in every tone, every event type, every context. */
export const BANNED_EVERYWHERE: readonly string[] = [
  // profanity / slurs
  "시발", "씨발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅄ", "ㅂㅅ", "존나", "ㅈㄴ",
  "새끼", "지랄", "닥쳐", "꺼져", "엿같", "좆",
  // personal disparagement (실력 폄하·인신)
  "멍청", "바보", "호구", "쓰레기", "노답", "발컨", "한심", "형편없",
  "역겹", "재수없", "찐따", "루저", "허접", "구리다", "구려",
  // mockery / meme markers (banned by the 순한맛 decision)
  "ㅋ", "ㄷㄷ", "ㅉ", "극혐", "노잼", "눈물바다", "조롱",
  // english equivalents (player names pass through in official tone)
  "idiot", "loser", "trash", "stupid", "suck",
];

/**
 * Additionally banned in sensitive-event sentences (자책골·PK 실축·퇴장):
 * celebration/exclamation at a person's failure reads as mockery even in
 * mild wording.
 */
export const BANNED_IN_SENSITIVE: readonly string[] = [
  "!!", "이득", "개이득", "꿀잼", "저럴거면", "덕분에",
];

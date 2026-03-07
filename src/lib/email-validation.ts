/**
 * Corporate email validation.
 * COS requires business email addresses — personal email providers are blocked.
 */

const PERSONAL_EMAIL_DOMAINS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  // Yahoo
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.it",
  "yahoo.es",
  "yahoo.ca",
  "yahoo.com.au",
  "yahoo.co.jp",
  "ymail.com",
  "rocketmail.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // AOL
  "aol.com",
  "aim.com",
  // ProtonMail
  "protonmail.com",
  "proton.me",
  "pm.me",
  // Other common personal providers
  "mail.com",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "fastmail.com",
  "tutanota.com",
  "tuta.io",
  "hey.com",
  "yandex.com",
  "mail.ru",
  "inbox.com",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "cox.net",
  "charter.net",
]);

export function isPersonalEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

export function isCorporateEmail(email: string): boolean {
  return !isPersonalEmail(email);
}

export function getEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export const CORPORATE_EMAIL_ERROR =
  "Please use your work email. Personal email addresses (Gmail, Yahoo, etc.) aren't supported — we use your email domain to identify your firm.";

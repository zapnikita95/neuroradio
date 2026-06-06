import { getAccountProfile } from './account-store.js';

const DEFAULT_ADMIN_EMAILS = ['zap.nikita95@gmail.com'];

function adminEmailSet(): Set<string> {
  const fromEnv =
    process.env.ADMIN_EMAILS?.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [];
  return new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
}

/** Logged-in account email is in the admin list. */
export function isAdminInstall(installId: string): boolean {
  const email = getAccountProfile(installId).email?.trim().toLowerCase();
  if (!email) return false;
  return adminEmailSet().has(email);
}

/** Dev tier switch in app settings — only for admin accounts. */
export function canUseDevTierSwitch(installId: string): boolean {
  return isAdminInstall(installId);
}

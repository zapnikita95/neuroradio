import { getAccountProfile } from './account-store.js';
import { isDevTierSwitchEnabled } from './dev-tier-store.js';

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

/** Dev tier switch in app settings — admin accounts or ALLOW_DEV_TIER_SWITCH=true on server. */
export function canUseDevTierSwitch(installId: string): boolean {
  if (isDevTierSwitchEnabled()) return true;
  return isAdminInstall(installId);
}

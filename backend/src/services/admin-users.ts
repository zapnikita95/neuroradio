import { getAccountProfile } from './account-store.js';

const DEFAULT_ADMIN_EMAILS = ['zap.nikita95@gmail.com'];

function adminEmailSet(): Set<string> {
  const fromEnv =
    process.env.ADMIN_EMAILS?.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [];
  return new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
}

export function isListedAdminEmail(emailRaw: string): boolean {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return false;
  return adminEmailSet().has(email);
}

/** Logged-in account email is in the admin list. */
export function isAdminInstall(installId: string): boolean {
  const email = getAccountProfile(installId).email?.trim().toLowerCase();
  if (!email) return false;
  return isListedAdminEmail(email);
}

function isDevTierSwitchEnvEnabled(): boolean {
  const flag = process.env.ALLOW_DEV_TIER_SWITCH?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

/** Dev tier switch in app settings — admin accounts or ALLOW_DEV_TIER_SWITCH=true on server. */
export function canUseDevTierSwitch(installId: string): boolean {
  if (isDevTierSwitchEnvEnabled()) return true;
  return isAdminInstall(installId);
}

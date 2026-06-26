import type { DeepSearchMode } from './deep-search-provider.js';
import type { UserTier } from './entitlements.js';
import { hasPremiumEntitlement } from './entitlements.js';

export function isDeepSearchEnabled(): boolean {
  const flag = process.env.DEEP_SEARCH_ENABLED?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

export function resolveDeepSearchMode(tier: UserTier): DeepSearchMode {
  const env = process.env.DEEP_SEARCH_PROVIDER?.trim().toLowerCase();
  if (env === 'tavily' && process.env.TAVILY_API_KEY?.trim()) return 'tavily';
  if (env === 'perplexity' && process.env.PERPLEXITY_API_KEY?.trim()) return 'perplexity';
  if (tier === 'premium' || tier === 'unlimited' || tier === 'trial') {
    if (process.env.TAVILY_API_KEY?.trim()) return 'tavily';
    if (process.env.PERPLEXITY_API_KEY?.trim()) return 'perplexity';
  }
  return 'ddg_jina';
}

export function canRunDeepSearch(
  installId: string,
  tier: UserTier,
  clientRequestedDeepSearch = false,
): boolean {
  if (!clientRequestedDeepSearch) return false;
  if (!isDeepSearchEnabled()) return false;
  if (tier === 'free') return false;
  return hasPremiumEntitlement(installId) || tier === 'trial';
}

export function resolveDeepSearchMonthlyCap(): number {
  return parseInt(process.env.DEEP_SEARCH_MONTHLY_CAP ?? '60', 10);
}

export function resolveDeepSearchDailyCap(): number {
  return parseInt(process.env.DEEP_SEARCH_DAILY_CAP ?? '5', 10);
}

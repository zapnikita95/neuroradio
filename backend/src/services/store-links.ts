function siteBaseUrl(): string {
  const raw =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.TELEGRAM_WIDGET_BASE_URL?.trim() ||
    'https://www.efir-ai.ru';
  return raw.replace(/\/$/, '');
}

export function getAppStoreUrl(): string | null {
  const url = process.env.APP_STORE_URL?.trim();
  return url || null;
}

export function getGooglePlayUrl(): string | null {
  const url = process.env.GOOGLE_PLAY_URL?.trim();
  return url || null;
}

export function getAccountPageUrl(): string {
  return `${siteBaseUrl()}/account/`;
}

export function getPublicStoreLinks(): {
  siteUrl: string;
  accountUrl: string;
  appStoreUrl: string | null;
  googlePlayUrl: string | null;
} {
  return {
    siteUrl: siteBaseUrl(),
    accountUrl: getAccountPageUrl(),
    appStoreUrl: getAppStoreUrl(),
    googlePlayUrl: getGooglePlayUrl(),
  };
}

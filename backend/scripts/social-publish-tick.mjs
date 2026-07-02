#!/usr/bin/env node
/** Cron entry: one social publish tick. */
import { runSocialPublishTick, isSocialPublishEnabled } from '../dist/services/social-publish-tick.js';

if (!isSocialPublishEnabled()) {
  console.log('[social-publish-tick] SOCIAL_PUBLISH_ENABLED != true — skip');
  process.exit(0);
}

runSocialPublishTick()
  .then((r) => {
    console.log('[social-publish-tick]', JSON.stringify(r));
    process.exit(r.published || !r.error ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

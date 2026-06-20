#!/usr/bin/env node
/** Re-score facts-bank.json with current isHot / interestScore rules (after narrative gate fixes). */
import '../dist/load-env.js';
import { refreshBankInterestScores, BANK_PATH } from '../dist/services/fact-bank.js';

const updated = refreshBankInterestScores();
console.log(`Refreshed ${updated} fact entries in ${BANK_PATH}`);

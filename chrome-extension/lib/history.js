const KEY = 'story_history_v1';

/** @typedef {{ id: string; trackKey: string; artist: string; title: string; script: string; playedAt: number; audioUrl?: string }} HistoryEntry */

export async function loadHistory() {
  const data = await chrome.storage.local.get(KEY);
  return /** @type {HistoryEntry[]} */ (data[KEY] ?? []);
}

/** @param {Omit<HistoryEntry, 'id'>} entry */
export async function addHistory(entry) {
  const list = await loadHistory();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  list.unshift({ ...entry, id });
  await chrome.storage.local.set({ [KEY]: list.slice(0, 80) });
  return id;
}

export async function clearHistory() {
  await chrome.storage.local.set({ [KEY]: [] });
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const COMMANDS_FILE = path.join(DATA_DIR, 'harvest-agent-commands.json');
const AGENT_STATE_FILE = path.join(DATA_DIR, 'harvest-agent-state.json');

export type HarvestAgentAction = 'youtube-queue' | 'youtube-retry' | 'bulk-seed' | 'sync-dashboard';

export interface HarvestAgentCommand {
  id: string;
  action: HarvestAgentAction;
  createdAt: string;
  createdBy: string;
  status: 'pending' | 'dispatched' | 'done' | 'failed';
  dispatchedAt?: string;
  finishedAt?: string;
  result?: string;
}

interface CommandsFile {
  commands: HarvestAgentCommand[];
}

export interface HarvestAgentState {
  lastPollAt?: string;
  lastHeartbeatAt?: string;
  hostname?: string;
  pid?: number;
  version?: string;
}

function readCommands(): CommandsFile {
  try {
    if (!fs.existsSync(COMMANDS_FILE)) return { commands: [] };
    return JSON.parse(fs.readFileSync(COMMANDS_FILE, 'utf8')) as CommandsFile;
  } catch {
    return { commands: [] };
  }
}

function writeCommands(data: CommandsFile): void {
  fs.mkdirSync(path.dirname(COMMANDS_FILE), { recursive: true });
  const tmp = `${COMMANDS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, COMMANDS_FILE);
}

function readAgentState(): HarvestAgentState {
  try {
    if (!fs.existsSync(AGENT_STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(AGENT_STATE_FILE, 'utf8')) as HarvestAgentState;
  } catch {
    return {};
  }
}

function writeAgentState(state: HarvestAgentState): void {
  fs.mkdirSync(path.dirname(AGENT_STATE_FILE), { recursive: true });
  fs.writeFileSync(AGENT_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function enqueueHarvestAgentCommand(
  action: HarvestAgentAction,
  createdBy = 'dashboard',
): HarvestAgentCommand {
  const data = readCommands();
  const cmd: HarvestAgentCommand = {
    id: crypto.randomUUID(),
    action,
    createdAt: new Date().toISOString(),
    createdBy,
    status: 'pending',
  };
  data.commands.unshift(cmd);
  data.commands = data.commands.slice(0, 100);
  writeCommands(data);
  return cmd;
}

/** Agent poll: return pending commands and mark dispatched. */
export function claimPendingHarvestCommands(limit = 5): HarvestAgentCommand[] {
  const data = readCommands();
  const now = new Date().toISOString();
  const claimed: HarvestAgentCommand[] = [];
  for (const cmd of data.commands) {
    if (cmd.status !== 'pending') continue;
    cmd.status = 'dispatched';
    cmd.dispatchedAt = now;
    claimed.push({ ...cmd });
    if (claimed.length >= limit) break;
  }
  if (claimed.length) writeCommands(data);
  return claimed;
}

export function finishHarvestAgentCommand(
  id: string,
  ok: boolean,
  result?: string,
): HarvestAgentCommand | null {
  const data = readCommands();
  const cmd = data.commands.find((c) => c.id === id);
  if (!cmd) return null;
  cmd.status = ok ? 'done' : 'failed';
  cmd.finishedAt = new Date().toISOString();
  if (result) cmd.result = result.slice(0, 500);
  writeCommands(data);
  return cmd;
}

export function touchHarvestAgentPoll(meta: Partial<HarvestAgentState> = {}): HarvestAgentState {
  const prev = readAgentState();
  const next: HarvestAgentState = {
    ...prev,
    ...meta,
    lastPollAt: new Date().toISOString(),
    lastHeartbeatAt: new Date().toISOString(),
    hostname: meta.hostname ?? prev.hostname ?? os.hostname(),
  };
  writeAgentState(next);
  return next;
}

export function getHarvestAgentBridgeStatus(): {
  agentOnline: boolean;
  lastSeen?: string;
  pending: number;
  recent: HarvestAgentCommand[];
  state: HarvestAgentState;
} {
  const data = readCommands();
  const state = readAgentState();
  const lastSeen = state.lastHeartbeatAt ?? state.lastPollAt;
  const ageMs = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Number.POSITIVE_INFINITY;
  const pending = data.commands.filter((c) => c.status === 'pending').length;
  return {
    agentOnline: ageMs < 45_000,
    lastSeen,
    pending,
    recent: data.commands.slice(0, 12),
    state,
  };
}

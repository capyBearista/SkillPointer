#!/usr/bin/env bun
import { $ } from 'bun';
import * as YAML from 'yaml';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
} from 'node:fs';
import { KEYWORDS } from './gather-fixtures.keywords.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(HERE);
const FIXTURES_DIR = join(PROJECT_ROOT, 'docs/internal/intel-fixtures');
const SKILLS_DIR = join(FIXTURES_DIR, 'skills');
const REPORT_FILE = join(FIXTURES_DIR, 'gather-report.json');
const STATE_FILE = join(FIXTURES_DIR, 'gather-state.json');
const NOTICE_FILE = join(FIXTURES_DIR, 'NOTICE.md');

const SKILLS_API = process.env.SKILLS_API_URL ?? 'https://skills.sh';
const GITHUB_API = 'https://api.github.com';
const RAW_GH = 'https://raw.githubusercontent.com';
const USER_AGENT = 'skillcat-fixtures/1.0';

const PRIORITY_PREFIXES = [
  '',
  'skills/',
  'skills/.curated/',
  'skills/.experimental/',
  'skills/.system/',
  '.agents/skills/',
  '.claude/skills/',
  '.cline/skills/',
  '.codebuddy/skills/',
  '.codex/skills/',
  '.commandcode/skills/',
  '.continue/skills/',
  '.cursor/skills/',
  '.github/skills/',
  '.goose/skills/',
  '.iflow/skills/',
  '.junie/skills/',
  '.kilocode/skills/',
  '.kiro/skills/',
  '.mux/skills/',
  '.neovate/skills/',
  '.opencode/skills/',
  '.openhands/skills/',
  '.pi/skills/',
  '.qoder/skills/',
  '.roo/skills/',
  '.trae/skills/',
  '.windsurf/skills/',
  '.zencoder/skills/',
];

const DEFAULTS = {
  maxQueries: 10,
  target: 1000,
  minStars: 1000,
  searchConcurrency: 4,
  ghConcurrency: 6,
  rawConcurrency: 16,
  searchJitterMs: 75,
  fetchTimeoutMs: 10_000,
  perRepoCap: 40,
  perKeywordCap: 15,
  maxBlobBytes: 200_000,
};

type Tier = {
  tier: number;
  bodyMin: number;
  descMin: number;
  forbiddenNameOn: boolean;
  injectionReject: boolean;
  licenseBlock: boolean;
};

const TIERS: Tier[] = [
  { tier: 1, bodyMin: 800, descMin: 20, forbiddenNameOn: true, injectionReject: true, licenseBlock: true },
  { tier: 2, bodyMin: 500, descMin: 15, forbiddenNameOn: true, injectionReject: true, licenseBlock: true },
  { tier: 3, bodyMin: 300, descMin: 10, forbiddenNameOn: true, injectionReject: false, licenseBlock: true },
  { tier: 4, bodyMin: 300, descMin: 10, forbiddenNameOn: false, injectionReject: false, licenseBlock: false },
];

const FORBIDDEN_NAME_RE =
  /^(test|hello|foo|bar|baz|example|demo|scaffold|template|starter|sample|boilerplate|placeholder|untitled|todo|wip|draft)(-.*)?$/i;
const INJECTION_RE = /ignore\s+(all\s+|previous\s+|prior\s+)?(instructions|prompts)/i;
const PLACEHOLDER_RE = /lorem ipsum|TODO:\s*write|<!--\s*placeholder/i;
const NAME_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
const RESTRICTED_LICENSES = new Set(['proprietary', 'none', 'unlicensed', 'no-redistribute']);

interface SearchHit {
  slug: string;
  name: string;
  source: string;
  installs: number;
  primaryKeyword: string;
}

interface RepoTree {
  ownerRepo: string;
  branch: string;
  truncated: boolean;
  tree: Array<{ path: string; type: string; sha: string; size?: number }>;
}

interface Candidate {
  ownerRepo: string;
  branch: string;
  mdPath: string;
  size?: number;
  primaryKeyword: string;
  installsHint: number;
}

interface Fetched extends Candidate {
  rawContent: string;
}

interface Parsed extends Fetched {
  fmName: string;
  fmDescription: string;
  fmMetadata?: Record<string, unknown>;
  fmLicense?: string;
  body: string;
  slug: string;
  depth: number;
}

interface RunStats {
  searchQueries: number;
  searchHits: number;
  uniqueReposDiscovered: number;
  reposPassedStarsGate: number;
  reposRejectedByStars: number;
  treesSucceeded: number;
  treesTruncated: number;
  treesFailed: number;
  candidateFilesFound: number;
  candidateFilesFetched: number;
  rejectedByFilter: Record<string, number>;
  loosenTierReached: number;
  collisionsWithExisting: number;
  inRunCollisions: number;
  written: number;
  totalFixturesAfterRun: number;
}

interface Report {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  config: { maxQueries: number; target: number; minStars: number; concurrency: Record<string, number> };
  stats: RunStats;
  rateLimit: { githubRemaining: number | null; resetAt: string | null };
  keywordYield: Record<string, number>;
  rejectedRepos: Array<{ ownerRepo: string; stars: number; reason: string }>;
  collisionsWithExisting: Array<{ slug: string; sourceRepo: string; path: string }>;
  inRunCollisions: Array<{ slug: string; winner: string; losers: string[] }>;
  failures: Array<{ stage: string; repo?: string; path?: string; error: string }>;
  sampledWinners: Array<{ slug: string; descriptionPrefix: string; source: string }>;
}

function pLimit(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    while (active < n && queue.length > 0) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          active--;
          next();
        }
      });
      next();
    });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitFrontmatter(content: string): { fm: Record<string, unknown>; body: string } | null {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const closerIdx = normalized.indexOf('\n---', 4);
  if (closerIdx < 0) return null;
  const fmText = normalized.slice(4, closerIdx);
  let bodyStart = closerIdx + 4;
  if (normalized[bodyStart] === '\n') bodyStart++;
  const body = normalized.slice(bodyStart);
  try {
    const fm = YAML.parse(fmText) ?? {};
    if (typeof fm !== 'object' || Array.isArray(fm)) return null;
    return { fm: fm as Record<string, unknown>, body };
  } catch {
    return null;
  }
}

function isValidUtf8(text: string): boolean {
  return !text.includes('\uFFFD');
}

function findSkillMdPaths(tree: RepoTree): Array<{ path: string; size?: number }> {
  if (tree.truncated) return [];

  const allSkillMds = tree.tree
    .filter(
      (e) =>
        e.type === 'blob' &&
        e.path.endsWith('SKILL.md') &&
        (e.size === undefined || e.size < DEFAULTS.maxBlobBytes),
    )
    .map((e) => ({ path: e.path, size: e.size }));

  if (allSkillMds.length === 0) return [];

  const priority: Array<{ path: string; size?: number }> = [];
  const seen = new Set<string>();

  for (const prefix of PRIORITY_PREFIXES) {
    for (const entry of allSkillMds) {
      if (!entry.path.startsWith(prefix)) continue;
      const rest = entry.path.slice(prefix.length);
      if (rest === 'SKILL.md') {
        if (!seen.has(entry.path)) {
          priority.push(entry);
          seen.add(entry.path);
        }
        continue;
      }
      const parts = rest.split('/');
      if (parts.length === 2 && parts[1] === 'SKILL.md') {
        if (!seen.has(entry.path)) {
          priority.push(entry);
          seen.add(entry.path);
        }
      }
    }
  }

  if (priority.length > 0) return priority;
  return allSkillMds.filter((e) => e.path.split('/').length <= 6);
}

async function fetchWithRetries(
  url: string,
  init: RequestInit = {},
  retries = 2,
  backoffMs = 300,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(DEFAULTS.fetchTimeoutMs) });
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(backoffMs * (attempt + 1));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

async function getGhToken(): Promise<string | null> {
  try {
    const out = await $`gh auth token`.quiet().text();
    const t = out.trim();
    return t || null;
  } catch {
    return null;
  }
}

interface Flags {
  maxQueries: number;
  target: number;
  minStars: number;
  dryRun: boolean;
  resume: boolean;
  verify: boolean;
  forceTier: number | null;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    maxQueries: DEFAULTS.maxQueries,
    target: DEFAULTS.target,
    minStars: DEFAULTS.minStars,
    dryRun: false,
    resume: false,
    verify: false,
    forceTier: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max-queries') flags.maxQueries = Number(argv[++i]);
    else if (a === '--target') flags.target = Number(argv[++i]);
    else if (a === '--min-stars') flags.minStars = Number(argv[++i]);
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--resume') flags.resume = true;
    else if (a === '--verify') flags.verify = true;
    else if (a === '--loosen-tier') flags.forceTier = Number(argv[++i]);
  }
  return flags;
}

function readExistingSlugs(): Set<string> {
  if (!existsSync(SKILLS_DIR)) return new Set();
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  return new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name));
}

function emptyStats(): RunStats {
  return {
    searchQueries: 0,
    searchHits: 0,
    uniqueReposDiscovered: 0,
    reposPassedStarsGate: 0,
    reposRejectedByStars: 0,
    treesSucceeded: 0,
    treesTruncated: 0,
    treesFailed: 0,
    candidateFilesFound: 0,
    candidateFilesFetched: 0,
    rejectedByFilter: {
      frontmatterMissing: 0,
      nameRegex: 0,
      descriptionRange: 0,
      bodyTooShort: 0,
      internalFlag: 0,
      forbiddenName: 0,
      promptInjection: 0,
      placeholderPhrase: 0,
      licenseBlocked: 0,
      slugCollision: 0,
      perRepoCap: 0,
      perKeywordCap: 0,
      invalidUtf8: 0,
    },
    loosenTierReached: 1,
    collisionsWithExisting: 0,
    inRunCollisions: 0,
    written: 0,
    totalFixturesAfterRun: 0,
  };
}

// ── Phase A: discover repos via skills.sh search ──
async function phaseA(
  keywords: ReadonlyArray<string>,
  stats: RunStats,
  report: Report,
): Promise<{ repos: Map<string, string>; searchHits: SearchHit[] }> {
  const limit = pLimit(DEFAULTS.searchConcurrency);
  const hits: SearchHit[] = [];
  const repos = new Map<string, string>(); // ownerRepo -> primaryKeyword

  const tasks = keywords.map((kw) =>
    limit(async () => {
      await sleep(Math.random() * DEFAULTS.searchJitterMs);
      stats.searchQueries++;
      const url = `${SKILLS_API}/api/search?q=${encodeURIComponent(kw)}&limit=10`;
      try {
        let resp = await fetchWithRetries(url, { headers: { 'User-Agent': USER_AGENT } });
        let backoff = 500;
        for (let attempt = 0; attempt < 3 && !resp.ok && (resp.status === 429 || resp.status >= 500); attempt++) {
          await sleep(backoff);
          backoff *= 2;
          resp = await fetchWithRetries(url, { headers: { 'User-Agent': USER_AGENT } });
        }
        if (!resp.ok) {
          report.failures.push({ stage: 'search', error: `${kw}: HTTP ${resp.status}` });
          report.keywordYield[kw] = 0;
          return;
        }
        const data = (await resp.json()) as {
          skills?: Array<{ id: string; name: string; installs: number; source: string }>;
        };
        const skills = data.skills ?? [];
        report.keywordYield[kw] = skills.length;
        stats.searchHits += skills.length;
        for (const s of skills) {
          hits.push({
            slug: s.id,
            name: s.name,
            source: s.source,
            installs: s.installs ?? 0,
            primaryKeyword: kw,
          });
          if (s.source && !repos.has(s.source)) repos.set(s.source, kw);
        }
      } catch (e) {
        report.failures.push({ stage: 'search', error: `${kw}: ${(e as Error).message}` });
        report.keywordYield[kw] = 0;
      }
    }),
  );
  await Promise.all(tasks);

  stats.uniqueReposDiscovered = repos.size;
  return { repos, searchHits: hits };
}

// ── Phase B0: stars gate ──
async function phaseB0(
  repos: Map<string, string>,
  token: string | null,
  minStars: number,
  stats: RunStats,
  report: Report,
): Promise<Map<string, { stars: number; primaryKeyword: string }>> {
  const limit = pLimit(DEFAULTS.ghConcurrency);
  const pass = new Map<string, { stars: number; primaryKeyword: string }>();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const tasks = [...repos.entries()].map(([ownerRepo, kw]) =>
    limit(async () => {
      try {
        const resp = await fetchWithRetries(`${GITHUB_API}/repos/${ownerRepo}`, { headers });
        if (resp.status === 403) {
          const reset = resp.headers.get('x-ratelimit-reset');
          if (reset) {
            const until = Number(reset) * 1000 - Date.now();
            if (until > 0 && until < 60_000) await sleep(until + 500);
          }
        }
        if (!resp.ok) {
          report.failures.push({ stage: 'stars', repo: ownerRepo, error: `HTTP ${resp.status}` });
          return;
        }
        const data = (await resp.json()) as { stargazers_count?: number };
        const stars = data.stargazers_count ?? 0;
        if (stars >= minStars) {
          pass.set(ownerRepo, { stars, primaryKeyword: kw });
          stats.reposPassedStarsGate++;
          // Update rate-limit info if available
          const rem = resp.headers.get('x-ratelimit-remaining');
          const rst = resp.headers.get('x-ratelimit-reset');
          if (rem !== null) report.rateLimit.githubRemaining = Number(rem);
          if (rst !== null) report.rateLimit.resetAt = new Date(Number(rst) * 1000).toISOString();
        } else {
          stats.reposRejectedByStars++;
          report.rejectedRepos.push({ ownerRepo, stars, reason: 'below-min-stars' });
        }
      } catch (e) {
        report.failures.push({ stage: 'stars', repo: ownerRepo, error: (e as Error).message });
      }
    }),
  );
  await Promise.all(tasks);
  return pass;
}

// ── Phase B: tree enumeration ──
async function phaseB(
  repos: Map<string, { stars: number; primaryKeyword: string }>,
  searchHitsByRepo: Map<string, SearchHit[]>,
  token: string | null,
  stats: RunStats,
  report: Report,
): Promise<Candidate[]> {
  const limit = pLimit(DEFAULTS.ghConcurrency);
  const candidates: Candidate[] = [];
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': USER_AGENT,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const tasks = [...repos.entries()].map(([ownerRepo, meta]) =>
    limit(async () => {
      const branches = ['HEAD', 'main', 'master'];
      let tree: RepoTree | null = null;
      for (const br of branches) {
        try {
          const url = `${GITHUB_API}/repos/${ownerRepo}/git/trees/${encodeURIComponent(br)}?recursive=1`;
          const resp = await fetchWithRetries(url, { headers });
          if (resp.status === 403) {
            const reset = resp.headers.get('x-ratelimit-reset');
            if (reset) {
              const until = Number(reset) * 1000 - Date.now();
              if (until > 0 && until < 60_000) await sleep(until + 500);
            }
          }
          if (!resp.ok) continue;
          const data = (await resp.json()) as {
            sha: string;
            tree: Array<{ path: string; type: string; sha: string; size?: number }>;
            truncated?: boolean;
          };
          tree = {
            ownerRepo,
            branch: br,
            truncated: data.truncated === true,
            tree: data.tree,
          };
          break;
        } catch (e) {
          report.failures.push({ stage: 'tree', repo: ownerRepo, error: (e as Error).message });
        }
      }
      if (!tree) {
        stats.treesFailed++;
        return;
      }
      if (tree.truncated) {
        stats.treesTruncated++;
        report.failures.push({ stage: 'tree', repo: ownerRepo, error: 'tree truncated' });
        return;
      }
      stats.treesSucceeded++;

      const paths = findSkillMdPaths(tree);
      const hits = searchHitsByRepo.get(ownerRepo) ?? [];
      const installsByFolder = new Map<string, number>();
      for (const h of hits) installsByFolder.set(toSkillSlug(h.name), h.installs);

      for (const p of paths) {
        const folder = p.path.replace(/\/?SKILL\.md$/, '');
        const folderName = folder.split('/').pop() ?? '';
        const installsHint = installsByFolder.get(toSkillSlug(folderName)) ?? 0;
        candidates.push({
          ownerRepo,
          branch: tree.branch,
          mdPath: p.path,
          size: p.size,
          primaryKeyword: meta.primaryKeyword,
          installsHint,
        });
      }
    }),
  );
  await Promise.all(tasks);
  stats.candidateFilesFound = candidates.length;
  return candidates;
}

// ── Phase C1: fetch all candidate SKILL.md content (no filter yet) ──
async function fetchAllCandidates(
  candidates: Candidate[],
  stats: RunStats,
  report: Report,
): Promise<Fetched[]> {
  const limit = pLimit(DEFAULTS.rawConcurrency);
  const fetched: Fetched[] = [];

  const tasks = candidates.map((c) =>
    limit(async () => {
      const url = `${RAW_GH}/${c.ownerRepo}/${c.branch}/${c.mdPath}`;
      try {
        const resp = await fetchWithRetries(url, { headers: { 'User-Agent': USER_AGENT } });
        if (!resp.ok) {
          report.failures.push({ stage: 'raw', repo: c.ownerRepo, path: c.mdPath, error: `HTTP ${resp.status}` });
          return;
        }
        const rawContent = await resp.text();
        fetched.push({ ...c, rawContent });
      } catch (e) {
        report.failures.push({ stage: 'raw', repo: c.ownerRepo, path: c.mdPath, error: (e as Error).message });
      }
    }),
  );
  await Promise.all(tasks);
  stats.candidateFilesFetched = fetched.length;
  return fetched;
}

// ── Phase C2: parse & pre-filter invariants (UTF-8, frontmatter) ──
function parseAll(fetched: Fetched[], stats: RunStats): Parsed[] {
  const parsed: Parsed[] = [];
  for (const f of fetched) {
    if (!isValidUtf8(f.rawContent)) {
      stats.rejectedByFilter.invalidUtf8++;
      continue;
    }
    const split = splitFrontmatter(f.rawContent);
    if (!split) {
      stats.rejectedByFilter.frontmatterMissing++;
      continue;
    }
    const { fm, body } = split;
    const fmName = typeof fm.name === 'string' ? fm.name : '';
    const fmDescription = typeof fm.description === 'string' ? fm.description : '';
    const slug = toSkillSlug(fmName);
    if (!slug) {
      stats.rejectedByFilter.nameRegex++;
      continue;
    }
    if (!NAME_RE.test(slug)) {
      stats.rejectedByFilter.nameRegex++;
      continue;
    }
    const depth = f.mdPath.split('/').length;
    const fmMetadata = typeof fm.metadata === 'object' && fm.metadata !== null ? (fm.metadata as Record<string, unknown>) : undefined;
    const fmLicense = typeof fm.license === 'string' ? fm.license.toLowerCase() : undefined;
    parsed.push({
      ...f,
      fmName,
      fmDescription,
      fmMetadata,
      fmLicense,
      body,
      slug,
      depth,
    });
  }
  return parsed;
}

// ── Phase C3: tier filter + dedupe + caps ──
function applyTier(
  parsed: Parsed[],
  tier: Tier,
  existingSlugs: Set<string>,
  stats: RunStats,
  report: Report,
): Parsed[] {
  // Sort deterministically for stable tiebreaks: higher installsHint, lower depth, alpha ownerRepo
  const sorted = [...parsed].sort((a, b) => {
    if (b.installsHint !== a.installsHint) return b.installsHint - a.installsHint;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.ownerRepo.localeCompare(b.ownerRepo);
  });

  const winners: Parsed[] = [];
  const winnerBySlug = new Map<string, Parsed>();
  const perRepo = new Map<string, number>();
  const perKeyword = new Map<string, number>();

  for (const p of sorted) {
    // description range
    if (p.fmDescription.length < tier.descMin || p.fmDescription.length > 2000) {
      stats.rejectedByFilter.descriptionRange++;
      continue;
    }
    // body min
    if (p.body.length < tier.bodyMin) {
      stats.rejectedByFilter.bodyTooShort++;
      continue;
    }
    // internal flag
    if (
      p.fmMetadata &&
      (p.fmMetadata.internal === true || p.fmMetadata.private === true)
    ) {
      stats.rejectedByFilter.internalFlag++;
      continue;
    }
    // forbidden name
    if (tier.forbiddenNameOn && FORBIDDEN_NAME_RE.test(p.slug)) {
      stats.rejectedByFilter.forbiddenName++;
      continue;
    }
    // injection
    const first2k = p.body.slice(0, 2000);
    if (INJECTION_RE.test(first2k)) {
      if (tier.injectionReject) {
        stats.rejectedByFilter.promptInjection++;
        continue;
      }
      report.failures.push({
        stage: 'filter',
        repo: p.ownerRepo,
        path: p.mdPath,
        error: 'injection-pattern (kept, tier log-only)',
      });
    }
    // placeholder phrase (first 500 chars)
    const first500 = p.body.slice(0, 500);
    if (PLACEHOLDER_RE.test(first500)) {
      stats.rejectedByFilter.placeholderPhrase++;
      continue;
    }
    // license block
    if (tier.licenseBlock && p.fmLicense && RESTRICTED_LICENSES.has(p.fmLicense)) {
      stats.rejectedByFilter.licenseBlocked++;
      continue;
    }
    // existing dir collision
    if (existingSlugs.has(p.slug)) {
      stats.collisionsWithExisting++;
      report.collisionsWithExisting.push({
        slug: p.slug,
        sourceRepo: p.ownerRepo,
        path: p.mdPath,
      });
      stats.rejectedByFilter.slugCollision++;
      continue;
    }
    // in-run collision
    const prev = winnerBySlug.get(p.slug);
    if (prev) {
      stats.inRunCollisions++;
      const existingCollision = report.inRunCollisions.find((c) => c.slug === p.slug);
      if (existingCollision) {
        existingCollision.losers.push(`${p.ownerRepo}/${p.mdPath}`);
      } else {
        report.inRunCollisions.push({
          slug: p.slug,
          winner: `${prev.ownerRepo}/${prev.mdPath}`,
          losers: [`${p.ownerRepo}/${p.mdPath}`],
        });
      }
      continue;
    }
    // per-repo cap
    const repoCount = perRepo.get(p.ownerRepo) ?? 0;
    if (repoCount >= DEFAULTS.perRepoCap) {
      stats.rejectedByFilter.perRepoCap++;
      continue;
    }
    // per-keyword cap
    const kwCount = perKeyword.get(p.primaryKeyword) ?? 0;
    if (kwCount >= DEFAULTS.perKeywordCap) {
      stats.rejectedByFilter.perKeywordCap++;
      continue;
    }

    // ACCEPT
    winners.push(p);
    winnerBySlug.set(p.slug, p);
    perRepo.set(p.ownerRepo, repoCount + 1);
    perKeyword.set(p.primaryKeyword, kwCount + 1);
  }
  return winners;
}

// ── Phase D: write ──
function writeWinners(winners: Parsed[], dryRun: boolean, stats: RunStats): void {
  for (const w of winners) {
    const dir = join(SKILLS_DIR, w.slug);
    if (existsSync(dir)) continue; // belt & suspenders; filtered already
    if (dryRun) {
      stats.written++;
      continue;
    }
    if (w.slug.includes('/') || w.slug.includes('..') || w.slug.includes('\\')) continue;
    mkdirSync(dir, { recursive: true });
    let content = w.rawContent;
    if (!content.endsWith('\n')) content += '\n';
    writeFileSync(join(dir, 'SKILL.md'), content, 'utf8');
    appendFileSync(
      NOTICE_FILE,
      `- ${w.slug}: https://github.com/${w.ownerRepo}/blob/${w.branch}/${w.mdPath}\n`,
    );
    stats.written++;
  }
}

// ── verify existing fixtures against Tier 1 ──
function runVerify(): void {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`No fixtures dir at ${SKILLS_DIR}`);
    process.exit(1);
  }
  const tier = TIERS[0]!;
  const names = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const failures: Array<{ slug: string; reason: string }> = [];
  for (const slug of names) {
    const skillMd = join(SKILLS_DIR, slug, 'SKILL.md');
    if (!existsSync(skillMd)) {
      failures.push({ slug, reason: 'missing-SKILL.md' });
      continue;
    }
    const content = readFileSync(skillMd, 'utf8');
    const split = splitFrontmatter(content);
    if (!split) {
      failures.push({ slug, reason: 'frontmatter-missing' });
      continue;
    }
    const fmName = typeof split.fm.name === 'string' ? split.fm.name : '';
    const fmDesc = typeof split.fm.description === 'string' ? split.fm.description : '';
    if (!NAME_RE.test(toSkillSlug(fmName))) failures.push({ slug, reason: 'name-regex' });
    else if (fmDesc.length < tier.descMin) failures.push({ slug, reason: 'desc-too-short' });
    else if (split.body.length < tier.bodyMin) failures.push({ slug, reason: 'body-too-short' });
  }
  console.log(`Checked ${names.length} fixtures; failures: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.slug}: ${f.reason}`);
  process.exit(failures.length > 0 ? 2 : 0);
}

function sampleWinners(
  winners: Parsed[],
  n: number,
): Array<{ slug: string; descriptionPrefix: string; source: string }> {
  if (winners.length === 0) return [];
  const pool = [...winners];
  const out: Parsed[] = [];
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out.map((w) => ({
    slug: w.slug,
    descriptionPrefix: w.fmDescription.slice(0, 120),
    source: `${w.ownerRepo}/${w.mdPath}`,
  }));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  if (flags.verify) {
    runVerify();
    return;
  }

  if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
  if (!existsSync(NOTICE_FILE)) {
    writeFileSync(
      NOTICE_FILE,
      '# Notice\n\nEach entry is a fixture slug mapped to its upstream SKILL.md source.\n',
      'utf8',
    );
  }

  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  const report: Report = {
    startedAt,
    finishedAt: '',
    durationMs: 0,
    config: {
      maxQueries: flags.maxQueries,
      target: flags.target,
      minStars: flags.minStars,
      concurrency: {
        search: DEFAULTS.searchConcurrency,
        gh: DEFAULTS.ghConcurrency,
        raw: DEFAULTS.rawConcurrency,
      },
    },
    stats: emptyStats(),
    rateLimit: { githubRemaining: null, resetAt: null },
    keywordYield: {},
    rejectedRepos: [],
    collisionsWithExisting: [],
    inRunCollisions: [],
    failures: [],
    sampledWinners: [],
  };
  const stats = report.stats;

  const token = await getGhToken();
  if (!token) {
    console.warn('[warn] no gh auth token; GitHub API limit is 60/hr');
  }

  const selectedKeywords = KEYWORDS.slice(0, flags.maxQueries);
  console.log(`[phase A] sweep ${selectedKeywords.length} queries against ${SKILLS_API}`);
  const { repos, searchHits } = await phaseA(selectedKeywords, stats, report);
  console.log(
    `[phase A] done: ${stats.searchHits} hits, ${stats.uniqueReposDiscovered} unique repos`,
  );

  // group hits by repo for install hint lookup in Phase B
  const searchHitsByRepo = new Map<string, SearchHit[]>();
  for (const h of searchHits) {
    const arr = searchHitsByRepo.get(h.source) ?? [];
    arr.push(h);
    searchHitsByRepo.set(h.source, arr);
  }

  console.log(`[phase B0] stars gate (min=${flags.minStars}) for ${repos.size} repos`);
  const survivorRepos = await phaseB0(repos, token, flags.minStars, stats, report);
  console.log(
    `[phase B0] done: ${stats.reposPassedStarsGate} passed, ${stats.reposRejectedByStars} rejected`,
  );

  console.log(`[phase B] tree enumeration for ${survivorRepos.size} repos`);
  const candidates = await phaseB(survivorRepos, searchHitsByRepo, token, stats, report);
  console.log(
    `[phase B] done: ${stats.treesSucceeded} trees ok, ${stats.treesTruncated} truncated, ${stats.treesFailed} failed — ${candidates.length} candidate SKILL.md files`,
  );

  console.log(`[phase C1] fetch ${candidates.length} SKILL.md files`);
  const fetched = await fetchAllCandidates(candidates, stats, report);
  console.log(`[phase C1] done: ${fetched.length} fetched`);

  const parsed = parseAll(fetched, stats);
  console.log(`[phase C2] parsed ${parsed.length} (${fetched.length - parsed.length} pre-filtered)`);

  const existingSlugs = readExistingSlugs();
  const existingAtStart = existingSlugs.size;

  // Auto-loosen loop: add winners tier-by-tier until target or out of tiers
  const tiersToTry = flags.forceTier
    ? [TIERS[flags.forceTier - 1]!]
    : TIERS;
  let allWinners: Parsed[] = [];
  const winnerSlugs = new Set<string>();
  let tierUsed = tiersToTry[0]!.tier;

  for (const tier of tiersToTry) {
    tierUsed = tier.tier;
    const remaining = parsed.filter((p) => !winnerSlugs.has(p.slug));
    // Clone existingSlugs + already-winning for the pass
    const excludeSet = new Set(existingSlugs);
    for (const w of allWinners) excludeSet.add(w.slug);
    const tierWinners = applyTier(remaining, tier, excludeSet, stats, report);
    for (const w of tierWinners) {
      if (!winnerSlugs.has(w.slug)) {
        allWinners.push(w);
        winnerSlugs.add(w.slug);
      }
    }
    stats.loosenTierReached = tier.tier;
    const projectedTotal = existingAtStart + allWinners.length;
    console.log(
      `[phase C3] tier ${tier.tier}: +${tierWinners.length} winners (total new=${allWinners.length}, projected=${projectedTotal}/${flags.target})`,
    );
    if (projectedTotal >= flags.target) break;
  }

  // Respect --target ceiling
  const needed = Math.max(0, flags.target - existingAtStart);
  const toWrite = allWinners.slice(0, needed);

  console.log(`[phase D] write ${toWrite.length} new fixtures (dry-run=${flags.dryRun})`);
  writeWinners(toWrite, flags.dryRun, stats);

  // Final count
  stats.totalFixturesAfterRun = flags.dryRun
    ? existingAtStart + toWrite.length
    : readExistingSlugs().size;

  report.sampledWinners = sampleWinners(toWrite, 20);
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - t0;

  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
  if (existsSync(STATE_FILE)) {
    try {
      unlinkSync(STATE_FILE);
    } catch {
      // best-effort
    }
  }

  console.log(
    `[done] tier=${tierUsed} written=${stats.written} total=${stats.totalFixturesAfterRun} (target=${flags.target})`,
  );
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});

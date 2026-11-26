// token-radar-01 — entrypoint.
//
// What this program does, end to end:
//   1. reads one sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
//   2. scores every pre-token protocol with the radar-2 model in lib/model.ts,
//   3. writes the ranked board and the dashboard dataset,
//   4. copies the static dashboard and the three screenshots alongside them,
//   5. writes dossier.json last, because the judge rebuilds the dossier from
//      the finished output directory and compares it byte for byte.
//
// Only the Node 22 standard library is used, so the program runs in the
// grader's container with no install step and no network access.
//
// Run it outside the grader like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts \
//     --input ../token-radar-01-kit/input/snapshot.json
// Inside the grader the snapshot lives at /input and the output at /output.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

// Where this file lives, so dashboard/ and screenshots/ are found relative
// to the entrypoint no matter which directory the program is launched from.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Caps the judge applies to the dossier (see the kit's reference/gate.json).
// The text cap changes the dossier's bytes; the other two are pass/fail.
const DOSSIER_TEXT_CAP = 65_536;
const DOSSIER_SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const DOSSIER_DASHBOARD_LIMITS = { max_files: 400, max_bytes: 4_194_304 };

// A screenshot filename the gate accepts: letters, digits and . _ -, 1-128 chars.
const SHOT_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

// The three views the dossier expects in screenshots/: the board, one
// protocol's detail view, and one filtered view.
const SHOTS_REQUIRED = 3;

/** Print a message to stderr and stop with the given exit code. */
function die(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/**
 * One `--flag <value>` (or `--flag=<value>`) from the command line, or the
 * fallback when the flag is absent. The first spelling found wins.
 */
function cliValue(flag: string, fallback: string): string {
  const argv = process.argv;
  const bare = argv.indexOf(`--${flag}`);
  if (bare >= 0 && bare + 1 < argv.length) return argv[bare + 1]!;
  const glued = argv.find((entry) => entry.startsWith(`--${flag}=`));
  if (glued !== undefined) return glued.slice(flag.length + 3);
  return fallback;
}

/** The snapshot file: --input may name the file itself or its directory. */
function resolveSnapshotFile(): string {
  const given = cliValue('input', '/input');
  return given.endsWith('.json') ? given : join(given, 'snapshot.json');
}

/** The output directory: --output wins, then MAKEFUN_OUTPUT_DIR, then /output. */
function resolveOutputDir(): string {
  return cliValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
}

/**
 * Copy every regular file from one directory into another, skipping hidden
 * names, and return the copied filenames in directory order. A missing
 * source directory copies nothing instead of failing.
 */
function copyAssetDirectory(sourceDir: string, targetDir: string): string[] {
  if (!existsSync(sourceDir)) return [];
  mkdirSync(targetDir, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(sourceDir)) {
    if (name.startsWith('.')) continue;
    const source = join(sourceDir, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(targetDir, name));
    copied.push(name);
  }
  return copied;
}

/** Refuse a screenshot set whose filenames the gate would refuse. */
function checkShotNames(names: string[]): void {
  for (const name of names) {
    if (!SHOT_NAME_PATTERN.test(name)) {
      die(`screenshots/${name}: use letters, digits and . _ - only, 1 to 128 characters`, 1);
    }
  }
}

/** Score the snapshot and write every output file. */
function run(): void {
  const snapshotFile = resolveSnapshotFile();
  if (!existsSync(snapshotFile)) {
    die(
      `no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input`,
      2,
    );
  }
  const outputDir = resolveOutputDir();

  // Parse, then score. parseSnapshot refuses anything that is not the
  // snapshot's shape; buildRadar returns the board and the dashboard data
  // from the same scoring pass, so the two can never disagree.
  const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  // Refuse to write a board the gate would refuse: a missing watchlist slug,
  // a broken rank sequence, an unsorted board, or a bad farm plan.
  const problem = boardIssue(board, snapshot);
  if (problem !== null) {
    die(`the model wrote a board the gate refuses: ${problem}`, 1);
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

  copyAssetDirectory(join(repoRoot, 'dashboard'), join(outputDir, 'dashboard'));
  const shots = copyAssetDirectory(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
  if (shots.length < SHOTS_REQUIRED) {
    const word = shots.length === 1 ? 'image' : 'images';
    die(
      `screenshots/ holds ${shots.length} ${word}: hand in ${SHOTS_REQUIRED}, the board, a detail view and a filtered view`,
      1,
    );
  }
  checkShotNames(shots);

  // Dossier last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(outputDir, 'dossier.json'),
    buildDossier(outputDir, {
      text_max_bytes: DOSSIER_TEXT_CAP,
      screenshots: DOSSIER_SHOT_LIMITS,
      dashboard: DOSSIER_DASHBOARD_LIMITS,
    }),
  );

  const earlyCount = radar.early_size;
  const liveCount = radar.live_size;
  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols in, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${earlyCount} early, ${liveCount} live set aside)\n` +
      `token radar: wrote ${join(outputDir, 'board.json')}, ${join(outputDir, 'data.js')}, ` +
      `${join(outputDir, 'dashboard')} (3 files), ${join(outputDir, 'screenshots')} (${shots.length} images) and ${join(outputDir, 'dossier.json')}\n`,
  );
}

run();

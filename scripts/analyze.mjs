// scripts/analyze.mjs
// Quick analyzers for unused deps and likely-unused files. Heuristic only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';

function listAllFiles(dir) {
  const out = [];
  function walk(d) {
    for (const ent of readdirSync(d)) {
      const p = join(d, ent);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  walk(dir);
  return out;
}

function rgQuery(pattern) {
  try {
    const out = execSync(`rg -n --no-heading --hidden -S "${pattern}" src api vite.config.mjs package.json`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8'
    });
    return out.trim();
  } catch {
    return '';
  }
}

function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});

  const unusedDeps = [];
  for (const d of deps) {
    const pats = [
      `from '${d}'`,
      `from \"${d}\"`,
      `require('${d}')`,
      `require(\"${d}\")`
    ];
    const hit = pats.some((p) => rgQuery(p));
    if (!hit) unusedDeps.push(d);
  }

  // File heuristic: check styles and assets referenced
  const suspectDirs = ['src/styles', 'src/assets'];
  const suspectFiles = [];
  for (const d of suspectDirs) {
    try {
      for (const f of listAllFiles(d)) suspectFiles.push(f);
    } catch {}
  }
  // Add known oddballs
  ['src/index.css', 'src/contexts/NavStateContext.js', 'src/styles/kw-sidebar-override.cs'].forEach((f) => {
    try {
      statSync(f);
      suspectFiles.push(f);
    } catch {}
  });

  const unusedFiles = [];
  for (const f of suspectFiles) {
    const name = basename(f);
    const ref = rgQuery(name);
    // If only occurrence is the file itself, likely unused
    if (!ref || ref.split('\n').every((line) => line.startsWith(f))) {
      unusedFiles.push(f);
    }
  }

  console.log('--- Unused Dependencies (heuristic) ---');
  for (const d of unusedDeps) console.log(d);

  console.log('\n--- Likely Unused Files (heuristic) ---');
  for (const f of unusedFiles) console.log(f);
}

main();


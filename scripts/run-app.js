const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const electronDistDir = path.join(repoRoot, 'node_modules', 'electron', 'dist');
const platform = process.platform;
const isWin = platform === 'win32';

function getElectronBinary() {
  const candidates = [];

  if (isWin) {
    candidates.push(path.join(electronDistDir, 'electron.exe'));
  } else {
    candidates.push(path.join(electronDistDir, 'Electron.app', 'Contents', 'MacOS', 'Electron'));
    candidates.push(path.join(electronDistDir, 'electron'));
  }

  if (fs.existsSync(path.join(electronDistDir, 'path.txt'))) {
    const relativePath = fs.readFileSync(path.join(electronDistDir, 'path.txt'), 'utf8').trim();
    if (relativePath) {
      candidates.unshift(path.join(electronDistDir, relativePath));
    }
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getBin(name) {
  if (isWin) return `${name}.cmd`;
  return name;
}

function spawnCommand(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: 'inherit',
    shell: isWin,
    cwd: repoRoot,
    ...options,
  });

  proc.on('exit', code => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  });

  return proc;
}

function startVite() {
  const viteCommand = path.join(repoRoot, 'node_modules', '.bin', getBin('vite'));
  return spawnCommand(viteCommand, ['--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
    env: { ...process.env, BROWSER: 'none' },
  });
}

function startDesktopDev() {
  const electronBinary = getElectronBinary();

  if (!electronBinary) {
    console.error('Electron desktop binary is missing. Run "npm rebuild electron" with internet access, then run "npm run dev" again.');
    process.exitCode = 1;
    return;
  }

  const viteProcess = startVite();
  const waitOn = path.join(repoRoot, 'node_modules', '.bin', getBin('wait-on'));
  const devServerUrl = 'http://127.0.0.1:5174';
  const waitProcess = spawnCommand(waitOn, [devServerUrl], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '0' },
  });

  waitProcess.on('exit', code => {
    if (code !== 0) {
      process.exit(code ?? 1);
    }

    const electronProcess = spawnCommand(electronBinary, ['.'], {
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devServerUrl,
      },
    });

    electronProcess.on('exit', code => {
      if (code !== 0) {
        process.exit(code ?? 1);
      }
    });
  });

  return { viteProcess, waitProcess };
}

const mode = process.argv.includes('--browser') ? 'browser' : 'desktop';

if (mode === 'desktop') {
  startDesktopDev();
} else {
  startVite();
}

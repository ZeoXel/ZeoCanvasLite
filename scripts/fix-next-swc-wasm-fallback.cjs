const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const wasmPkgDir = path.join(root, 'node_modules', '@next', 'swc-wasm-nodejs');
const nextWasmDir = path.join(root, 'node_modules', 'next', 'wasm', '@next', 'swc-wasm-nodejs');
const files = ['wasm.js', 'wasm_bg.wasm', 'package.json'];

if (!fs.existsSync(wasmPkgDir)) {
  console.warn('[postinstall] @next/swc-wasm-nodejs not found, skip SWC wasm fallback patch.');
  process.exit(0);
}

fs.mkdirSync(nextWasmDir, { recursive: true });

let copied = 0;
for (const file of files) {
  const source = path.join(wasmPkgDir, file);
  const target = path.join(nextWasmDir, file);
  if (!fs.existsSync(source)) continue;
  fs.copyFileSync(source, target);
  copied += 1;
}

if (copied > 0) {
  console.log(`[postinstall] patched Next wasm fallback (${copied} files).`);
}

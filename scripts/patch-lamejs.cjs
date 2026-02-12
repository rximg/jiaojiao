/**
 * postinstall 脚本：为 lamejs 打补丁，修复在 Node/ESM 下未正确 require 导致的 ReferenceError。
 * - Lame.js / Encoder.js / PsyModel.js：注入 var MPEGMode = require('./MPEGMode.js');
 * - BitStream.js：注入 var Lame = require('./Lame.js');（内部使用 Lame.LAME_MAXMP3BUFFER）
 */
const fs = require('fs');
const path = require('path');

const LAMEJS_DIR = path.join(__dirname, '..', 'node_modules', 'lamejs', 'src', 'js');
const PATCHES = [
  { file: 'Lame.js', inject: "var MPEGMode = require('./MPEGMode.js');\n", check: "require('./MPEGMode.js')" },
  { file: 'Encoder.js', inject: "var MPEGMode = require('./MPEGMode.js');\n", check: "require('./MPEGMode.js')" },
  { file: 'PsyModel.js', inject: "var MPEGMode = require('./MPEGMode.js');\n", check: "require('./MPEGMode.js')" },
  { file: 'BitStream.js', inject: "var Lame = require('./Lame.js');\n", check: "require('./Lame.js')" },
];

if (!fs.existsSync(LAMEJS_DIR)) {
  console.log('patch-lamejs: node_modules/lamejs not found, skip.');
  process.exit(0);
}

for (const { file, inject, check } of PATCHES) {
  const filePath = path.join(LAMEJS_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(check)) {
    console.log('patch-lamejs: ' + file + ' already patched.');
    continue;
  }
  content = inject + content;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('patch-lamejs: patched ' + file);
}

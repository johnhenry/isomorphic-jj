#!/usr/bin/env node
/**
 * Regenerates the precompiled protobuf reflection JSON modules in
 * src/protos/*.json.js from the .proto sources in the same directory.
 *
 * These JSON modules are what the library actually loads at runtime (see
 * src/protos/schema.js) — the .proto files exist for documentation and for
 * this script to (re)compile from, not for runtime `protobuf.load()`
 * (which requires filesystem/network access unavailable in a browser
 * bundle; see issue #28). Run this after editing any .proto file:
 *
 *   node scripts/build-protos.mjs
 */

import protobuf from 'protobufjs';
import prettier from 'prettier';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const protosDir = path.join(__dirname, '..', 'src', 'protos');

const SCHEMAS = [
  { proto: 'local_working_copy.proto', json: 'local_working_copy.json.js' },
  { proto: 'simple_op_store.proto', json: 'simple_op_store.json.js' },
];

function header(protoFile) {
  return `/**
 * Precompiled protobuf reflection JSON for ${protoFile}
 *
 * Generated from src/protos/${protoFile} by scripts/build-protos.mjs. This
 * is bundled directly (instead of loaded from a filesystem path at runtime)
 * so that protobuf schema loading works identically in Node and in browser
 * bundles — protobuf.load() requires filesystem/network access that does
 * not exist in a browser bundle (see issue #28). Regenerate with:
 *   node scripts/build-protos.mjs
 */

export default `;
}

async function main() {
  for (const { proto, json } of SCHEMAS) {
    const protoPath = path.join(protosDir, proto);
    const root = await protobuf.load(protoPath);
    const reflectionJson = root.toJSON();
    const outPath = path.join(protosDir, json);
    const raw = header(proto) + JSON.stringify(reflectionJson, null, 2) + ';\n';
    // Match the repo's Prettier style (this file is committed, not
    // gitignored like dist/) so `npm run build` never leaves the working
    // tree dirty under `npm run format:check`.
    const prettierConfig = await prettier.resolveConfig(outPath);
    const contents = await prettier.format(raw, { ...prettierConfig, filepath: outPath });
    await writeFile(outPath, contents, 'utf8');
    console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

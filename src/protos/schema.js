/**
 * Protobuf schema loader
 *
 * Builds protobuf.js `Root` instances from precompiled reflection JSON
 * (see local_working_copy.json.js / simple_op_store.json.js, generated from
 * the .proto files in this directory) instead of calling `protobuf.load()`
 * against a filesystem path.
 *
 * Why: `protobuf.load()` resolves its argument as a file path (Node `fs`) or
 * URL (XHR/fetch), which requires either a real filesystem or a network
 * request. In a bundled browser build there is no filesystem path to read
 * (see issue #28), and shipping the raw .proto text and fetching it at
 * runtime would require bundler-specific asset handling. Reflection JSON is
 * plain data, so it can be imported like any other JS module and works
 * identically under Node, Jest, and any browser bundler (Vite, esbuild,
 * webpack, Rollup, ...).
 *
 * Regenerate the JSON files after editing a .proto with:
 *   npm run build:protos
 */

import protobuf from 'protobufjs/light.js';
import localWorkingCopyJson from './local_working_copy.json.js';
import simpleOpStoreJson from './simple_op_store.json.js';

/** @type {protobuf.Root|undefined} */
let localWorkingCopyRoot;
/** @type {protobuf.Root|undefined} */
let simpleOpStoreRoot;

/**
 * @returns {protobuf.Root} Root for local_working_copy.proto (Checkout, TreeState, ...)
 */
export function getLocalWorkingCopyRoot() {
  if (!localWorkingCopyRoot) {
    localWorkingCopyRoot = protobuf.Root.fromJSON(localWorkingCopyJson);
  }
  return localWorkingCopyRoot;
}

/**
 * @returns {protobuf.Root} Root for simple_op_store.proto (Operation, View, ...)
 */
export function getSimpleOpStoreRoot() {
  if (!simpleOpStoreRoot) {
    simpleOpStoreRoot = protobuf.Root.fromJSON(simpleOpStoreJson);
  }
  return simpleOpStoreRoot;
}

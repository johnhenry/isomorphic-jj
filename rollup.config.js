import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.mjs',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
  ],
  // No Node builtins (path/crypto/url) are imported anywhere in src/ anymore
  // — see issue #28: this library is isomorphic, so it uses Web Crypto
  // (globalThis.crypto) and a small internal POSIX path helper instead of
  // Node's `crypto`/`path` modules, and precompiled protobuf reflection
  // JSON instead of `url`+`path` for locating .proto files.
  external: ['isomorphic-git', 'protobufjs', 'protobufjs/light.js'],
  plugins: [nodeResolve()],
};

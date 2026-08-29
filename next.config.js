/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The project directory lives on an exFAT volume, which does not support
  // real symlinks. Webpack's resolver otherwise calls readlink() on every
  // resolved file to check for one, and exFAT answers that call with EISDIR
  // instead of the expected "not a symlink" error, crashing the build with
  // "EISDIR: illegal operation on a directory, readlink '...next/dist/pages/_app.js'".
  // Disabling symlink resolution skips that call entirely.
  webpack: (config) => {
    config.resolve.symlinks = false;
    config.snapshot = {
      ...config.snapshot,
      managedPaths: [],
      immutablePaths: [],
    };
    return config;
  },
};

module.exports = nextConfig;

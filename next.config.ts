import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` must stay a real Node require at runtime (it uses net/tls + native-ish codecs),
  // so keep it out of the bundler and load it from node_modules.
  serverExternalPackages: ["pg"],
};

export default nextConfig;

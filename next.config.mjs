/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // 启用 instrumentation.ts 钩子(Next 14 需要显式开启;Next 15+ 默认开)
    instrumentationHook: true,
    // 服务端组件 / route handler 用到的 Node-only 包,让 Next 直接走运行时 require
    serverComponentsExternalPackages: ["node-cron", "cron-parser"],
  },
  // instrumentation.ts 走的是单独的 webpack 上下文,
  // serverComponentsExternalPackages 不覆盖它 —— 这里手动 externals 第三方包,
  // 并把 Node 内建(fs/path/crypto…)也声明成 external,运行时直接 require。
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean);
      externals.push(({ request }, callback) => {
        if (!request) return callback();
        // 第三方纯 Node 包
        if (request === "node-cron" || request === "cron-parser" || request.startsWith("cron-parser/")) {
          return callback(null, `commonjs ${request}`);
        }
        // Node 内建:fs / path / crypto / os / ... 和 node: 前缀写法
        if (request.startsWith("node:")) {
          return callback(null, `commonjs ${request}`);
        }
        return callback();
      });
      config.externals = externals;
    }
    return config;
  },
};
export default nextConfig;

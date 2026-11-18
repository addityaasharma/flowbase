const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];
/** @type {import('next').NextConfig} */
export default { transpilePackages: ["@bitcode/shared"], poweredByHeader: false, headers: async () => [{ source: "/:path*", headers: security }] };

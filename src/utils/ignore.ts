export default function ignore({ path }: { path: string }) {
  const ignoredFiles = [
    "node_modules/",
    "dist/",
    "build/",
    ".git/",
    ".next/",
    ".cache/",
    "coverage/",
  ];

  const ignoredExtensions = [
    ".min.js",
    ".lock",
    ".log",
    ".png",
    ".jpg",
    ".svg",
    ".ico",
    ".woff",
    ".ttf",
    ".mp4",
    ".zip",
    ".pdf",
  ];

  return (
    ignoredFiles.some((dir) => path.includes(dir)) ||
    ignoredExtensions.some((ext) => path.endsWith(ext)) ||
    path.includes(".env")
  );
}

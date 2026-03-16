import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.resolve(process.argv[2] || path.join(repoRoot, ".pages-dist"));

const STATIC_FILES = [
  "index.html",
  "mock-projects.js",
  "CNAME",
  "favicon.ico"
];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

for (const relativePath of STATIC_FILES) {
  const sourcePath = path.join(repoRoot, relativePath);
  try {
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) {
      continue;
    }
    await fs.copyFile(sourcePath, path.join(outputDir, relativePath));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

console.log(`Prepared Pages artifact in ${outputDir}`);

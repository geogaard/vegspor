import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const cleanedPath = path.join(repoRoot, "data", "projects_cleaned.geojson");
const authoritativePath = path.join(repoRoot, "data", "projects.geojson");

function runNodeScript(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: "inherit"
    });

    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: node ${args.join(" ")}`));
    });
    child.on("error", reject);
  });
}

const cleanedSource = await fs.readFile(cleanedPath, "utf8");
JSON.parse(cleanedSource);

await fs.writeFile(authoritativePath, cleanedSource, "utf8");
await runNodeScript(["scripts/project-data.mjs", "build-mock"]);
await runNodeScript(["scripts/validate-site.mjs"]);

console.log("Synced data/projects_cleaned.geojson -> data/projects.geojson and rebuilt derived files.");

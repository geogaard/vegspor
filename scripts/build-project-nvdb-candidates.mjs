import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultMapPath = path.join(repoRoot, "data", "project-centerline-source-map.json");
const defaultCenterlinePath = path.join(repoRoot, "data", "nvdb-centerlines.json");
const defaultOutputPath = path.join(repoRoot, "data", "project-geometries-nvdb-candidates.json");

function parseArgs(argv) {
  const args = {
    map: defaultMapPath,
    centerlines: defaultCenterlinePath,
    output: defaultOutputPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--map" && next) {
      args.map = path.resolve(next);
      index += 1;
    } else if (token === "--centerlines" && next) {
      args.centerlines = path.resolve(next);
      index += 1;
    } else if (token === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (token === "--help") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/build-project-nvdb-candidates.mjs [options]",
    "",
    "Options:",
    "  --map <path>           Project/source mapping JSON",
    "  --centerlines <path>   NVDB centerline JSON",
    "  --output <path>        Output JSON for candidate project geometries",
    "  --help                 Show this message"
  ].join("\n");
}

function pointsEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function mergeGeometries(geometries) {
  const merged = [];

  for (const geometry of geometries) {
    for (const point of geometry) {
      if (!merged.length || !pointsEqual(merged[merged.length - 1], point)) {
        merged.push(point);
      }
    }
  }

  return merged;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const mapping = JSON.parse(await fs.readFile(args.map, "utf8"));
const centerlines = JSON.parse(await fs.readFile(args.centerlines, "utf8"));

const output = {};
for (const [projectId, config] of Object.entries(mapping.projects || {})) {
  const sourceIds = config.source_ids || [];
  const parts = sourceIds
    .map(sourceId => {
      const centerline = centerlines[sourceId];
      if (!centerline) {
        throw new Error(`Missing NVDB centerline for source id ${sourceId}`);
      }
      return centerline;
    });

  output[projectId] = {
    geometry_utm32: mergeGeometries(parts.map(part => part.geometry_utm32)),
    source_ids: sourceIds,
    nvdb_complete: parts.length > 0 && parts.every(part => part.nvdb_complete),
    nvdb_statuses: parts.map(part => ({
      source_id: part.source_feature_id != null ? String(part.source_feature_id) : null,
      nvdb_status: part.nvdb_status,
      nvdb_status_code: part.nvdb_status_code
    })),
    note: config.note || ""
  };
}

await fs.writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");

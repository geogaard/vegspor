import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const defaultProjectGeometryPath = path.join(repoRoot, "data", "project-geometries.json");
const defaultCenterlinePath = path.join(repoRoot, "data", "nvdb-centerlines.json");
const defaultOutputPath = path.join(repoRoot, "data", "project-centerline-matches.json");

function parseArgs(argv) {
  const args = {
    projects: defaultProjectGeometryPath,
    centerlines: defaultCenterlinePath,
    output: defaultOutputPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--projects" && next) {
      args.projects = path.resolve(next);
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
    "Usage: node scripts/match-centerlines-to-projects.mjs [options]",
    "",
    "Options:",
    "  --projects <path>      Reference project geometries (default: data/project-geometries.json)",
    "  --centerlines <path>   NVDB centerline JSON (default: data/nvdb-centerlines.json)",
    "  --output <path>        Match report output (default: data/project-centerline-matches.json)",
    "  --help                 Show this message"
  ].join("\n");
}

function polylineLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  }
  return total;
}

function distanceToSegment(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const projectedX = start[0] + t * dx;
  const projectedY = start[1] + t * dy;
  return Math.hypot(point[0] - projectedX, point[1] - projectedY);
}

function samplePolyline(points, count = 30) {
  if (points.length <= count) {
    return points;
  }

  return Array.from({ length: count }, (_, index) => {
    const sampleIndex = Math.round(((points.length - 1) * index) / (count - 1));
    return points[sampleIndex];
  });
}

function averageNearestDistance(source, target) {
  const samples = samplePolyline(source);
  let total = 0;

  for (const point of samples) {
    let best = Infinity;
    for (let index = 1; index < target.length; index += 1) {
      best = Math.min(best, distanceToSegment(point, target[index - 1], target[index]));
    }
    total += best;
  }

  return total / samples.length;
}

function scoreMatch(projectGeometry, centerlineGeometry, centerline) {
  const projectLength = polylineLength(projectGeometry);
  const centerlineLength = centerline.nvdb_length_m ?? polylineLength(centerlineGeometry);
  const symmetricDistance =
    (averageNearestDistance(projectGeometry, centerlineGeometry) +
      averageNearestDistance(centerlineGeometry, projectGeometry)) /
    2;
  const lengthRatio = Math.max(projectLength, centerlineLength) / Math.max(1, Math.min(projectLength, centerlineLength));
  const completenessPenalty = centerline.nvdb_complete ? 0 : 5000;

  return {
    symmetric_distance_m: Math.round(symmetricDistance),
    length_ratio: Number(lengthRatio.toFixed(2)),
    project_length_km: Number((projectLength / 1000).toFixed(1)),
    centerline_length_km: Number((centerlineLength / 1000).toFixed(1)),
    score: Math.round(symmetricDistance + Math.max(0, lengthRatio - 1) * 500 + completenessPenalty)
  };
}

function confidenceLevel(best, secondBest) {
  if (!best) {
    return "none";
  }

  if (!best.nvdb_complete) {
    return "low";
  }

  if (!secondBest) {
    return "high";
  }

  if (best.score <= 1500 && secondBest.score >= best.score * 1.8) {
    return "high";
  }

  if (best.score <= 5000 && secondBest.score >= best.score * 1.25) {
    return "medium";
  }

  return "low";
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const projectGeometries = JSON.parse(await fs.readFile(args.projects, "utf8"));
const centerlines = JSON.parse(await fs.readFile(args.centerlines, "utf8"));

const report = {};
for (const [projectId, projectGeometry] of Object.entries(projectGeometries)) {
  const candidates = Object.entries(centerlines)
    .map(([sourceId, centerline]) => {
      const metrics = scoreMatch(projectGeometry, centerline.geometry_utm32, centerline);
      return {
        source_id: sourceId,
        score: metrics.score,
        symmetric_distance_m: metrics.symmetric_distance_m,
        length_ratio: metrics.length_ratio,
        project_length_km: metrics.project_length_km,
        centerline_length_km: metrics.centerline_length_km,
        nvdb_complete: Boolean(centerline.nvdb_complete),
        nvdb_status: centerline.nvdb_status,
        nvdb_status_code: centerline.nvdb_status_code
      };
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);

  report[projectId] = {
    best_match: candidates[0] ?? null,
    confidence: confidenceLevel(candidates[0], candidates[1]),
    candidates
  };
}

await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

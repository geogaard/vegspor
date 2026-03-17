import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(repoRoot, "data", "project-vegsystemreferanser.json");
const defaultOutputPath = path.join(repoRoot, "data", "project-geometries-nvdb-direct.json");

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    output: defaultOutputPath
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--config" && next) {
      args.config = path.resolve(next);
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
    "Usage: node scripts/fetch-nvdb-by-vegsystemreferanse.mjs [options]",
    "",
    "Options:",
    "  --config <path>        Project vegsystemreferanse config",
    "  --output <path>        Output JSON path",
    "  --help                 Show this message"
  ].join("\n");
}

function sleep(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

async function fetchJson(url, attempt = 1) {
  try {
    return await new Promise((resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
            "X-Client": "vegspor-vegsystemreferanse-import"
          }
        },
        response => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", chunk => {
            body += chunk;
          });
          response.on("end", () => {
            if (response.statusCode && response.statusCode >= 400) {
              reject(new Error(`Request failed ${response.statusCode}: ${body}`));
              return;
            }
            resolve(JSON.parse(body));
          });
        }
      );

      request.setTimeout(60000, () => {
        request.destroy(new Error(`Request timed out for ${url}`));
      });
      request.on("error", reject);
    });
  } catch (error) {
    if (attempt >= 4) {
      throw error;
    }

    if (!["ECONNRESET", "ETIMEDOUT"].includes(error.code) && !String(error.message).includes("timed out")) {
      throw error;
    }

    await sleep(500 * attempt);
    return fetchJson(url, attempt + 1);
  }
}

async function loadProj4() {
  const source = await new Promise((resolve, reject) => {
    https
      .get("https://cdn.jsdelivr.net/npm/proj4@2.19.10/dist/proj4.js", response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });

  const context = { module: { exports: {} }, exports: {}, window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.module.exports || context.exports || context.window.proj4 || context.proj4;
}

function parseLinestringWkt(wkt) {
  const match = /^LINESTRING(?: Z)?\s*\((.*)\)$/i.exec(wkt.trim());
  if (!match) {
    throw new Error(`Unsupported WKT geometry: ${wkt.slice(0, 64)}`);
  }

  return match[1].split(",").map(part => {
    const values = part.trim().split(/\s+/).map(Number);
    return [values[0], values[1]];
  });
}

function pointsEqual(a, b, tolerance = 0.5) {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
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

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= tolerance) {
    return [points[0], points[points.length - 1]];
  }

  const left = douglasPeucker(points.slice(0, splitIndex + 1), tolerance);
  const right = douglasPeucker(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyPoints(points, tolerance = 10) {
  if (points.length <= 2) {
    return points;
  }

  const deduped = points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]));
  return douglasPeucker(deduped, tolerance);
}

async function fetchAllSegments(vegsystemreferanse) {
  let nextUrl =
    "https://nvdbapiles.atlas.vegvesen.no/vegnett/api/v4/veglenkesekvenser/segmentert?" +
    new URLSearchParams({ vegsystemreferanse, antall: "1000" }).toString();
  const segments = [];

  while (nextUrl) {
    const data = await fetchJson(nextUrl);
    segments.push(...(data.objekter || []));
    nextUrl = data.metadata?.neste?.href || null;
  }

  return segments;
}

function includeSegment(segment, spec, projectConfig) {
  if (segment.type !== "HOVED") {
    return false;
  }

  const strekning = segment.vegsystemreferanse?.strekning;
  if (!strekning || strekning.arm) {
    return false;
  }

  if (segment.vegsystemreferanse?.sideanlegg) {
    return false;
  }

  const requiredRetning = spec.retning || projectConfig.retning || "MED";
  if (strekning.retning && strekning.retning !== requiredRetning) {
    return false;
  }

  if (strekning.adskilte_løp === "Mot") {
    return false;
  }

  if (spec.from_meter != null && (strekning.til_meter ?? -Infinity) < spec.from_meter) {
    return false;
  }

  if (spec.to_meter != null && (strekning.fra_meter ?? Infinity) > spec.to_meter) {
    return false;
  }

  return true;
}

function compareSegments(left, right) {
  const a = left.vegsystemreferanse?.strekning || {};
  const b = right.vegsystemreferanse?.strekning || {};

  return (
    (a.strekning ?? 0) - (b.strekning ?? 0) ||
    (a.delstrekning ?? 0) - (b.delstrekning ?? 0) ||
    (a.fra_meter ?? 0) - (b.fra_meter ?? 0) ||
    (a.til_meter ?? 0) - (b.til_meter ?? 0)
  );
}

function segmentsToGeometry(segments, proj4) {
  const points = [];

  for (const segment of segments) {
    const wkt = segment.geometri?.wkt;
    if (!wkt) {
      continue;
    }

    for (const point of parseLinestringWkt(wkt)) {
      const converted = proj4("EPSG:25833", "EPSG:25832", point).map(value => Math.round(value));
      if (!points.length || !pointsEqual(points[points.length - 1], converted)) {
        points.push(converted);
      }
    }
  }

  return simplifyPoints(points, 10);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const config = JSON.parse(await fs.readFile(args.config, "utf8"));
const proj4 = await loadProj4();
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs");

const output = {};
  for (const [projectId, projectConfig] of Object.entries(config)) {
    const includedSegments = [];

  for (const spec of projectConfig.segments || []) {
    console.error(`${projectId}: fetching ${spec.vegsystemreferanse}`);
    const segments = await fetchAllSegments(spec.vegsystemreferanse);
    includedSegments.push(...segments.filter(segment => includeSegment(segment, spec, projectConfig)));
  }

    includedSegments.sort(compareSegments);

    output[projectId] = {
    description: projectConfig.description || "",
    geometry_utm32: segmentsToGeometry(includedSegments, proj4),
    segment_count: includedSegments.length,
    segment_refs: projectConfig.segments
  };
  console.error(`${projectId}: ${output[projectId].geometry_utm32.length} points from ${includedSegments.length} segments`);
}

await fs.writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");

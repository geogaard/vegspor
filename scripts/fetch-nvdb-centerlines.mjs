import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultInputPath = path.join(repoRoot, "data", "project-representations.geojson");
const defaultOutputPath = path.join(repoRoot, "data", "nvdb-centerlines.json");

function parseArgs(argv) {
  const args = {
    input: defaultInputPath,
    output: defaultOutputPath,
    maxDistance: 2000,
    perimeter: 1500,
    simplifyTolerance: 10
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === "--input" && next) {
      args.input = path.resolve(next);
      index += 1;
    } else if (token === "--output" && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (token === "--max-distance" && next) {
      args.maxDistance = Number(next);
      index += 1;
    } else if (token === "--perimeter" && next) {
      args.perimeter = Number(next);
      index += 1;
    } else if (token === "--simplify" && next) {
      args.simplifyTolerance = Number(next);
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
    "Usage: node scripts/fetch-nvdb-centerlines.mjs [options]",
    "",
    "Options:",
    "  --input <path>          Input GeoJSON with project helper lines",
    "  --output <path>         Output JSON keyed by feature id / OBJECTID",
    "  --max-distance <m>      Highest NVDB maks_avstand retry in meters (default: 2000)",
    "  --perimeter <m>         NVDB omkrets in meters (default: 1500)",
    "  --simplify <m>          Douglas-Peucker tolerance in meters (default: 10)",
    "  --help                  Show this message"
  ].join("\n");
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, response => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Request failed ${response.statusCode} for ${url}`));
        response.resume();
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
      });
      response.on("end", () => {
        resolve(body);
      });
    });

    request.setTimeout(30000, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on("error", reject);
  });
}

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "Mozilla/5.0",
          "X-Client": "vegspor-centerline-import"
        }
      },
      response => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", chunk => {
          responseBody += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`Request failed ${response.statusCode}: ${responseBody}`));
            return;
          }
          resolve(JSON.parse(responseBody));
        });
      }
    );

    request.setTimeout(60000, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

async function loadProj4() {
  const source = await fetchText("https://cdn.jsdelivr.net/npm/proj4@2.19.10/dist/proj4.js");
  const context = { module: { exports: {} }, exports: {}, window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.module.exports || context.exports || context.window.proj4 || context.proj4;
}

function featureKey(feature, index) {
  return String(feature.id ?? feature.properties?.OBJECTID ?? index + 1);
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

function simplifyPoints(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) {
    return points;
  }

  const deduped = points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]));
  return douglasPeucker(deduped, tolerance);
}

function parseLinestringWkt(wkt) {
  const match = /^LINESTRING(?: Z)?\s*\((.*)\)$/i.exec(wkt.trim());
  if (!match) {
    throw new Error(`Unsupported WKT geometry: ${wkt.slice(0, 48)}`);
  }

  return match[1].split(",").map(token => {
    const values = token.trim().split(/\s+/).map(Number);
    return [values[0], values[1]];
  });
}

function featureToRouteWkt(feature, proj4) {
  if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates) || !feature.geometry.coordinates.length) {
    throw new Error("Expected LineString geometry");
  }

  const utm33 = feature.geometry.coordinates.map(([lon, lat]) => proj4("EPSG:4326", "EPSG:25833", [lon, lat]));
  return `LINESTRING Z(${utm33.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)} 0`).join(", ")})`;
}

function chooseSegmentOrder(previousPoint, nextSegment) {
  if (!previousPoint || nextSegment.length < 2) {
    return nextSegment;
  }

  const forwardDistance = Math.hypot(previousPoint[0] - nextSegment[0][0], previousPoint[1] - nextSegment[0][1]);
  const reverseDistance = Math.hypot(
    previousPoint[0] - nextSegment[nextSegment.length - 1][0],
    previousPoint[1] - nextSegment[nextSegment.length - 1][1]
  );

  return reverseDistance < forwardDistance ? [...nextSegment].reverse() : nextSegment;
}

function flattenRouteSegments(route, proj4, simplifyTolerance) {
  const segments = route.vegnettsrutesegmenter || [];
  const merged = [];

  for (const segment of segments) {
    const wkt = segment.geometri?.wkt;
    if (!wkt) {
      continue;
    }

    const pointsUtm33 = chooseSegmentOrder(merged[merged.length - 1], parseLinestringWkt(wkt));
    for (const point of pointsUtm33) {
      const converted = proj4("EPSG:25833", "EPSG:25832", point);
      const rounded = converted.map(value => Math.round(value));
      if (!merged.length || !pointsEqual(merged[merged.length - 1], rounded)) {
        merged.push(rounded);
      }
    }
  }

  return simplifyPoints(merged, simplifyTolerance);
}

async function routeFeature(feature, options, proj4) {
  const maxDistanceAttempts = [...new Set([75, 150, 300, 600, 800, 1200, options.maxDistance])]
    .filter(value => value <= options.maxDistance)
    .sort((a, b) => a - b);
  const routeWkt = featureToRouteWkt(feature, proj4);
  let bestRoute = null;
  let bestDistance = null;

  for (const maxDistance of maxDistanceAttempts) {
    const route = await postJson("https://nvdbapiles.atlas.vegvesen.no/vegnett/api/v4/beta/vegnett/rute", {
      geometri: routeWkt,
      maks_avstand: maxDistance,
      omkrets: options.perimeter,
      detaljerte_lenker: true,
      konnekteringslenker: true,
      kortform: false
    });

    const segmentCount = route.vegnettsrutesegmenter?.length ?? 0;
    const complete = route.metadata?.status === 2000;
    if (complete && segmentCount) {
      bestRoute = route;
      bestDistance = maxDistance;
      break;
    }

    if (!bestRoute || segmentCount > (bestRoute.vegnettsrutesegmenter?.length ?? 0)) {
      bestRoute = route;
      bestDistance = maxDistance;
    }
  }

  const geometry = flattenRouteSegments(bestRoute, proj4, options.simplifyTolerance);
  if (!geometry.length) {
    throw new Error(
      `NVDB returned no usable route geometry (${bestRoute?.metadata?.status_tekst ?? "unknown status"})`
    );
  }

  return {
    geometry_utm32: geometry,
    source_feature_id: feature.id ?? feature.properties?.OBJECTID ?? null,
    source_shape_length: feature.properties?.Shape_Length ?? null,
    nvdb_segment_count: bestRoute.vegnettsrutesegmenter?.length ?? 0,
    nvdb_length_m: bestRoute.metadata?.lengde ?? null,
    nvdb_status: bestRoute.metadata?.status_tekst ?? null,
    nvdb_status_code: bestRoute.metadata?.status ?? null,
    nvdb_complete: bestRoute.metadata?.status === 2000,
    nvdb_max_distance_used: bestDistance
  };
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const inputText = await fs.readFile(args.input, "utf8");
const sourceGeoJson = JSON.parse(inputText);
const features = sourceGeoJson.features || [];

if (!features.length) {
  throw new Error(`No features found in ${args.input}`);
}

const proj4 = await loadProj4();
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs");

const output = {};
for (const [index, feature] of features.entries()) {
  const key = featureKey(feature, index);
  console.error(`${key}: routing via NVDB`);
  output[key] = await routeFeature(feature, args, proj4);
  console.error(`${key}: ${output[key].geometry_utm32.length} points`);
}

await fs.mkdir(path.dirname(args.output), { recursive: true });
await fs.writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");

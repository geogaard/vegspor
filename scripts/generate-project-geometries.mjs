import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mockProjectsPath = path.join(repoRoot, "mock-projects.js");

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

function fetchJson(url) {
  return fetchText(url).then(JSON.parse);
}

async function loadProj4() {
  const source = await fetchText("https://cdn.jsdelivr.net/npm/proj4@2.19.10/dist/proj4.js");
  const context = { module: { exports: {} }, exports: {}, window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.module.exports || context.exports || context.window.proj4 || context.proj4;
}

async function loadProjects() {
  const source = await fs.readFile(mockProjectsPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.mockProjects || [];
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
  if (points.length <= 2) {
    return points;
  }

  const deduped = points.filter((point, index) => index === 0 || !pointsEqual(point, points[index - 1]));
  return douglasPeucker(deduped, tolerance);
}

function osrmRouteUrl(project, proj4) {
  const routePoints = project.route_waypoints_utm32?.length
    ? project.route_waypoints_utm32
    : [project.geometry_utm32[0], project.geometry_utm32[project.geometry_utm32.length - 1]];
  const coordinates = routePoints
    .map(point => proj4("EPSG:25832", "EPSG:4326", point))
    .map(([lon, lat]) => `${lon},${lat}`)
    .join(";");

  return `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&continue_straight=true`;
}

async function buildProjectGeometry(project, proj4) {
  console.error(`${project.id}: routing`);
  const route = await fetchJson(osrmRouteUrl(project, proj4));

  if (route.code !== "Ok" || !route.routes?.[0]?.geometry?.coordinates?.length) {
    throw new Error(`OSRM route failed for ${project.id}`);
  }

  const points = route.routes[0].geometry.coordinates.map(point => proj4("EPSG:4326", "EPSG:25832", point));
  const tolerance = points.length > 1800 ? 42 : points.length > 900 ? 26 : 16;
  return simplifyPoints(points, tolerance).map(point => point.map(value => Math.round(value)));
}

const proj4 = await loadProj4();
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");

const requestedIds = new Set(process.argv.slice(2));
const projects = await loadProjects();
const projectsToProcess = requestedIds.size
  ? projects.filter(project => requestedIds.has(project.id))
  : projects;

const output = {};
for (const project of projectsToProcess) {
  const geometry = await buildProjectGeometry(project, proj4);
  output[project.id] = geometry;
  console.error(`${project.id}: ${geometry.length} points`);
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

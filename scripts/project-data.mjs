import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mockProjectsPath = path.join(repoRoot, "mock-projects.js");
const dataDir = path.join(repoRoot, "data");
const csvPath = path.join(dataDir, "projects.csv");
const geometryPath = path.join(dataDir, "project-geometries.json");
const geoJsonPath = path.join(dataDir, "projects.geojson");

const CSV_FIELDS = [
  "id",
  "prosjektnavn",
  "vegnummer",
  "delstrekning",
  "sted",
  "kommune",
  "fylke",
  "år_fra",
  "år_til",
  "rolle",
  "prosjektstatus",
  "prosjekttype",
  "beskrivelse_kort",
  "kilde",
  "prioritet",
  "source_label",
  "source_url",
  "vegkart_url",
  "kostnad_label",
  "length_km",
  "length_unit_label",
  "datakvalitet",
  "geometry_status",
  "geometry_kilde"
];

const INTEGER_FIELDS = new Set(["år_fra", "år_til", "prioritet"]);
const NUMBER_FIELDS = new Set(["length_km"]);

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function toCsv(rows) {
  const header = CSV_FIELDS.join(",");
  const body = rows.map(row => CSV_FIELDS.map(field => csvEscape(row[field])).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        current += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (char === "\n") {
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    if (char !== "\r") {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  const [header, ...body] = rows.filter(entry => entry.length && entry.some(value => value.length));
  return body.map(values => Object.fromEntries(header.map((field, index) => [field, values[index] ?? ""])));
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

async function loadProj4() {
  const source = await fetchText("https://cdn.jsdelivr.net/npm/proj4@2.19.10/dist/proj4.js");
  const context = { module: { exports: {} }, exports: {}, window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  const proj4 = context.module.exports || context.exports || context.window.proj4 || context.proj4;
  proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");
  return proj4;
}

async function loadMockProjects() {
  const source = await fs.readFile(mockProjectsPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.mockProjects || [];
}

function normalizeValue(field, value) {
  if (value == null || value === "") {
    return "";
  }

  if (INTEGER_FIELDS.has(field)) {
    return Number(value);
  }

  if (NUMBER_FIELDS.has(field)) {
    return Number(value);
  }

  return value;
}

function normalizeProperties(properties) {
  const project = {};
  for (const field of CSV_FIELDS) {
    project[field] = normalizeValue(field, properties?.[field] ?? "");
  }
  return project;
}

function projectProperties(project) {
  return Object.fromEntries(CSV_FIELDS.map(field => [field, project[field] ?? ""]));
}

function projectToFeature(project, proj4) {
  return {
    type: "Feature",
    id: project.id,
    properties: projectProperties(project),
    geometry: {
      type: "LineString",
      coordinates: project.geometry_utm32.map(point =>
        proj4("EPSG:25832", "EPSG:4326", point).map(value => Number(value.toFixed(7)))
      )
    }
  };
}

function featureToProject(feature, proj4) {
  if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates) || feature.geometry.coordinates.length < 2) {
    throw new Error(`Feature ${feature.id ?? feature.properties?.id ?? "unknown"} mangler gyldig LineString-geometri`);
  }

  const project = normalizeProperties({
    ...feature.properties,
    id: feature.properties?.id ?? feature.id ?? ""
  });

  return {
    ...project,
    geometry_utm32: feature.geometry.coordinates.map(point =>
      proj4("EPSG:4326", "EPSG:25832", point).map(value => Math.round(value))
    )
  };
}

async function writeDerivedArtifacts(projects, proj4, options = {}) {
  const { writeGeoJson = true } = options;
  const rows = projects.map(project => projectProperties(project));
  const geometries = Object.fromEntries(projects.map(project => [project.id, project.geometry_utm32]));
  const featureCollection = {
    type: "FeatureCollection",
    name: "vegspor-projects",
    crs_note: "Authoritative geometry is WGS84/EPSG:4326. Derived artifacts may use EPSG:25832.",
    features: projects.map(project => projectToFeature(project, proj4))
  };

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(csvPath, toCsv(rows), "utf8");
  await fs.writeFile(geometryPath, `${JSON.stringify(geometries, null, 2)}\n`, "utf8");
  if (writeGeoJson) {
    await fs.writeFile(geoJsonPath, `${JSON.stringify(featureCollection, null, 2)}\n`, "utf8");
  }
  await fs.writeFile(mockProjectsPath, `window.mockProjects = ${JSON.stringify(projects, null, 2)};\n`, "utf8");
}

async function extractFromMock() {
  const proj4 = await loadProj4();
  const projects = await loadMockProjects();
  await writeDerivedArtifacts(projects, proj4);
}

async function buildMockFromGeoJson() {
  const proj4 = await loadProj4();
  const geoJson = JSON.parse(await fs.readFile(geoJsonPath, "utf8"));
  const features = geoJson.features || [];
  const projects = features.map(feature => featureToProject(feature, proj4));
  await writeDerivedArtifacts(projects, proj4, { writeGeoJson: false });
}

async function buildGeoJsonFromCsvAndGeometry() {
  const proj4 = await loadProj4();
  const csvText = await fs.readFile(csvPath, "utf8");
  const geometryText = await fs.readFile(geometryPath, "utf8");
  const rows = parseCsv(csvText);
  const geometries = JSON.parse(geometryText);

  const projects = rows.map(row => {
    const project = normalizeProperties(row);
    const geometry = geometries[project.id];
    if (!Array.isArray(geometry) || geometry.length < 2) {
      throw new Error(`Missing geometry for project: ${project.id}`);
    }

    return {
      ...project,
      geometry_utm32: geometry
    };
  });

  await writeDerivedArtifacts(projects, proj4);
}

const command = process.argv[2];

if (command === "extract-from-mock") {
  await extractFromMock();
} else if (command === "build-mock") {
  await buildMockFromGeoJson();
} else if (command === "migrate-to-geojson") {
  await buildGeoJsonFromCsvAndGeometry();
} else {
  console.error("Usage: node scripts/project-data.mjs <extract-from-mock|build-mock|migrate-to-geojson>");
  process.exitCode = 1;
}

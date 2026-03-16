import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const mockProjectsPath = path.join(repoRoot, "mock-projects.js");
const dataDir = path.join(repoRoot, "data");
const csvPath = path.join(dataDir, "projects.csv");
const geometryPath = path.join(dataDir, "project-geometries.json");

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

async function loadMockProjects() {
  const source = await fs.readFile(mockProjectsPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.mockProjects || [];
}

function normalizeRow(row) {
  const project = {};
  for (const field of CSV_FIELDS) {
    const value = row[field] ?? "";
    if (field === "år_fra" || field === "år_til" || field === "prioritet") {
      project[field] = Number(value);
    } else if (field === "length_km") {
      project[field] = value ? Number(value) : "";
    } else {
      project[field] = value;
    }
  }
  return project;
}

async function extractFromMock() {
  const projects = await loadMockProjects();
  const rows = projects.map(project => Object.fromEntries(CSV_FIELDS.map(field => [field, project[field] ?? ""])));
  const geometries = Object.fromEntries(projects.map(project => [project.id, project.geometry_utm32]));

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(csvPath, toCsv(rows), "utf8");
  await fs.writeFile(geometryPath, `${JSON.stringify(geometries, null, 2)}\n`, "utf8");
}

async function buildMockFromData() {
  const csvText = await fs.readFile(csvPath, "utf8");
  const geometryText = await fs.readFile(geometryPath, "utf8");
  const rows = parseCsv(csvText);
  const geometries = JSON.parse(geometryText);

  const projects = rows.map(row => {
    const project = normalizeRow(row);
    const geometry = geometries[project.id];
    if (!Array.isArray(geometry) || !geometry.length) {
      throw new Error(`Missing geometry for project: ${project.id}`);
    }
    return {
      ...project,
      geometry_utm32: geometry
    };
  });

  await fs.writeFile(
    mockProjectsPath,
    `window.mockProjects = ${JSON.stringify(projects, null, 2)};\n`,
    "utf8"
  );
}

const command = process.argv[2];

if (command === "extract-from-mock") {
  await extractFromMock();
} else if (command === "build-mock") {
  await buildMockFromData();
} else {
  console.error("Usage: node scripts/project-data.mjs <extract-from-mock|build-mock>");
  process.exitCode = 1;
}

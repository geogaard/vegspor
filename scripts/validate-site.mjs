import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const mockProjectsPath = path.join(repoRoot, "mock-projects.js");
const projectsGeoJsonPath = path.join(repoRoot, "data", "projects.geojson");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getInlineScripts(html) {
  return [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(match => match[1]);
}

async function validateIndexHtml() {
  const html = await fs.readFile(indexPath, "utf8");
  assert(html.includes('<div id="map"></div>'), "index.html mangler #map-containeren");

  const inlineScripts = getInlineScripts(html);
  assert(inlineScripts.length > 0, "Fant ingen inline script i index.html");

  const appScript = inlineScripts[inlineScripts.length - 1];
  new vm.Script(appScript, { filename: "index.html:inline-script" });
}

async function validateMockProjects() {
  const source = await fs.readFile(mockProjectsPath, "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "mock-projects.js" });

  const projects = context.window.mockProjects;
  assert(Array.isArray(projects), "window.mockProjects er ikke en array");
  assert(projects.length > 0, "window.mockProjects er tom");

  for (const project of projects) {
    assert(project.id, "Prosjekt mangler id");
    assert(Array.isArray(project.geometry_utm32) && project.geometry_utm32.length > 1, `Prosjekt ${project.id} mangler geometri`);
  }
}

async function validateProjectsGeoJson() {
  const source = await fs.readFile(projectsGeoJsonPath, "utf8");
  const geoJson = JSON.parse(source);
  assert(geoJson.type === "FeatureCollection", "data/projects.geojson er ikke en FeatureCollection");
  assert(Array.isArray(geoJson.features) && geoJson.features.length > 0, "data/projects.geojson har ingen features");

  for (const feature of geoJson.features) {
    assert(feature.id || feature.properties?.id, "Feature i data/projects.geojson mangler id");
    assert(feature.geometry?.type === "LineString", `Feature ${feature.id ?? feature.properties?.id} har ikke LineString-geometri`);
    assert(
      Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length > 1,
      `Feature ${feature.id ?? feature.properties?.id} mangler koordinater`
    );
  }
}

await validateIndexHtml();
await validateProjectsGeoJson();
await validateMockProjects();

console.log("Site validation OK");

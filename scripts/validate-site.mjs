import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.html");
const mockProjectsPath = path.join(repoRoot, "mock-projects.js");

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

await validateIndexHtml();
await validateMockProjects();

console.log("Site validation OK");

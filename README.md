# Vegspor

[![Pages](https://github.com/geogaard/vegspor/actions/workflows/pages.yml/badge.svg)](https://github.com/geogaard/vegspor/actions/workflows/pages.yml)

Rask prototype for a vise vegprosjekter pa kart.

Autoritativ prosjektlagring ligger i `data/projects.geojson` som `WGS84 / EPSG:4326`. Av hensyn til appen genereres det fortsatt UTM32-derivater og `mock-projects.js`, men disse er ikke lenger source of truth.

Live-side: `https://geogaard.github.io/vegspor/`

## Innhold

- `index.html` - MapLibre-basert prototype med kart, prosjektpanel og Vegkart-lenker
- `data/projects.geojson` - autoritativ prosjektfil i WGS84 GeoJSON
- `data/projects.csv` - derivert prosjektregister for tabellredigering og kontroll
- `data/project-geometries.json` - derivert UTM32-geometri per prosjekt
- `data/project-representations.geojson` - hjelpelinjer brukt som input mot NVDB
- `data/nvdb-centerlines.json` - NVDB-avledede senterlinjer per kildefeature
- `mock-projects.js` - generert appdata for prototypen
- `scripts/project-data.mjs` - synk mellom `CSV/geometri` og `mock-projects.js`
- `scripts/fetch-nvdb-centerlines.mjs` - henter senterlinjegeometri fra NVDB basert pa hjelpelinjer

## Kom i gang

Apne `index.html` direkte i nettleseren. Prototypen bruker ingen byggekjaede.

For a validere at statisk-siden er konsistent lokalt:

```bash
node scripts/validate-site.mjs
```

## Dataflyt

Autoritativ kilde er na `data/projects.geojson`, der bade metadata og geometri ligger samlet som GeoJSON-features i WGS84.
`data/projects.csv` og `data/project-geometries.json` bygges ut fra denne filen for kompatibilitet med eksisterende scripts og appdata.

For a trekke ut dagens appdata til autoritativ GeoJSON og derivater:

```bash
node scripts/project-data.mjs extract-from-mock
```

For a bygge `mock-projects.js` og derivater tilbake fra autoritativ GeoJSON:

```bash
node scripts/project-data.mjs build-mock
```

Hvis du redigerer `data/projects_cleaned.geojson` i et eksternt verktøy, synk den inn som autoritativ fil og bygg kartdataene slik:

```bash
node scripts/sync-cleaned-geojson.mjs
```

For a migrere et eksisterende `CSV + UTM32`-oppsett til autoritativ GeoJSON:

```bash
node scripts/project-data.mjs migrate-to-geojson
```

For a hente senterlinjer fra NVDB basert pa hjelpelinjene i repoet:

```bash
node scripts/fetch-nvdb-centerlines.mjs
```

Scriptet skriver `data/nvdb-centerlines.json` og markerer hver linje med `nvdb_complete`, `nvdb_status` og brukt `nvdb_max_distance_used`.

## Neste steg

- Fyll `data/projects.csv` med mer presise prosjektopplysninger
- Koble NVDB-senterlinjene til riktig prosjekt-id i `data/projects.csv`
- Del opp data videre i egne filer for media og fortellingskapitler

## GitHub Pages

GitHub Pages er live pa `https://geogaard.github.io/vegspor/`.

Repoet bruker en GitHub Actions-workflow i `.github/workflows/pages.yml` som:

- validerer `index.html` og `mock-projects.js`
- lager en minimal Pages-artifact med `index.html` og `mock-projects.js`
- deployer til GitHub Pages ved push til `main` eller `master`

For a bruke dette i egen GitHub-repo:

1. Push prosjektet til din egen repo.
2. Gaa til `Settings -> Pages`.
3. Sett `Source` til `GitHub Actions`.
4. Sjekk `Settings -> Environments -> github-pages` hvis deploy blir blokkert.
5. Push til `main` eller `master`.

Hvis du senere bruker eget domene, kan du legge en `CNAME`-fil i repo-roten. Workflowen tar den med automatisk.

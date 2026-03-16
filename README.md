# Vegspor

[![Pages](https://github.com/geogaard/vegspor/actions/workflows/pages.yml/badge.svg)](https://github.com/geogaard/vegspor/actions/workflows/pages.yml)

Rask prototype for a vise vegprosjekter pa kart med en tidsdimensjon.

Mockdataene lagres i `ETRS89 / UTM zone 32N (EPSG:25832)`. MapLibre brukes kun som visningsmotor, og koordinatene transformeres til visningsformat i nettleseren.

Live-side: `https://geogaard.github.io/vegspor/`

## Innhold

- `index.html` - MapLibre-basert prototype med tidslinje, prosjektpanel og Vegkart-lenker
- `data/projects.csv` - prosjektregister for metadata og innhold
- `data/project-geometries.json` - UTM32-geometrier per prosjekt
- `mock-projects.js` - generert appdata for prototypen
- `scripts/project-data.mjs` - synk mellom `CSV/geometri` og `mock-projects.js`

## Kom i gang

Apne `index.html` direkte i nettleseren. Prototypen bruker ingen byggekjaede.

For a validere at statisk-siden er konsistent lokalt:

```bash
node scripts/validate-site.mjs
```

## Dataflyt

Prosjektregisteret eies na i `data/projects.csv`, mens geometri ligger i `data/project-geometries.json`.
CSV-en inneholder na ogsa presentasjons- og kvalitetsfelt som `kostnad_label`, `length_km`, `datakvalitet`, `geometry_status` og `geometry_kilde`.

For a trekke ut dagens appdata til disse filene:

```bash
node scripts/project-data.mjs extract-from-mock
```

For a bygge `mock-projects.js` tilbake fra `CSV + geometri`:

```bash
node scripts/project-data.mjs build-mock
```

## Neste steg

- Fyll `data/projects.csv` med mer presise prosjektopplysninger
- Legg til mer presise geometrier fra Vegkart/NVDB
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

# Vegspor Todo

Styrende plan for redesign og videre utvikling. Kryss av fortløpende.

## Aktiv Redesign-spec

Dette er neste styrende grep. Ikke legg til nye bokser eller nye kontrollflater før dette er gjennomfort.

### Hovedmal

- Kartet skal eie klart mest av oppmerksomheten, omtrent `80-85%`
- UI skal leses som et lett rammeverk rundt kartet, ikke som objekter oppa kartet
- `Alle prosjekter` er hovedmodus
- `Tidslinje` er sekundarmodus og skal aktiveres bevisst

### Komposisjon

- Oppe til venstre:
  ett lite identitetskort, ikke en bred header
- Oppe til hoyre:
  en kompakt filter/modus-rad
- Hoyre side:
  ett smalere sidepanel for valgt prosjekt
- Nederst:
  tidslinje kun nar `Tidslinje`-modus er aktiv
- Hjelpeelementer:
  koordinater skal enten integreres i eksisterende UI eller fjernes

### Informasjonsnivaer

- Niva 1:
  kart og prosjektlinjer
- Niva 2:
  valgt prosjekt
- Niva 3:
  filtre, lagvalg og tidsvalg
- Niva 4:
  metadata som kilde, rolle, status og koordinater

### Hva som skal bort eller ned

- Fjern duplisert status som `Visning: alle` flere steder
- Unnga egne bokser for informasjon som ikke styrer en handling
- Ikke vis store forklarende tekstblokker permanent
- Ikke la modusvelgeren ligge midt i hovedsynsfeltet
- Ikke la koordinater flyte som egen løs chip uten klar funksjon

### Typografi og tetthet

- Reduser generell tekststorrelse ett hakk i overlays
- Reduser padding i paneler og chips
- Reduser border-radius noe for et strammere uttrykk
- Bruk kortere etiketter og mindre uppercase-stoy
- Sidepanel skal ha hoy informasjonsdensitet, men lav visuell tyngde

### Sidepanel

- Fast til hoyre
- Kun `minimer`, ikke flytting
- Smalere enn dagens versjon
- `Valgt` skal vaere default-fane
- `Valgt` skal kun vise de viktigste feltene aapent
- Sekundarinfo som `kilde`, `rolle` og `status` skal tones ned eller foldes inn

### Modusvelger

- Skal ligge forankret til topp-hoyre
- Skal vaere kort og lav
- Skal primart inneholde:
  `Alle prosjekter` og `Tidslinje`
- Ekstrainfo som valgt aar skal ligge i samme rad, men underordnet

### Tidslinje

- Skjult som standard
- Kun synlig i `Tidslinje`
- Skal vaere lav og ren
- Skal ikke konkurrere med sidepanelet om oppmerksomhet

### Koordinater

- Vurderes pa nytt
- Enten:
  flyttes inn i sidepanel eller lag-panel
- Eller:
  beholdes kun som liten, nesten usynlig readout i kartkant
- Hvis den ikke hjelper en konkret arbeidsoppgave, fjernes den

### Kriterier for neste pass

- Ved forste oyekast skal brukeren se kartet, ikke UI
- Topplinjen skal oppta klart mindre plass enn na
- Sidepanelet skal oppleves lettere og smalere
- Det skal vaere fa samtidige focal points
- Kartet skal fortsatt fungere godt med alle prosjekter synlige samtidig

### Status etter kompresjonspass

- [x] Gjort identitetsflaten om til et lite, uinnrammet hjornetillegg
- [x] Komprimert modusvelgeren og forankret den strammere mot topp-hoyre
- [x] Fjernet koordinatboksen fra kartflaten
- [x] Gjort sidepanelet smalere og med mindre visuell tyngde
- [x] Tonet ned sekundarinfo i `Valgt`-fanen

## Prinsipper

- [x] Velg hybrid retning: `Explorer first`, med tydelig `Presentation mode` senere
- [x] Hold kildedata i `ETRS89 / UTM 32N (EPSG:25832)`
- [ ] La kartet være primærflaten, ikke panelene
- [x] Bruk progressive disclosure for detaljer og avanserte valg
- [ ] Foretrekk MapLibre-plugins der de faktisk løser et avgrenset problem godt

## Plugin-sjekk

- [x] Undersøk relevante MapLibre-plugins og controls
- [x] Verifiser at det finnes plugin for stilskifte av basemap
- [x] Konkluder at layoutshell og dockbart sidepanel må bygges selv
- [x] Integrer `maplibre-gl-style-flipper` i løsningen
- [ ] Vurder senere plugin for layer control hvis det gir reell verdi

## Layout Redesign

- [x] Erstatt hero-demo med en rolig, kompakt topbar
- [x] Flytt sekundære kontroller bort fra hovedfokus
- [x] Gjør sidepanelet til primær detaljflate
- [x] Komprimer tidslinjen til en lav, presis kontrollflate
- [x] Gjør legend om til et lite kartografisk støtteelement
- [x] Rydd bort dekor som svekker kartlesbarhet
- [x] Sett `Alle prosjekter` som standardvisning
- [x] Gjor tidslinjen valgfri i stedet for alltid synlig
- [x] Stram inn toppvenstre videre med mindre tekst og mindre visuell vekt

## Sidepanel

- [x] Fjern flytting av sidepanel
- [x] Vis valgt prosjekt i sidepanel i stedet for popup
- [x] Del sidepanelet i faner: `Selected`, `Projects`, `Layers`
- [x] Legg inn tydelig tomtilstand når ingenting er valgt
- [ ] Legg til plass for bilder i prosjektvisningen
- [x] Legg til plass for kilder og prosjektstatus
- [x] Fjern minimering nar panelet ikke gir mer kartflate
- [x] Gjør `Valgt` om til et kompakt inspector-panel med `hover`- og `valgt`-state
- [x] Skill hover-statistikk fra valgt prosjekt i sidepanelet

## Kart og lag

- [x] Sett kartet til ren topp-ned visning
- [x] Hold mockdata i UTM 32 med transformasjon i klienten
- [x] Legg til tydeligere vegnett-overlay, ikke bare basemap
- [x] Rydd attribution og laglogikk etter innforing av offisiell mork basemap
- [x] Skille visuelt mellom aktive, fullførte og valgte prosjekter
- [x] Legg til layer toggles for visning av legend, fullførte prosjekter og aktiv glow
- [x] Legg til hover-basert prosjektvisning i kartet
- [x] Legg til bytte mellom kartografisk og presentasjonsdrevet linjestil
- [x] Forbedre prosjektpaletten for mørk basemap

## Tidsdimensjon

- [x] Ha fungerende år-slider og avspilling
- [ ] Legg til støtte for year range i tillegg til single year
- [ ] Bedre visuell kobling mellom tidsvalg og kartoppdatering
- [ ] Legg til presentasjonsvennlig autoplay-modus

## Presentasjon

- [ ] Egen `Presentation mode`
- [ ] Skjule arbeidskontroller i presentasjonsmodus
- [ ] Lage 2-3 komposisjoner som fungerer godt i PowerPoint-screenshots

## CI/CD

- [x] Sette opp GitHub Pages-workflow med GitHub Actions
- [x] Legge inn validering av statisk side i CI
- [x] Lage minimal deploy-artifact for Pages
- [ ] Flytte repoet til egen GitHub-repo eller oppdatere `origin`

## Data

- [x] Etablere mockdata for vegprosjekter
- [x] Erstatte generiske mockprosjekter med forelopige offentlige prosjektdata
- [x] Bytte mockdata til prosjektregister fra tabell/CSV
- [x] Flytte prosjektberikelse som kostnad, lengde og datakvalitet inn i CSV-registeret
- [x] Erstatte grove mocklinjer med routed senterlinjer som folger vegnettet bedre
- [ ] Knytte prosjekter til endelig kvalitetssikrede strekninger fra Vegkart/NVDB
- [x] Spore datakvalitet og kilde per prosjekt

## Verifikasjon

- [x] Syntakssjekk av JavaScript etter endringer
- [x] Visuell QA i desktop browser
- [x] Desktop browser-smoke-test etter geometrioppdatering
- [ ] Visuell QA i mobilbredde
- [x] Gaa gjennom lesbarhet med reelt prosjektinnhold

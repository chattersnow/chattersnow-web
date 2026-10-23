// Builds the `places` seed migration (#1699) from public data.
//
//   bun run places:seed            # writes supabase/migrations/<VERSION>_places_seed.sql
//   bun run places:seed --cache D  # keep the downloads in D between runs
//
// Sources (all public domain or NYC Open Data terms; vintages recorded in
// docs/spec/events.md, "Registration questions"):
//
//   - Census 2025 Gazetteer: counties, county subdivisions, places
//   - Census 2020 FIPS codes: state names, and which counties each place lies
//     in (the Gazetteer has no county for a place)
//   - Census 2024 population estimates for incorporated places, county
//     subdivisions and counties (search ranking only)
//   - NYC Planning 2020 Neighborhood Tabulation Areas, via NYC Open Data
//
// Nothing is fetched at runtime by the app: the output is a migration, so
// every database gets the same rows from `supabase db push` / `db reset`. The
// row logic is in scripts/places/build.ts.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import {
  SOURCES,
  buildPlaces,
  type BuildInput,
  type PlaceRow,
} from "./places/build";

const VERSION = "20261023160100";
const OUT = `supabase/migrations/${VERSION}_places_seed.sql`;

const GAZETTEER =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer";
const CODES = "https://www2.census.gov/geo/docs/reference/codes2020";
const POPULATION =
  "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv";
const NTA =
  "https://data.cityofnewyork.us/resource/9nt8-h7nd.json?$select=nta2020,ntaname,boroname,ntatype&$limit=1000";

// The number of municipalities NJ Office of GIS publishes (564 since Pine
// Valley merged into Pine Hill in 2022). The Census county subdivisions match
// it; a different count means a source changed under us.
const NJ_MUNICIPALITIES = 564;

const { values: args } = parseArgs({
  options: { cache: { type: "string" } },
});
const cache = args.cache ?? join(tmpdir(), "coven-places-seed");
mkdirSync(cache, { recursive: true });

async function download(url: string, file: string): Promise<string> {
  const path = join(cache, file);
  if (!existsSync(path)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  return path;
}

async function gazetteer(kind: string): Promise<string[][]> {
  const zip = await download(
    `${GAZETTEER}/2025_Gaz_${kind}_national.zip`,
    `2025_Gaz_${kind}_national.zip`,
  );
  const result = Bun.spawnSync(["unzip", "-p", zip]);
  if (result.exitCode !== 0) throw new Error(`unzip ${zip} failed`);
  return pipeTable(result.stdout.toString("utf8"));
}

async function codes(file: string): Promise<string[][]> {
  return pipeTable(
    readFileSync(await download(`${CODES}/${file}`, file), "utf8"),
  );
}

/** Pipe-delimited with a header row; header dropped, fields trimmed. */
function pipeTable(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|").map((field) => field.trim()));
}

async function load(): Promise<BuildInput> {
  const [states, counties, cousubs, places, placeCounties] = await Promise.all([
    codes("national_state2020.txt"),
    gazetteer("counties"),
    gazetteer("cousubs"),
    gazetteer("place"),
    codes("national_place_by_county2020.txt"),
  ]);
  const ntaPath = await download(NTA, "nta2020.json");
  const populationPath = await download(POPULATION, "sub-est2024.csv");
  const ntas = JSON.parse(readFileSync(ntaPath, "utf8")) as {
    nta2020: string;
    ntaname: string;
    boroname: string;
    ntatype: string;
  }[];

  return {
    // STATE|STATEFP|STATENS|STATE_NAME
    states: states.map(([usps, fips, , name]) => ({ usps, fips, name })),
    // USPS|GEOID|GEOIDFQ|ANSICODE|NAME|...
    counties: counties.map(([usps, geoid, , , name]) => ({
      usps,
      geoid,
      name,
    })),
    // USPS|GEOID|GEOIDFQ|ANSICODE|NAME|FUNCSTAT|...
    cousubs: cousubs.map(([usps, geoid, , , name, funcstat]) => ({
      usps,
      geoid,
      name,
      funcstat,
    })),
    // USPS|GEOID|GEOIDFQ|ANSICODE|NAME|LSAD|FUNCSTAT|...
    places: places.map(([usps, geoid, , , name, , funcstat]) => ({
      usps,
      geoid,
      name,
      funcstat,
    })),
    // STATE|STATEFP|COUNTYFP|COUNTYNAME|PLACEFP|...
    placeCounties: placeCounties.map(([, statefp, countyfp, , placefp]) => ({
      placeGeoid: `${statefp}${placefp}`,
      countyGeoid: `${statefp}${countyfp}`,
    })),
    ntas: ntas.map((nta) => ({
      code: nta.nta2020,
      name: nta.ntaname,
      borough: nta.boroname,
      ntaType: nta.ntatype,
    })),
    populations: populations(readFileSync(populationPath, "latin1")),
  };
}

// SUMLEV 050 is a county, 061 a county subdivision, 162 an incorporated
// place. The names in this file are Latin-1 and contain no commas.
function populations(csv: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const fields = line.split(",");
    const [sumlev, state, county, place, cousub] = fields;
    const estimate = Number(fields.at(-1));
    if (!Number.isFinite(estimate)) continue;
    const key =
      sumlev === "050"
        ? `county:${state}${county}`
        : sumlev === "061"
          ? `cousub:${state}${county}${cousub}`
          : sumlev === "162"
            ? `place:${state}${place}`
            : null;
    if (key) result.set(key, estimate);
  }
  return result;
}

function sqlText(value: string | null): string {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

function sqlArray(values: string[]): string {
  return values.length === 0
    ? "'{}'"
    : `array[${values.map(sqlText).join(",")}]`;
}

function sqlRow(row: PlaceRow): string {
  return `(${[
    sqlText(row.key),
    sqlText(row.parentKey),
    sqlArray(row.extraCountyKeys),
    sqlText(row.kind),
    sqlText(row.name),
    sqlText(row.placeType),
    sqlText(row.label),
    sqlText(row.stateCode),
    // A locality's or neighborhood's county is its parent's, set below.
    sqlText(
      row.kind === "county" || row.kind === "borough" ? row.countyName : null,
    ),
    sqlArray(row.aliases),
    row.population === null ? "null" : String(row.population),
  ].join(",")})`;
}

function migration(rows: PlaceRow[]): string {
  const chunks: string[] = [];
  for (let i = 0; i < rows.length; i += 1000) {
    chunks.push(
      `insert into places_seed values\n${rows
        .slice(i, i + 1000)
        .map(sqlRow)
        .join(",\n")};`,
    );
  }
  return `-- GENERATED by \`bun run places:seed\` (scripts/places-seed.ts) -- do not edit.
-- The places reference table's rows (#1699): ${rows.length} places from the
-- Census 2025 Gazetteer, Census 2020 FIPS codes and NYC Planning's 2020
-- Neighborhood Tabulation Areas. Sources and vintages: docs/spec/events.md.
--
-- Ids are uuid v5 of each row's stable key, so a rebuilt seed keeps an
-- unchanged place's id. Answers copy their label, so a place that later
-- disappears never changes an answer that named it.

create temporary table places_seed (
  key text primary key,
  parent_key text,
  extra_county_keys text[] not null,
  kind text not null,
  name text not null,
  place_type text,
  label text not null,
  state_code text not null,
  county_name text,
  aliases text[] not null,
  population integer
);

${chunks.join("\n\n")}

insert into public.places
  (id, kind, name, place_type, label, parent_id, state_code, county_name, source, source_id, aliases, population)
select public.place_key_id(s.key), s.kind, s.name, s.place_type, s.label,
       public.place_key_id(s.parent_key), s.state_code, s.county_name,
       case split_part(s.key, ':', 1)
${Object.entries(SOURCES)
  .map(([prefix, source]) => `         when '${prefix}' then '${source}'`)
  .join("\n")}
       end,
       split_part(s.key, ':', 2), s.aliases, s.population
  from places_seed s
 order by s.key;

update public.places p
   set county_name = parent.county_name
  from public.places parent
 where parent.id = p.parent_id
   and parent.kind in ('county', 'borough')
   and p.kind in ('locality', 'neighborhood');

-- Each place's own id and every place it lies within, for the service area
-- ranking: up to three ancestors, plus the other counties of a place that
-- spans several (each under the same state as the first).
update public.places p
   set area_ids = array_remove(array[p.id, p1.id, p2.id, p3.id], null)
  from public.places p0
  left join public.places p1 on p1.id = p0.parent_id
  left join public.places p2 on p2.id = p1.parent_id
  left join public.places p3 on p3.id = p2.parent_id
 where p0.id = p.id;

update public.places p
   set area_ids = p.area_ids || extra.ids
  from (select public.place_key_id(s.key) as id,
               array_agg(public.place_key_id(k)) as ids
          from places_seed s, unnest(s.extra_county_keys) k
         group by s.key) extra
 where p.id = extra.id;

drop table places_seed;
`;
}

const input = await load();
const rows = buildPlaces(input);

const njMunicipalities = rows.filter(
  (row) =>
    row.kind === "locality" &&
    row.stateCode === "NJ" &&
    row.placeType !== "CDP",
).length;
if (njMunicipalities !== NJ_MUNICIPALITIES) {
  throw new Error(
    `Expected ${NJ_MUNICIPALITIES} NJ municipalities, built ${njMunicipalities}`,
  );
}

writeFileSync(OUT, migration(rows));
const byKind = Object.groupBy(rows, (row) => row.kind);
console.log(
  `${OUT}: ${rows.length} places (${Object.entries(byKind)
    .map(([kind, list]) => `${list?.length} ${kind}`)
    .join(", ")})`,
);

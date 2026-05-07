# Feature: Climate Projection & Operational Risk Overlay

**Version:** 0.3 (Draft for Review)
**Date:** 2026-05-07
**Status:** Planning + architecture — no code yet
**Source brief:** Ana DeFrates email thread, May 4–5 2026 — climate adaptation reference list (URLs cross-checked against the original thread in v0.3)
**Roadmap parent:** `10_FY26_FORESIGHT_ROADMAP.md`
**Target sprints:** S4 (spike), S5–S8 (build), S9 (ESRI bridge)
**Greenlight gates:** G0 → S4, G1 → S5, G2 → S9 (see roadmap §6)

> **Scope note from the source brief.** Ana's department recently completed a _climate adaptation_ project with several City departments where they considered how future climate scenarios may affect operations. The reference list she shared (§4) splits cleanly into **three categories**: climate projections/scenarios, climate risk-assessment resources, and **departmental performance data**. The third category — safety ratings, code compliance, incident lists, asset inventories, demand-growth models — is _not_ climate data; it is the operational data each department joins _against_ climate risk to ask "what does this scenario do to my operation?" This feature treats those three categories as a **triad** (§3), not a single layer.

---

## 1. Vision

Foresight today is a **text-and-score** intelligence platform. This feature extends it into a **place-based, operations-aware** platform: signals can be joined to geography; geography can carry climate-risk _and_ demographic-vulnerability layers; and those risk layers can be co-rendered with each department's **operational performance data** (incident history, asset inventories, demand projections). A user reviewing the _Place_ workstream will be able to ask "which census tracts have both [stormwater incident signal] _and_ [Atlas 14 100-yr flood risk] _and_ [EDF Climate Vulnerability Index ≥ 0.7] _and_ [aging stormwater asset density ≥ X]?" and see the answer on a map.

The feature is **explicitly future-flagged** in Ana's brief — it does not ship during the current testing window. This document plans for the moment that gate opens.

## 2. Architectural North Star: Open-Source Now, ESRI-Forward

The City has a path to **ESRI Enterprise GIS** (ArcGIS Enterprise / ArcGIS Online) and potentially direct support from ESRI for this project. We do not have ESRI access on the build machine today.

The architectural commitment of this feature is:

> **Build the foundation entirely on open-source, OGC-standards-compliant components. Choose every component such that an ESRI service can replace, augment, or be added to it later without throwing away work.**

This commitment shapes every decision below. We optimize for the open-source path now and document the ESRI bridge so we can pull it forward when access lands.

### 2.1 The four enablers of forward-compatibility

| Enabler                                                                             | What it gives us                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PostGIS** as the spatial database                                                 | ArcGIS Enterprise officially supports PostgreSQL/PostGIS as an _enterprise geodatabase_. Migrating from "PostGIS we manage" to "PostGIS that ArcGIS Enterprise also reads" is configuration, not data movement.                                       |
| **OGC standards** (WMS, WMTS, WFS, OGC API – Tiles/Features) for service interfaces | ArcGIS Server publishes OGC-compliant endpoints; ArcGIS clients consume them. Anything we ship over OGC interfaces stays compatible.                                                                                                                  |
| **MapLibre GL JS** as the map library                                               | Open-source fork of Mapbox GL. Plays cleanly with OGC tile endpoints. ArcGIS REST and ArcGIS Online vector tiles are reachable via well-documented adapters. The community `@watergis/maplibre-gl-export` and `@arcgis/core` interop story is mature. |
| **Open data formats** (GeoJSON, GeoPackage, COG, MBTiles/PMTiles)                   | All consumable by ArcGIS Pro/Enterprise; all available as open tools.                                                                                                                                                                                 |

### 2.2 What we explicitly do not pick

- **Mapbox GL JS** (license post-2.0). MapLibre GL is the open fork and is the safe bet for a public-sector deployment.
- **Leaflet only**. Excellent library, but vector-tile / 3D / large-raster ergonomics are weaker; harder ESRI co-existence story.
- **Proprietary tile providers as a hard dependency**. We can use them as decoration (basemap) behind a config flag.
- **Cloud raster services we can't move off** (e.g., Google Earth Engine as the system of record). GEE is fine as a _data source_ we ingest from; not as an architectural foundation.

## 3. The Climate-Adaptation Triad (methodology adapted from Ana's brief)

Ana's reference list maps directly to three layer _kinds_ this feature must support. The architecture treats them as three first-class layer types that share the same join geometry and the same render surface:

| Triad component                         | What it is                                           | Examples (from Ana's brief)                                                                                                                                       | Layer type in our model                  | Geographic unit                       |
| --------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| **A · Climate projections / scenarios** | Modeled future conditions over space and time        | City of Austin climate projections; winter-storm/flood/heat scenarios; Atlas 14 flood projections; CAMPO Vulnerability Assessment                                 | `risk_layer` with `kind='projection'`    | Grid cell, watershed, corridor, tract |
| **B · Climate risk & vulnerability**    | Composite indices and assessment frameworks          | EDF Climate Vulnerability Index; US Climate Resilience Toolkit; World Bank tools; US DOT vulnerability tools; Texas A&M wildfire risk portal; Austin digital twin | `risk_layer` with `kind='vulnerability'` | Census tract, parcel, WUI polygon     |
| **C · Departmental performance data**   | Each department's _operational_ state and trajectory | Safety ratings; code compliance; historical incident lists; supply / asset inventories; service-demand history + projected growth                                 | `performance_layer` (new concept)        | Asset point, district, service area   |

**Why the triad matters architecturally.** A and B are _exogenous_ — Foresight ingests them from open or licensed sources. C is _endogenous to the City_ — it lives in departmental systems and has different ownership, sensitivity, and refresh cadence. Co-rendering A, B, and C is the entire point of climate-adaptation analysis. A risk layer alone tells you "where the heat will be"; a performance layer alone tells you "where your aging assets are"; only together do they tell you "where your aging assets will be exposed to heat" — which is what budget decisions need.

We therefore introduce a **`performance_layer`** sibling to `risk_layer` (§5.1). The two share `admin_boundaries` joins, the same tile server, and the same render path; their _governance_ is what differs (RLS, source-of-record, refresh, sensitivity).

## 4. Non-goals

- Ingesting GEE rasters live at request time. Phase 1 ingests pre-processed tiles or vectorized risk-by-tract values.
- Becoming a full GIS application. Foresight remains a foresight tool; the map is a _lens_ on signals + risk + ops, not a replacement for ArcGIS Pro.
- Real-time sensor data (stream gauges, fire weather). Out of scope; revisit in a future sprint.
- Routing, geocoding-as-a-service, or address-level data. Out of scope.
- Building departmental data warehouses. We _consume_ performance data the City already has; we do not become a system of record for it.

## 5. Reference Datasets (Phase 1 candidates)

Selected during S4 spike (Gate G1). Listed by triad component (§3) and roughly ranked by feasibility and strategic value.

### 5.1 Triad A — Climate projections / scenarios

URLs come directly from Ana DeFrates' May 5 2026 reference list (see §0 Source brief).

| Dataset                                                                                                                                                                                                                                          | Source          | Open?                 | Format       | Geographic unit      | Why it matters                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | --------------------- | ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **[City of Austin climate projections](https://www.austintexas.gov/page/climate-projections-austin)**                                                                                                                                            | City of Austin  | Open                  | Web / PDF    | City-wide / district | Local authoritative scenarios; first stop for budget conversations.                                                 |
| **[ATX Flood Pro (Atlas 14 flood mapping)](http://www.atxfloodpro.com/)** + **[ATX Floods early warning](https://atxfloods.com/)**                                                                                                               | City of Austin  | Open                  | Web / GIS    | Watershed / parcel   | Austin-specific operational tools; better Phase-1 fit than raw NOAA HDSC NetCDF.                                    |
| **UT-hosted scenarios for [winter storms](https://utexas.box.com/s/nz709hxe16tdwcitgabwxiwkb0t1p89s) · [floods](https://utexas.box.com/s/t75qipgko9o7ttqwgbg4xitm617bcxuc) · [heat](https://utexas.box.com/s/rz1lwcp41saebk04d8l5ycgygv1d5eut)** | UT Austin (Box) | Shared link (auth?)   | Mixed (Box)  | Mixed                | Operationalized scenario set used in Ana's department's adaptation work. Confirm download permission before ingest. |
| **[CAMPO Central Texas Extreme Weather & CC Vulnerability Assessment](https://www.austintexas.gov/sites/default/files/files/CAMPO_Extreme_Weather_Vulnerability_Assessment_FINAL.pdf)**                                                          | CAMPO           | Open                  | PDF (+ GIS)  | Corridors            | Regional transportation framing.                                                                                    |
| **[IPCC Interactive Atlas](https://interactive-atlas.ipcc.ch/)**                                                                                                                                                                                 | IPCC            | Open                  | Web / NetCDF | Coarse grid          | Long-horizon scenario context; not actionable at tract level.                                                       |
| **[Google Earth Engine catalog](https://earthengine.google.com/)**                                                                                                                                                                               | Google          | Open access (API key) | API          | Various              | Source for _derived_ projection layers; not the system of record.                                                   |

### 5.2 Triad B — Climate risk & vulnerability

| Dataset                                                                                                                                   | Source         | Open?                     | Format        | Geographic unit | Why it matters                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------- | ------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| **[EDF Climate Vulnerability Index](https://map.climatevulnerabilityindex.org/map/)**                                                     | EDF            | Yes (CSV by census tract) | CSV → GeoJSON | Census tract    | Composite of dozens of parameters; trivial to ingest; tract-level.                                        |
| **[US Climate Resilience Toolkit — Assess Vulnerability & Risk](https://toolkit.climate.gov/assess-vulnerability-and-risk)**              | NOAA           | Open                      | Various       | Various         | Framework + datasets index, not a single layer.                                                           |
| **[GIS for Climate hub](https://climate-arcgis-content.hub.arcgis.com/)** ⭐                                                              | Esri           | Open (Esri Hub)           | Esri Hub      | Various         | **Esri-curated catalog** — natural anchor for the §8 ESRI bridge once the partnership lands. New in v0.3. |
| **Texas A&M Texas Wildfire Risk Explorer** (Ana's link in email pointed to atxfloods.com — confirm canonical URL with TAMU before ingest) | TAMU           | Open                      | Web service   | County / parcel | Statewide wildfire context.                                                                               |
| **[Austin Digital Twin (unified)](https://unified.austindigitaltwin.com/) — wildfire mapping**                                            | City of Austin | Open / partner            | Esri / web    | Parcel / WUI    | Local relevance; ESRI-friendly.                                                                           |
| **[World Bank Climate Screening Tools](https://climatescreeningtools.worldbank.org/)**                                                    | World Bank     | Open                      | Various       | Country         | Macro context only; out of Phase 1 unless needed for narrative.                                           |
| **[US DOT FHWA Resilience Tools](https://www.fhwa.dot.gov/environment/sustainability/resilience/tools/)**                                 | US DOT         | Open                      | Various       | Corridor        | Useful for _Place_ workstream transportation framing.                                                     |

### 5.3 Triad C — Departmental performance data

These are _City-internal_ feeds (or City-curated) and require coordination with the owning department. Inclusion is gated on (a) availability and (b) Ana's CSP foresight survey results identifying which departments are ready to share.

| Performance feed (categories from Ana's brief) | Likely source-of-record                         | Geographic unit              | Access path                     |
| ---------------------------------------------- | ----------------------------------------------- | ---------------------------- | ------------------------------- |
| Operation safety ratings                       | Departmental quality systems                    | Asset / facility             | Internal API or CSV export      |
| Code-compliance status                         | Code Department                                 | Parcel / inspection record   | Existing City open data         |
| Historical incident lists                      | Department-specific (e.g., AFD, ATD, Watershed) | Point / district             | Mix of open data + internal     |
| Supply / asset inventories                     | Department (e.g., Public Works, AE)             | Asset point / district       | Internal — varies by department |
| Service-demand history + projected growth      | Department + Budget                             | Service area / planning area | Mix                             |

**Phase 1 strategy for C:** start with one _open_ City of Austin dataset that exemplifies the pattern — e.g., AFD/EMS incident locations or Watershed stormwater incident reports — and use it to prove the join-with-risk-layer concept. Internal feeds slot in via the same `performance_layers` schema once departmental data-sharing is approved.

### 5.4 Phase 1 first datasets (recommendation)

Pick one dataset from each triad component to demonstrate the full pipeline:

1. **A — Austin Atlas 14 flood mapping via [ATX Flood Pro](http://www.atxfloodpro.com/)** (City of Austin operational source; vector flood-zone polygons preferred over raster for Phase 1; pairs with [ATX Floods early warning](https://atxfloods.com/) when we extend to incident-history overlays).
2. **B — [EDF Climate Vulnerability Index](https://map.climatevulnerabilityindex.org/map/)** (CSV by tract; smallest payload; exercises every join path).
3. **C — Watershed stormwater incident history** (open City of Austin dataset; geocoded points; pairs naturally with ATX Flood Pro polygons + EDF CVI for the _Place_ workstream).

This combination demonstrates the _triad join_ on the very first iteration. Subsequent sprints add wildfire (B + [Austin Digital Twin](https://unified.austindigitaltwin.com/)), heat (A + EDF CVI), and additional performance feeds. The [GIS for Climate hub](https://climate-arcgis-content.hub.arcgis.com/) is the natural Phase-2/3 anchor once the Esri partnership lands (§8).

## 5. End-to-End Architecture

```
                         ┌─────────────────────────────────────────┐
                         │             Foresight web app           │
                         │  React + MapLibre GL JS + workstreams   │
                         └────┬────────────────┬───────────────────┘
                              │ /geo/* JSON     │ tile URLs (OGC API – Tiles)
                              ▼                ▼
                         ┌─────────────────────────────────────────┐
                         │             FastAPI backend             │
                         │  /api/v1/geo/*  · risk-join services    │
                         └────┬────────────────┬───────────────────┘
                              │                │
                ┌─────────────┴──────┐   ┌────┴───────────────────┐
                │ PostGIS (Supabase) │   │ Tile server (Martin OR │
                │ - admin_boundaries │   │ pg_tileserv) — sidecar │
                │ - card_geo         │   └────┬───────────────────┘
                │ - risk_layers      │        │
                │ - risk_layer_values│        ▼
                └─────────┬──────────┘   MVT vector tiles
                          │
                          ▼
              Ingest jobs (worker.py)
              - GeoJSON / CSV → PostGIS
              - GeoTIFF → COG → tile pipeline (Phase 2+)

       ─── ESRI bridge (Sprint 9, conditional on G2) ───
       - ArcGIS REST adapter reads ArcGIS Online layers as risk_layers
       - PostGIS connects as ArcGIS Enterprise enterprise geodatabase
       - ArcGIS Online vector tiles served alongside MapLibre tiles
```

### 5.1 Storage

**PostgreSQL + PostGIS** in the existing Supabase project. New tables:

```sql
-- Reference geometries we join signals against.
CREATE TABLE admin_boundaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level         TEXT NOT NULL,              -- 'tract' | 'council_district' | 'planning_area' | 'parcel'
  external_id   TEXT NOT NULL,              -- e.g., census GEOID
  name          TEXT,
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  centroid      geometry(Point, 4326),
  metadata      JSONB DEFAULT '{}'::jsonb,
  source        TEXT,                       -- 'census' | 'cityofaustin' | etc.
  source_year   INT,
  UNIQUE (level, external_id)
);
CREATE INDEX admin_boundaries_geom_idx ON admin_boundaries USING GIST (geom);
CREATE INDEX admin_boundaries_level_idx ON admin_boundaries (level);

-- Geometry attached to a card (point or admin_boundary reference).
CREATE TABLE card_geo (
  card_id            UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  geom               geometry(Geometry, 4326),       -- point, polygon, or null
  primary_boundary   UUID REFERENCES admin_boundaries(id),
  related_boundaries UUID[] DEFAULT '{}',
  inferred           BOOLEAN DEFAULT FALSE,           -- LLM-inferred vs explicit
  confidence         REAL,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX card_geo_geom_idx ON card_geo USING GIST (geom);

-- Catalog of risk/projection layers we ingest.
CREATE TABLE risk_layers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,         -- 'edf_cvi_2024'
  name            TEXT NOT NULL,                -- 'EDF Climate Vulnerability Index 2024'
  source_url      TEXT,
  source_org      TEXT,                         -- 'EDF'
  license         TEXT,                         -- 'CC-BY-4.0'
  geometry_level  TEXT NOT NULL,                -- joins to admin_boundaries.level
  value_kind      TEXT NOT NULL,                -- 'index_0_1' | 'percentile' | 'count' | 'depth_in'
  unit            TEXT,
  scenario        TEXT,                         -- e.g., 'historical' | 'rcp45_2050'
  citation        TEXT,
  fetched_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE
);

-- Vector value table for tract-level layers (EDF CVI, etc.).
-- Raster layers (Atlas 14, GEE-derived) stored as COG + tileset references in Phase 2.
CREATE TABLE risk_layer_values (
  layer_id     UUID NOT NULL REFERENCES risk_layers(id) ON DELETE CASCADE,
  boundary_id  UUID NOT NULL REFERENCES admin_boundaries(id) ON DELETE CASCADE,
  value        DOUBLE PRECISION NOT NULL,
  category     TEXT,                            -- e.g., 'high', 'moderate', 'low'
  metadata     JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (layer_id, boundary_id)
);
CREATE INDEX risk_layer_values_layer_idx ON risk_layer_values (layer_id);

-- ─── Triad C: Departmental performance data ──────────────────────────────
-- Catalog of operational/performance layers from City departments. Sibling
-- of risk_layers; same geographic join model, different governance.
CREATE TABLE performance_layers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,        -- 'watershed_stormwater_incidents'
  name                TEXT NOT NULL,
  department          TEXT NOT NULL,               -- 'Watershed Protection', 'AFD', etc.
  data_kind           TEXT NOT NULL CHECK (data_kind IN (
                          'safety_rating',
                          'code_compliance',
                          'incident_history',
                          'asset_inventory',
                          'service_demand',
                          'demand_projection'
                      )),
  source_system       TEXT,                        -- 'open_data_portal' | 'internal_api' | 'csv_drop'
  source_url          TEXT,
  geometry_level      TEXT NOT NULL,               -- 'point' | 'tract' | 'service_area' | 'asset'
  unit                TEXT,
  refresh_cadence     TEXT,                        -- 'daily' | 'monthly' | 'annual' | 'on_demand'
  sensitivity         TEXT NOT NULL DEFAULT 'public'
                          CHECK (sensitivity IN ('public','internal','restricted')),
  citation            TEXT,
  fetched_at          TIMESTAMPTZ,
  is_active           BOOLEAN DEFAULT TRUE
);

-- Per-feature values (point-feature or boundary-aggregated). For very large
-- point datasets (e.g., 100K+ incident records), tile via Martin instead of
-- emitting full GeoJSON.
CREATE TABLE performance_layer_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id     UUID NOT NULL REFERENCES performance_layers(id) ON DELETE CASCADE,
  boundary_id  UUID REFERENCES admin_boundaries(id),    -- nullable: point-feature
  geom         geometry(Geometry, 4326),                 -- nullable: aggregate
  value        DOUBLE PRECISION,
  category     TEXT,
  occurred_at  TIMESTAMPTZ,                              -- for incident-style layers
  metadata     JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX performance_values_layer_idx ON performance_layer_values (layer_id);
CREATE INDEX performance_values_geom_idx  ON performance_layer_values USING GIST (geom);
CREATE INDEX performance_values_boundary_idx ON performance_layer_values (boundary_id) WHERE boundary_id IS NOT NULL;

-- RLS: 'public' performance_layers visible to all authenticated users;
-- 'internal' restricted to City staff role; 'restricted' to a named
-- access list. Risk layers default 'public'.
```

**Why PostGIS in the existing Supabase Postgres** (not a separate spatial service):

- One database, one auth, one RLS surface.
- Supabase Postgres supports the PostGIS extension out of the box.
- ArcGIS Enterprise can attach to this same Postgres later as an enterprise geodatabase — _no data migration required_ for the ESRI bridge.

### 5.2 Tile serving

**Phase 1 (vector data only):** No dedicated tile server. The frontend requests `risk_layer_values + admin_boundaries` for a layer + bounding box as GeoJSON via `/api/v1/geo/layers/{code}?bbox=...`. PostGIS does the spatial filter; payload sizes are small (Travis County has ~285 tracts).

**Phase 2 (rasters / large vectors):** Add **Martin** (Rust, by Maplibre maintainers) as a sidecar tile server reading directly from PostGIS. Martin emits MVT (Mapbox Vector Tiles), which MapLibre consumes natively. Alternatives considered:

| Option          | Verdict                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Martin**      | ✅ chosen for Phase 2. Read-only, fast, OCI image. Speaks OGC API – Tiles.                 |
| **pg_tileserv** | Solid alternative; Crunchy Data project. Either works.                                     |
| **GeoServer**   | Full WMS/WFS but heavier (Java) and slower path; defer unless we need full WMS publishing. |
| **Tegola**      | Older but proven; team has more experience with Martin.                                    |

**ESRI bridge (Phase 5):** ArcGIS Server publishes OGC-compliant tile endpoints. MapLibre adds a second tile source pointing at ArcGIS; existing layers continue to be served by Martin. Co-existence, not replacement.

### 5.3 Map renderer

**MapLibre GL JS** in the frontend. Reasons:

1. Open-source MIT/BSD license; safe for public sector.
2. Vector tiles, raster tiles, GeoJSON sources, 3D terrain — all in one library.
3. Active community; Martin and pg_tileserv both built around it.
4. ArcGIS interop documented (load ArcGIS REST FeatureService via `@arcgis/core` REST client → render as GeoJSON, or load ArcGIS Online vector tiles directly).

**Basemap** — start with **OpenStreetMap raster tiles via Carto's free tier or self-hosted**. ArcGIS Online basemap is added as an option behind a config flag once G2 is cleared.

### 5.4 Ingest pipeline

New `backend/app/services/geo_ingest_service.py` module. Each dataset has a small subclass declaring its source URL, format, geometry level, and value kind. The base class handles:

1. Fetch.
2. Validate (CRS check, geometry validity via `ST_IsValid`).
3. Stage to `risk_layers_staging`.
4. Upsert to `risk_layers` + `risk_layer_values`.

Run as a worker job (`backend/app/worker.py`) on a schedule and on-demand via admin endpoint. Supports re-ingestion (soft-delete + reload).

### 5.5 Card-to-geography linking

Three modes, in priority order:

1. **Explicit user link.** A user editing a card's _Geography_ tab picks one or more `admin_boundaries` rows.
2. **Source-derived link.** Discovery extracts `addresses[]` and `place_names[]` from articles via existing NER capacity (or a new `geocode_extractor.py` service); place names are matched to `admin_boundaries.name`. ZIP codes resolve to overlapping tracts.
3. **LLM inference.** As a last resort, an LLM is asked "which Austin admin boundary is this signal about" with the boundary list as context. Confidence is stored; low-confidence inferences require user confirmation.

Backed by `card_geo` table.

## 6. API Contracts

| Method | Path                                                   | Purpose                                                                                                         |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/geo/boundaries?level=tract&bbox=`             | Boundary geometries for the map view.                                                                           |
| `GET`  | `/api/v1/geo/layers`                                   | Catalog of risk layers (code, name, source, scenario).                                                          |
| `GET`  | `/api/v1/geo/layers/{code}?bbox=`                      | Layer values joined to boundary geometries (GeoJSON FeatureCollection).                                         |
| `GET`  | `/api/v1/geo/cards?bbox=&workstream_id=`               | Cards with geometry inside bbox, optionally filtered by workstream.                                             |
| `POST` | `/api/v1/cards/{id}/geo`                               | Set/update card geography.                                                                                      |
| `GET`  | `/api/v1/me/workstreams/{id}/geo-summary?layer_codes=` | Per-boundary aggregated summary: count of signals × layer values. Used for "where do signals and risk overlap?" |
| `POST` | `/api/v1/admin/geo/ingest/{layer_code}`                | Trigger an ingest job (admin only).                                                                             |

Tile endpoints (Phase 2 onward) follow OGC API – Tiles:

- `GET /tiles/v1/{layer_code}/{z}/{x}/{y}.mvt`
- Served by Martin sidecar; FastAPI proxies for auth if needed.

## 7. Frontend Design

| Area                                   | Change                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| New: `pages/MapView.tsx`               | Full-page map view scoped to a workstream. URL `/workstreams/:id/map`.                                           |
| New: `components/map/ForesightMap.tsx` | MapLibre wrapper. Props: bbox, layer codes, workstream id, on-feature-click.                                     |
| New: `components/map/LayerToggle.tsx`  | Sidebar listing available risk layers; toggles drive map sources.                                                |
| New: `components/map/SignalPin.tsx`    | Card pin rendering; cluster expansion at low zoom.                                                               |
| `pages/CardDetail.tsx`                 | New "Geography" tab: shows the card's primary boundary, risk values for that boundary, and a small embedded map. |
| `lib/geo-api.ts`                       | Typed wrappers for `/geo/*` endpoints.                                                                           |
| Dependencies                           | `maplibre-gl`, `@maplibre/maplibre-gl-style-spec`, `@turf/turf` (geometry helpers).                              |

## 8. ESRI Bridge — what changes when Gate G2 clears

This section documents what we do **the day enterprise GIS access is provisioned**. Nothing here is built before G2.

### 8.1 ArcGIS REST adapter

A new `backend/app/services/arcgis_adapter.py`:

- Reads layers from ArcGIS Online or ArcGIS Server FeatureServices via REST.
- Exposes them through the existing `risk_layers` catalog.
- Two sync modes: _snapshot_ (re-ingest values into our PostGIS) or _passthrough_ (proxy queries to ArcGIS at request time).
- Auth: stores credentials in our existing secrets store; supports OAuth or API keys per ESRI deployment.

### 8.2 ArcGIS Online vector tiles in MapLibre

A second vector-tile source on the map:

```ts
map.addSource("austin-arcgis", {
  type: "vector",
  tiles: [
    "https://services.arcgis.com/{ITEM_ID}/arcgis/rest/services/{LAYER}/VectorTileServer/tile/{z}/{y}/{x}.pbf",
  ],
  // styling resolved from ArcGIS-provided style JSON, transformed to MapLibre style spec
});
```

Our existing Martin tiles continue to render alongside.

### 8.3 PostGIS as ArcGIS Enterprise's enterprise geodatabase

If/when ArcGIS Enterprise is provisioned for the project, point ArcGIS Pro/Server at the same Supabase Postgres (or a dedicated read-replica). ArcGIS sees our `admin_boundaries`, `card_geo`, `risk_layers`, `risk_layer_values` as feature classes. Authoring in ArcGIS Pro becomes possible without changing Foresight's code path.

### 8.4 ArcGIS Online as a publishing target

Anything Ana wants to share _outside_ Foresight (e.g., a CMO-internal map embedded in an ArcGIS Hub site) we publish from PostGIS to ArcGIS Online via ArcGIS Pro. Foresight is the source of truth; ArcGIS Online is the publication channel.

### 8.5 Open ESRI partnership questions (for when access lands)

- ArcGIS Online tier: organizational or named-user licenses? Affects how many City staff can use the publishing surface.
- Publishing model: live link to PostGIS or scheduled snapshot?
- Branding: ESRI Story Maps as a delivery surface for the budget book _Looking Ahead_ page?
- Data sharing: are City of Austin proprietary layers (digital twin) shareable outside ArcGIS Online?
- ESRI support engagement: defined scope, hours, contacts.

## 9. Sprint Breakdown

### Sprint 0 — S4 (Jun 30 – Jul 11) — **Spike + ADR (gate G0 → G1)**

Not a build sprint. Outputs:

- [ ] Architecture Decision Records in `docs/adr/`:
  - `adr-001-postgis-vs-spatialite.md`
  - `adr-002-maplibre-vs-leaflet.md`
  - `adr-003-tile-server-choice.md`
  - `adr-004-esri-forward-compatibility.md`
- [ ] Dataset audit: confirm ingest feasibility for the top 3 candidate datasets (EDF CVI, Atlas 14, Austin digital twin wildfire).
- [ ] PostGIS-on-Supabase enablement test (extension toggle + a sample table + query).
- [ ] MapLibre + admin-boundary "hello world" prototype on a branch (not merged).
- [ ] Cost estimate: hosting, basemap usage, raster storage if Phase 2 lands.

**Effort:** 4 person-days plus stakeholder review.

### Sprint 1 — S5 (Jul 14 – Jul 25) — **Geospatial foundation (gate G1 cleared)**

- [ ] Migration: enable PostGIS, create `admin_boundaries`, `card_geo`, `risk_layers`, `risk_layer_values`.
- [ ] Ingest job: load Travis County census tracts (TIGER/Line) into `admin_boundaries`.
- [ ] Ingest job: load Austin council districts.
- [ ] FastAPI: `/geo/boundaries`, `/geo/layers` (catalog only), `/geo/cards` (returns empty if no `card_geo` rows).
- [ ] Frontend: `MapView` page rendering boundaries on MapLibre + basemap.
- [ ] Card geography tab: read-only display of `primary_boundary` if set.
- [ ] No external risk layers ingested yet.

**Acceptance:** Stakeholder opens _Place_ workstream, clicks "Map", sees Travis County tracts on a map with the workstream's existing card list as pins (where geometry is set).

**Effort:** ~8 person-days.

### Sprint 2 — S6 (Jul 28 – Aug 8) — **First climate dataset (EDF CVI)**

- [ ] Ingest service: subclass for EDF CVI. CSV → PostGIS join on tract GEOID.
- [ ] `/geo/layers/edf_cvi/...` endpoint.
- [ ] Frontend: `LayerToggle` component; choropleth rendering of CVI by tract.
- [ ] Card → boundary linking: explicit picker UI in card geography tab.
- [ ] Workstream geo-summary: count of cards per tract joined with CVI bucket.
- [ ] `/me/workstreams/{id}/geo-summary` endpoint.

**Acceptance:** A user sees Place-workstream signals on the map, toggles EDF CVI, and the choropleth reveals which tracts combine high vulnerability + active signals.

**Effort:** ~8 person-days.

### Sprint 3 — S7 (Aug 11 – Aug 22) — **Second dataset + risk scoring**

- [ ] Atlas 14 ingest path:
  - Phase A (vector): pre-rendered flood-zone polygons from City stormwater (preferred).
  - Phase B (raster): if no vector, ingest GeoTIFF → COG → MBTiles for tile serving.
- [ ] Decide: Martin sidecar deployed if Phase B is needed.
- [ ] Per-card _risk score_: derived field on `card_geo` aggregating layer values for the card's primary boundary.
- [ ] Filter UX: "Show cards in flood zone" toggle on workstream view.
- [ ] Performance pass: caching, payload size, basemap tile budget.

**Acceptance:** Place workstream cards can be filtered by flood-zone presence; risk scores show in card detail.

**Effort:** ~8 person-days, with risk depending on Atlas 14 vector availability.

### Sprint 4 — S8 (Aug 25 – Sep 5) — **Multi-layer composition + briefs**

- [ ] Layer composition: at least 2 layers visible at once (CVI choropleth + flood-zone outline).
- [ ] Card brief generator (`brief_service.py`) gains a "Geographic Context" section pulling `card_geo` + risk values.
- [ ] _Looking Ahead_ PDF (from `12_PRD_Budget_Book_Export.md`) gains an optional **map thumbnail** for the Place workstream row.
- [ ] Card → boundary auto-link via place-name extraction (NER on existing card text).
- [ ] LLM inference path with confidence threshold + user confirmation flow.

**Effort:** ~9 person-days.

### Sprint 5 — S9 (Sep 8 – Sep 19) — **ESRI bridge (conditional on G2)**

If G2 hasn't cleared, this sprint becomes a third open-source dataset (e.g., Texas A&M wildfire portal) and we re-schedule the ESRI bridge.

- [ ] `arcgis_adapter.py` (REST adapter, snapshot mode first).
- [ ] ArcGIS Online vector-tile source available behind a feature flag.
- [ ] Runbook: connect ArcGIS Pro to the project Postgres as enterprise geodatabase.
- [ ] At least one ESRI-served layer wired into Foresight as a `risk_layer`.
- [ ] Document share/publish path for ArcGIS Online.

**Acceptance:** With ESRI credentials in env, an admin can register an ArcGIS layer through the existing ingest pipeline; the layer is selectable in `LayerToggle`; ArcGIS Pro can read/write City of Austin Foresight feature classes.

**Effort:** ~7 person-days.

## 10. Cross-cutting Concerns

### 10.1 Performance / payload

- Travis County: ~285 tracts. Layer-value GeoJSON for the whole county is small (<1 MB).
- Council districts: 10. Trivial.
- Parcels (~400k): too big for GeoJSON; would require tile serving. Out of Phase 1 scope.
- Rasters (Atlas 14, GEE derivatives): require COG + tile serving; Phase 2.

### 10.2 Coordinate system

All storage in **EPSG:4326 (WGS 84)** for compatibility. Display projection on MapLibre is Web Mercator (3857). Texas State Plane Central is preserved in source where present and converted on ingest.

### 10.3 Security / RLS

- `admin_boundaries`, `risk_layers`, `risk_layer_values` are **public read** for authenticated users (no PII).
- `card_geo` follows the same RLS pattern as `cards` (workstream visibility).
- ArcGIS adapter credentials are stored in the existing secrets store, never returned to the client.

### 10.4 Cost & budget

- PostGIS is free (Supabase extension).
- MapLibre is free.
- Basemap tiles: budget for Carto basic free tier; if rate-limited, self-host an OSM tileset.
- Martin: containerized; minimal incremental hosting cost on Railway.
- Raster storage (Phase 2 only): S3-compatible; budgeted at <$10/mo for the first year.
- ESRI: cost is the City's ArcGIS Online org subscription, separate from Foresight infrastructure.

### 10.5 Telemetry

- Layer toggle events.
- Map-load latency.
- Geo-summary endpoint usage.
- Per-layer ingest run history (for "data freshness" UI in the layer catalog).

## 11. Risks

| Risk                                                             | Mitigation                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Source datasets change schemas                                   | Each ingest subclass owns parsing; failures isolated to that layer.                                                             |
| Atlas 14 vector data not available; raster path triggers earlier | Sprint 3 explicitly pre-decides vector vs raster route at sprint planning.                                                      |
| ESRI access slips well past S9                                   | Architecture is designed to ship without ESRI ever landing; S9 has a fallback (third open dataset).                             |
| Map UI degrades discovery UX for non-Place workstreams           | Map view is opt-in (a tab on the workstream, not the default).                                                                  |
| Card geography inference creates wrong joins                     | Inferred links require confirmation; confidence visible to user.                                                                |
| Supabase row count grows large for raster-derived value tables   | Raster never lives in the DB as values; only vector summaries (e.g., flood-zone polygons) do. Rasters live as files + tilesets. |
| Public-sector legal review of basemap terms                      | Self-host OSM tiles as fallback if Carto/Mapbox terms don't pass review.                                                        |

## 12. Architecture Decision Records (to author in S4)

- **ADR-001 — PostGIS in Supabase Postgres vs. separate spatial DB.** Choose Supabase Postgres + PostGIS extension; rationale: single auth surface, ESRI Enterprise compatibility.
- **ADR-002 — MapLibre GL JS vs. Leaflet.** Choose MapLibre; rationale: vector tiles, ESRI interop.
- **ADR-003 — Tile server: Martin vs. pg_tileserv vs. GeoServer.** Choose Martin if/when tiles are needed; rationale: lightweight, MapLibre-native.
- **ADR-004 — ESRI forward-compatibility strategy.** OGC standards, GeoJSON/GeoPackage formats, EPSG:4326 storage. Bridge via ArcGIS REST adapter and PostGIS-as-enterprise-GDB.
- **ADR-005 — Coordinate system canonicalization.** Store EPSG:4326; display 3857; convert on ingest.
- **ADR-006 — Card-to-geography linking strategy.** Explicit > source-derived > LLM-inferred (with confirmation).

## 13. Acceptance for the feature as a whole (end of S8)

1. The _Place_ workstream has a Map view with at least two open-source risk layers (EDF CVI + Atlas 14 / Austin wildfire) selectable as overlays.
2. Workstream signals can be filtered geographically ("inside flood zone", "high CVI tract").
3. Card briefs include a Geographic Context section.
4. The _Looking Ahead_ budget-book PDF can include a small Place-workstream risk thumbnail.
5. An ESRI-experienced reviewer concludes that bridging Foresight to ArcGIS Enterprise is configuration-level, not architectural rework.
6. Total feature spend stays inside the agreed-upon hosting budget.

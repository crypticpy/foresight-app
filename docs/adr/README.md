# Architecture Decision Records

Short, dated records of decisions that shape the system's architecture. Each ADR is one file. Once recorded, an ADR is not edited — it is superseded by a later ADR if the decision changes.

## Format

```
# ADR-NNN — Short title
Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by ADR-MMM
Authors:

## Context
What forces are in play, what constraints exist, what we already know.

## Decision
The choice we're making, in plain language.

## Consequences
What gets easier, what gets harder, what we now have to maintain.

## Alternatives considered
What else we looked at and why we did not choose it.
```

## Index

ADRs slated for authoring as part of the climate overlay feature. To be authored during Sprint 4 (S4 spike).

| #   | Title                                                                | Status  |
| --- | -------------------------------------------------------------------- | ------- |
| 001 | PostGIS in Supabase Postgres vs. separate spatial DB                 | Pending |
| 002 | MapLibre GL JS vs. Leaflet                                           | Pending |
| 003 | Tile server: Martin vs. pg_tileserv vs. GeoServer                    | Pending |
| 004 | ESRI forward-compatibility strategy                                  | Pending |
| 005 | Coordinate system canonicalization (EPSG:4326 storage, 3857 display) | Pending |
| 006 | Card-to-geography linking strategy                                   | Pending |

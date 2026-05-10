/**
 * CMO Top 25 Priorities: the 24 named initiatives the City Manager's
 * Office is tracking. Cards can map onto one or more priorities.
 *
 * @module data/taxonomy/top25
 */

import type { Top25Priority } from "./types";

export const top25Priorities: Top25Priority[] = [
  { id: "top25-01", title: "First ACME Strategic Plan", pillarCode: "EW" },
  {
    id: "top25-02",
    title: "Airline Use & Lease Agreement (Airport)",
    pillarCode: "MC",
  },
  { id: "top25-03", title: "Shared Services Implementation", pillarCode: "HG" },
  { id: "top25-04", title: "2026 Bond Program Development", pillarCode: "HG" },
  { id: "top25-05", title: "Climate Revolving Fund", pillarCode: "CH" },
  {
    id: "top25-06",
    title: "Expedited Site Plan Review Pilot",
    pillarCode: "HG",
  },
  {
    id: "top25-07",
    title: "Development Code/Criteria Streamlining",
    pillarCode: "HG",
  },
  { id: "top25-08", title: "Economic Development Roadmap", pillarCode: "EW" },
  { id: "top25-09", title: "AE Resiliency Plan", pillarCode: "MC" },
  { id: "top25-10", title: "Human Rights Framework", pillarCode: "HG" },
  {
    id: "top25-11",
    title: "Facility Condition Assessment Contract",
    pillarCode: "MC",
  },
  { id: "top25-12", title: "New Fire Labor Agreement", pillarCode: "PS" },
  { id: "top25-13", title: "Rapid Rehousing Program Model", pillarCode: "HH" },
  {
    id: "top25-14",
    title: "10-Year Housing Blueprint Update",
    pillarCode: "HH",
  },
  { id: "top25-15", title: "AHFC 5-Year Strategic Plan", pillarCode: "HH" },
  {
    id: "top25-16",
    title: "Phase 2 Compensation Recalibration",
    pillarCode: "HG",
  },
  {
    id: "top25-17",
    title: "Alternative Parks Funding Strategies",
    pillarCode: "CH",
  },
  { id: "top25-18", title: "Imagine Austin Update", pillarCode: "HG" },
  {
    id: "top25-19",
    title: "Comprehensive Crime Reduction Plan",
    pillarCode: "PS",
  },
  { id: "top25-20", title: "Police OCM Plan (BerryDunn)", pillarCode: "PS" },
  {
    id: "top25-21",
    title: "Light Rail Interlocal Agreement",
    pillarCode: "MC",
  },
  {
    id: "top25-22",
    title: "Citywide Technology Strategic Plan",
    pillarCode: "HG",
  },
  {
    id: "top25-23",
    title: "IT Organizational Alignment (Phase 1)",
    pillarCode: "HG",
  },
  {
    id: "top25-24",
    title: "Austin FIRST EMS Mental Health Pilot",
    pillarCode: "PS",
  },
];

export function getTop25ByPillar(pillarCode: string): Top25Priority[] {
  return top25Priorities.filter((p) => p.pillarCode === pillarCode);
}

export function getTop25ByTitle(title: string): Top25Priority | undefined {
  return top25Priorities.find((p) => p.title === title);
}

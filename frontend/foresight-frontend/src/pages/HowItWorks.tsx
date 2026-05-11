/**
 * HowItWorks page re-export.
 *
 * The 1.9K-line monolith was decomposed into `pages/HowItWorks/<feature>`
 * modules. This file preserves the public import surface so consumers
 * (currently App.tsx) keep using `from "./pages/HowItWorks"` unchanged.
 *
 * @module pages/HowItWorks
 */

export { default } from "./HowItWorks/index";

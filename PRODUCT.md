# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences share the stage equally:

- **People who want to adopt**: families and young adults in Joinville looking for adoption fairs, NGOs and campaigns near them. They browse the agenda, mostly on a phone.
- **People who need help with an animal**: residents dealing with castration, vaccination, a stray, or a cruelty report. They need to find who handles it, whether it is free, who qualifies and how to contact them, often in a hurry and on a phone.

## Product Purpose

An independent public-utility directory of animal-protection services, organizations and adoption events in Joinville, Santa Catarina. Success: a resident finds the right service or the next adoption fair, with a trustworthy source and a working contact, in a few taps.

## Positioning

Joinville only, every record traceable to a public source with a verification date. The agenda updates itself twice a day from Prefeitura news and weekly by the team from NGO and social-media posts. Not run by the Prefeitura or any single NGO.

## Operating Context

- Read-only website: no forms, accounts, panel or own cookies. Search and filters are GET forms that work without JavaScript.
- Pages: home, services (with filters), agenda (upcoming and archive), organizations, detail pages, about, privacy.
- Content comes from `data/seed.json` (weekly team update) and automatic collection (events labelled "Coletado automaticamente").
- Partner project linked: Castração Gratuita Joinville (https://castracaojoinville.pages.dev/).

## Capabilities and Constraints

- Cloudflare Pages (advanced mode Worker) + D1 on the free plan: 10 ms CPU per request, server-rendered HTML.
- Strict CSP: no inline styles or scripts, no third-party resources; fonts and images must be self-hosted.
- Portuguese (pt-BR) only.

## Brand Commitments

- Name: "Hub Animal Joinville".
- No real photos or logos available. All imagery is original (generated illustrations or SVG); never present an image as a real animal or event of a specific NGO.

## Evidence on Hand

- Real directory content in `data/seed.json` (11 services, 8 organizations, events). No testimonials, statistics or partner endorsements exist; do not fabricate them.

## Product Principles

1. Trust first: every fact shows its source and date.
2. Adoption and help share equal footing.
3. Fast on a cheap phone and a weak connection.
4. Never invent data, organizations or contacts.

## Accessibility & Inclusion

WCAG 2.2 AA (axe-core in CI on main routes), keyboard navigation, no horizontal overflow on mobile, works without JavaScript.

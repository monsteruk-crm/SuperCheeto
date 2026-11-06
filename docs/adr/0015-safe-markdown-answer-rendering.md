# ADR 0015: Safe Markdown Rendering for Streamed Answers

## Status
Accepted

## Context
Gateway answers arrive as Markdown text and are streamed into the four-panel workbench. Showing the raw source exposes formatting markers; injecting model text as HTML would allow untrusted generated content to become executable markup.

## Decision
Render answer text incrementally with `react-markdown` and `remark-gfm`. Keep raw HTML parsing disabled and use React's element tree for headings, lists, tables, links, quotes, emphasis and code.

## Alternatives considered
- Keep plain text: safe and simple, but Markdown syntax remains visible to users.
- Parse Markdown into HTML and insert it: flexible, but requires an HTML sanitizer and creates an injection surface.
- Implement a small local parser: avoids dependencies, but incomplete Markdown behavior risks incorrect code/list/table rendering.

## Consequences
The frontend has two production Markdown dependencies. Streaming reparses the accumulated text as it grows, so render batching remains a performance gate for M05. Remote Markdown images are displayed as image labels without fetching third-party content. Links use a separate browser tab; Electron routes HTTP(S) links to the external browser and denies renderer navigation/popups so the screenshot preload cannot be exposed by a generated link. Raw HTML stays text and unsafe link schemes are rejected by the renderer's URL transform. Markdown-to-DOM behavior is covered by the frontend harness; live synthetic Gateway output was rendered in the browser.

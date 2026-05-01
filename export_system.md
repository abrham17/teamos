# TeamOS — Export & Portability Module

TeamOS is committed to **Knowledge Sovereignty**. We believe that your team's knowledge belongs to you, and it should never be locked into a single platform. The Export Module ensures that your wiki is portable, standards-compliant, and verifiable.

---

## 1. The "Obsidian-Ready" Export

When you export your workspace, TeamOS generates a highly compatible `.zip` structure that can be imported directly into other tools like Obsidian, Logseq, or VS Code.

### Export Structure
*   **`/pages/*.md`**: All wiki pages exported as clean Markdown.
*   **YAML Frontmatter**: Every page includes a metadata header with tags, status, and custom fields, ensuring compatibility with the "Dataview" ecosystem.
*   **`[[wikilinks]]`**: Internal links are preserved in the standard `[[Page Title]]` format.

---

## 2. Relational Portability (`_graph.json`)

Unlike standard file-based wikis, TeamOS also exports the underlying **Knowledge Graph**.
*   **Topology Persistence**: The `_graph.json` file contains a full registry of all nodes and edges.
*   **Edge Metadata**: It includes relationship types (wikilink, semantic, citation) and AI confidence scores.
*   **Cross-Platform Graph**: This data can be used to reconstruct the graph in any Cytoscape or D3-compatible visualization tool.

---

## 3. Grounding Integrity (`/sources/`)

To support long-term verifiability, the export includes the **Raw Grounding Data**:
*   **Evidence Backup**: For every page that was ingested from an external source, the raw text is exported in the `sources/` directory.
*   **Linkage**: This allows you to trace any claim in your wiki back to the original source text even without a TeamOS subscription.

---

## 4. Technical Implementation

*   **Format**: ZIP archive with Deflate compression.
*   **Generation**: On-the-fly streaming for small teams; background Celery task for large enterprises.
*   **Security**: Exporting requires `Owner` or `Editor` roles; every export event is logged in the Audit Trail.

### Code Reference
*   [Export View](file:///home/abrhame/projects/mem2/teamos/backend/export_app/views.py) — The ZIP generation logic.
*   [Wiki Model](file:///home/abrhame/projects/mem2/teamos/backend/wiki/models.py) — The source of truth for content and frontmatter.

---

## 5. Future Roadmap
*   **PDF/HTML Export**: Generating professional, branded PDF reports from wiki sections.
*   **S3/Dropbox Sync**: Automated nightly backups of the knowledge base to your team's own cloud storage.
*   **Inter-Wiki Import**: A "Merge" tool to import an export from one TeamOS instance into another while resolving conflicts.

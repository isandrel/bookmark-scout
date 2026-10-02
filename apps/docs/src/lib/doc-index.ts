import type * as PageTree from "fumadocs-core/page-tree";
import { source } from "@/lib/source";

export type DocEntry = {
  /** Sidebar section, from the `---Name---` separators in meta.json. */
  section: string;
  title: string;
  description: string;
  url: string;
};

/** Every page in sidebar order, labelled with its section. */
export function getDocEntries(): DocEntry[] {
  const entries: DocEntry[] = [];
  let section = "";

  const visit = (nodes: PageTree.Node[]) => {
    for (const node of nodes) {
      if (node.type === "separator") {
        section = typeof node.name === "string" ? node.name : section;
      } else if (node.type === "folder") {
        visit(node.index ? [node.index, ...node.children] : node.children);
      } else {
        const page = source.getNodePage(node);
        if (!page) continue;
        entries.push({
          section,
          title: page.data.title,
          description: page.data.description ?? "",
          url: page.url,
        });
      }
    }
  };

  visit(source.pageTree.children);
  return entries;
}

/// <reference types="bun" />
import { expect, test } from "bun:test";
import { type DemoFolder, findDemoFolderMatches } from "./folder-match";

const folders: DemoFolder[] = [
    { id: "ai", name: "AI", parents: [] },
    { id: "llms", name: "LLMs", parents: ["AI"] },
    { id: "fine-tuning", name: "Fine-tuning", parents: ["AI", "LLMs"] },
    { id: "agents", name: "Agents", parents: ["AI"] },
    { id: "papers", name: "Papers", parents: ["AI"] },
    { id: "dev", name: "Dev", parents: [] },
    { id: "rust", name: "Rust", parents: ["Dev"] },
    { id: "reading-list", name: "Reading list", parents: [] },
];
const names = (query: string, recentIds?: string[]) =>
    findDemoFolderMatches(folders, query, { limit: 5, recentIds }).map((match) => match.folder.name);

test("ranks a name that starts with the word above one that contains it", () => {
    expect(names("a")).toEqual(["AI", "Agents", "Reading list", "Papers"]);
});

test("matches a path against parent folders", () => {
    expect(names("ai/llms")).toEqual(["LLMs"]);
    expect(names("llms fine")).toEqual(["Fine-tuning"]);
});

test("allows one typo in longer words only", () => {
    expect(names("agnets")).toEqual(["Agents"]);
    expect(names("rsut")).toEqual(["Rust"]);
    expect(names("rsu")).toEqual([]);
});

test("ranks a recently used folder first among equal matches", () => {
    expect(names("a", ["agents"])[0]).toBe("Agents");
});

test("highlights the matched part of the name", () => {
    expect(findDemoFolderMatches(folders, "list", { limit: 5 })[0].range).toEqual([8, 12]);
});

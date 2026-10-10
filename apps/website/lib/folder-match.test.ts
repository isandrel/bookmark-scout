/// <reference types="bun" />
import { expect, test } from "bun:test";
import { type DemoFolder, findDemoFolderMatches } from "./folder-match";

const folders: DemoFolder[] = [
    { id: "dev", name: "Dev Docs", parents: [] },
    { id: "react", name: "React", parents: ["Dev Docs"] },
    { id: "recipes", name: "Recipes", parents: [] },
    { id: "research", name: "Research", parents: [] },
    { id: "travel", name: "Travel", parents: [] },
    { id: "japan", name: "Japan", parents: ["Travel"] },
    { id: "kyoto", name: "Kyoto", parents: ["Travel", "Japan"] },
];
const names = (query: string, recentIds?: string[]) =>
    findDemoFolderMatches(folders, query, { limit: 5, recentIds }).map((match) => match.folder.name);

test("ranks a name that starts with the word above one that contains it", () => {
    expect(names("re")).toEqual(["Recipes", "Research", "React"]);
});

test("matches a path against parent folders", () => {
    expect(names("travel/japan")).toEqual(["Japan"]);
    expect(names("japan kyoto")).toEqual(["Kyoto"]);
});

test("allows one typo in longer words only", () => {
    expect(names("reserch")).toEqual(["Research"]);
    expect(names("rect")).toEqual(["React"]);
    expect(names("kyt")).toEqual([]);
});

test("ranks a recently used folder first among equal matches", () => {
    expect(names("re", ["research"])[0]).toBe("Research");
});

test("highlights the matched part of the name", () => {
    expect(findDemoFolderMatches(folders, "doc", { limit: 5 })[0].range).toEqual([4, 7]);
});

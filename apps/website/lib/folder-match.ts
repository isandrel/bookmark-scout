/**
 * Folder matching for the hero save demo: a compact copy of the extension's rules in
 * apps/extension/src/lib/folder-match.ts, so the demo ranks folders the way the extension does.
 * The last word matches the folder's own name, earlier words match it or a parent (`travel/japan`),
 * and a word of `FUZZY_MIN_LENGTH` letters or more may be one typo away from a word in the name.
 * Recently used folders rank higher.
 */

const FUZZY_MIN_LENGTH = 4;
const RECENT_BONUS = 30;
const WORD_SEPARATOR = /[\s/\\>›»]+/u;
const NAME_WORD = /[\p{L}\p{N}]+/gu;
const MATCH_SCORE = { exact: 100, prefix: 80, wordPrefix: 60, substring: 40, typo: 20, none: 0 };

export type DemoFolder = { id: string; name: string; parents: readonly string[] };

export type DemoFolderMatch = {
    folder: DemoFolder;
    /** Where the last search word appears in the folder name, for highlighting. */
    range: [number, number] | null;
    score: number;
};

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase();

/** Damerau-Levenshtein distance, capped: lengths more than 2 apart return 3. */
function editDistance(a: string, b: string): number {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
            }
        }
    }
    return rows[a.length][b.length];
}

function scoreWord(word: string, name: string): number {
    if (name === word) return MATCH_SCORE.exact;
    if (name.startsWith(word)) return MATCH_SCORE.prefix;
    const index = name.indexOf(word);
    if (index > 0) return /[\p{L}\p{N}]/u.test(name[index - 1]) ? MATCH_SCORE.substring : MATCH_SCORE.wordPrefix;
    if (word.length < FUZZY_MIN_LENGTH) return MATCH_SCORE.none;
    for (const [nameWord] of name.matchAll(NAME_WORD)) {
        if (editDistance(word, nameWord) <= 1) return MATCH_SCORE.typo;
    }
    return MATCH_SCORE.none;
}

/** The folders that best match `query`, ranked; `recentIds` lists recently used folders, newest first. */
export function findDemoFolderMatches(
    folders: readonly DemoFolder[],
    query: string,
    { limit, recentIds = [] }: { limit: number; recentIds?: readonly string[] },
): DemoFolderMatch[] {
    const words = normalize(query).split(WORD_SEPARATOR).filter(Boolean);
    const lastWord = words.at(-1);
    if (!lastWord) return [];
    const earlierWords = words.slice(0, -1);

    const matches: DemoFolderMatch[] = [];
    for (const folder of folders) {
        const name = normalize(folder.name);
        const nameScore = scoreWord(lastWord, name);
        if (nameScore === MATCH_SCORE.none) continue;
        const names = [...folder.parents.map(normalize), name];
        if (!earlierWords.every((word) => names.some((candidate) => scoreWord(word, candidate) > 0))) continue;
        const recentRank = recentIds.indexOf(folder.id);
        const recentScore = recentRank === -1 ? 0 : RECENT_BONUS * (1 - recentRank / recentIds.length);
        const index = name.length === folder.name.length ? name.indexOf(lastWord) : -1;
        matches.push({
            folder,
            range: index === -1 ? null : [index, index + lastWord.length],
            score: nameScore + recentScore,
        });
    }
    return matches
        .sort(
            (a, b) =>
                b.score - a.score ||
                a.folder.parents.length - b.folder.parents.length ||
                a.folder.name.localeCompare(b.folder.name),
        )
        .slice(0, limit);
}

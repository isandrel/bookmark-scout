#!/usr/bin/env bun
/**
 * Read pages the agent's own web tools cannot reach (Reddit blocks them) through the user's
 * running Chrome, over the DevTools protocol, with the user's permission. One WebSocket
 * connection, one background tab, closed at the end; the user's tabs are never touched.
 *
 * Usage:
 *   bun read-pages-cdp.ts <urls.json> <out.json> [--user-data-dir <dir>] [--reddit]
 *                         [--timeout-s 30] [--min-chars 200] [--pause-ms 1500]
 *
 *   urls.json   a JSON array of addresses; for Reddit use old.reddit.com and its .json endpoints,
 *               such as https://old.reddit.com/search.json?q=<terms>&limit=25 or a thread's
 *               https://old.reddit.com/r/<sub>/comments/<id>/.json
 *   out.json    { url: page text } for every address
 *   --reddit    also print each thread's post and top comments, or each search's result list
 *
 *   bun read-pages-cdp.ts --from <out.json> --reddit   prints a saved run again, without a browser
 *
 * The user turns on remote debugging first (chrome://inspect/#remote-debugging in current
 * Chrome, or a start with --remote-debugging-port). Chrome then writes DevToolsActivePort
 * (port, then the browser's WebSocket path) into its user data folder, read here; the default
 * folder per platform is below, and --user-data-dir or CHROME_USER_DATA_DIR overrides it.
 * Chrome asks the user to allow each new connection, which is why this opens exactly one.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

type Reply = { id?: number; result?: Record<string, unknown>; error?: { message: string } };

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const numberOption = (name: string, fallback: number): number => {
  const value = Number(option(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a number`);
  return value;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const [urlsFile, outFile] = positional;
const from = option('--from');
if (!from && (!urlsFile || !outFile)) {
  console.error(
    'usage: bun read-pages-cdp.ts <urls.json> <out.json> [--user-data-dir <dir>] [--reddit]',
  );
  process.exit(64);
}
const readInBrowser = async (
  urlsFile: string,
  outFile: string,
): Promise<Record<string, string>> => {
  const timeoutS = numberOption('--timeout-s', 30);
  const minChars = numberOption('--min-chars', 200);
  const pauseMs = numberOption('--pause-ms', 1500);

  const defaultUserDataDir = (): string => {
    if (process.platform === 'darwin')
      return join(homedir(), 'Library/Application Support/Google/Chrome');
    if (process.platform === 'win32')
      return join(
        process.env.LOCALAPPDATA ?? join(homedir(), 'AppData/Local'),
        'Google/Chrome/User Data',
      );
    return join(homedir(), '.config/google-chrome');
  };
  const userDataDir =
    option('--user-data-dir') ?? process.env.CHROME_USER_DATA_DIR ?? defaultUserDataDir();
  const portFile = join(userDataDir, 'DevToolsActivePort');
  if (!existsSync(portFile)) {
    console.error(`${portFile} is missing: remote debugging is off in that browser.`);
    process.exit(1);
  }
  const [portLine, pathLine] = readFileSync(portFile, 'utf8').split('\n');
  const port = Number.parseInt(portLine ?? '', 10);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !pathLine?.startsWith('/devtools/browser/')
  ) {
    console.error(`${portFile} does not hold a port and a browser path.`);
    process.exit(1);
  }

  const urls: unknown = JSON.parse(readFileSync(urlsFile, 'utf8'));
  if (!Array.isArray(urls) || !urls.every((u) => typeof u === 'string' && /^https:\/\//.test(u))) {
    throw new Error(`${urlsFile} must be a JSON array of https addresses`);
  }

  const ws = new WebSocket(`ws://127.0.0.1:${port}${pathLine.trim()}`);
  let nextId = 0;
  const pending = new Map<number, (reply: Reply) => void>();
  ws.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)) as Reply;
    if (reply.id !== undefined) pending.get(reply.id)?.(reply);
    if (reply.id !== undefined) pending.delete(reply.id);
  };
  const send = (method: string, params: object = {}, sessionId?: string): Promise<Reply> =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const field = (reply: Reply, name: string): string => {
    const value = reply.result?.[name];
    if (typeof value !== 'string') throw new Error(reply.error?.message ?? `no ${name} in reply`);
    return value;
  };

  console.error('Waiting for the browser to allow the connection (ask the user to click Allow)...');
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('the browser refused or dropped the connection'));
  });
  const targetId = field(
    await send('Target.createTarget', { url: 'about:blank', background: true }),
    'targetId',
  );
  const sessionId = field(
    await send('Target.attachToTarget', { targetId, flatten: true }),
    'sessionId',
  );

  const pages: Record<string, string> = {};
  for (const url of urls as string[]) {
    await send('Page.navigate', { url }, sessionId);
    let text = '';
    for (let waited = 0; waited < timeoutS && !text; waited++) {
      await Bun.sleep(1000);
      const reply = await send(
        'Runtime.evaluate',
        {
          expression:
            'document.readyState === "complete" && document.body ? document.body.innerText : ""',
          returnByValue: true,
        },
        sessionId,
      );
      const value = (reply.result?.result as { value?: unknown } | undefined)?.value;
      if (typeof value === 'string' && value.length >= minChars) text = value;
    }
    pages[url] = text;
    console.error(`${text.length}\t${url}`);
    await Bun.sleep(pauseMs);
  }
  await send('Target.closeTarget', { targetId });
  ws.close();
  writeFileSync(outFile, JSON.stringify(pages, null, 2));
  return pages;
};

const pages: Record<string, string> = from
  ? (JSON.parse(readFileSync(from, 'utf8')) as Record<string, string>)
  : await readInBrowser(urlsFile as string, outFile as string);

if (args.includes('--reddit')) {
  type Thing = { kind?: string; data?: Record<string, unknown> };
  type Listing = { data?: { children?: Thing[] } };
  const str = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ') : '';
  // A JSON-viewer extension can wrap the JSON or append text after it: keep the outermost value.
  const parse = (text: string): unknown => {
    const start = text.search(/[[{]/);
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    return JSON.parse(text.slice(start, end + 1));
  };
  const comments = (things: Thing[] = [], depth = 0, out: string[] = []): string[] => {
    for (const thing of things) {
      if (thing.kind !== 't1' || !thing.data) continue;
      out.push(
        `${'  '.repeat(depth)}[${String(thing.data.score)}] ${str(thing.data.body).slice(0, 400)}`,
      );
      const replies = thing.data.replies as Listing | '' | undefined;
      if (replies) comments(replies.data?.children, depth + 1, out);
    }
    return out;
  };
  for (const [url, text] of Object.entries(pages)) {
    let json: unknown;
    try {
      json = parse(text);
    } catch {
      console.log(`\n## ${url}\n(not JSON: ${text.length} characters of page text)`);
      continue;
    }
    if (Array.isArray(json)) {
      const post = (json[0] as Listing).data?.children?.[0]?.data ?? {};
      console.log(
        `\n## ${str(post.title)} (r/${str(post.subreddit)}, ${String(post.score)}) ${url}`,
      );
      console.log(`POST: ${str(post.selftext).slice(0, 800)}`);
      console.log(
        comments((json[1] as Listing).data?.children)
          .slice(0, 15)
          .join('\n'),
      );
    } else {
      console.log(`\n## ${url}`);
      for (const { data } of (json as Listing).data?.children ?? []) {
        if (data)
          console.log(
            `- [${String(data.score)}] ${str(data.title)} https://old.reddit.com${str(data.permalink)}.json`,
          );
      }
    }
  }
}
process.exit(0);

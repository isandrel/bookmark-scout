/** FAQ entries in display order. Each id has `q` and `a` under `home.faq.items.<id>`. */
export const FAQ_ITEMS = [
    "data",
    "needAi",
    "providers",
    "changes",
    "firefox",
    "stores",
    "free",
    "help",
] as const;

export type FaqItemId = (typeof FAQ_ITEMS)[number];

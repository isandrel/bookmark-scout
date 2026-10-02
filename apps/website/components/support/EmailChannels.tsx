import { proseTags } from "@/components/longform/rich-text";
import { SUPPORT_CHANNELS, supportLinks } from "@/lib/content/support-topics";
import { getTranslations } from "next-intl/server";

/** Role mailboxes: what each address is for. */
export async function EmailChannels({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.email.channels" });
    const tags = proseTags({ links: supportLinks(locale) });

    return (
        <dl className="max-w-[68ch] divide-y divide-line border-y border-line">
            {SUPPORT_CHANNELS.map((channel) => (
                <div key={channel.id} className="py-5">
                    <dt className="font-semibold">{t(`${channel.id}.title`)}</dt>
                    <dd className="mt-1.5">
                        <a
                            href={`mailto:${channel.email}`}
                            className="break-all font-mono text-[0.95rem] text-teal underline decoration-teal/40 underline-offset-4 hover:decoration-teal"
                        >
                            {channel.email}
                        </a>
                    </dd>
                    <dd className="mt-2 leading-[1.7] text-ink-soft">{t.rich(`${channel.id}.body`, tags)}</dd>
                </div>
            ))}
        </dl>
    );
}

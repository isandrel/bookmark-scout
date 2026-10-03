import { proseTags } from "@/components/longform/rich-text";
import { CONTACT_ROLES, supportLinks } from "@/lib/content/support-topics";
import { site } from "@bookmark-scout/config";
import { getTranslations } from "next-intl/server";

/** Role mailboxes: what each address is for. */
export async function EmailChannels({ locale }: { locale: string }) {
    const t = await getTranslations({ locale, namespace: "supportPage.sections.email.channels" });
    const tags = proseTags({ links: supportLinks(locale) });

    return (
        <dl className="max-w-[68ch] divide-y divide-line border-y border-line">
            {CONTACT_ROLES.map((role) => (
                <div key={role} className="py-5">
                    <dt className="font-semibold">{t(`${role}.title`)}</dt>
                    <dd className="mt-1.5">
                        <a
                            href={site.contact.mailto(role)}
                            className="break-all font-mono text-[0.95rem] text-teal underline decoration-teal/40 underline-offset-4 hover:decoration-teal"
                        >
                            {site.contact.address(role)}
                        </a>
                    </dd>
                    <dd className="mt-2 leading-[1.7] text-ink-soft">{t.rich(`${role}.body`, tags)}</dd>
                </div>
            ))}
        </dl>
    );
}

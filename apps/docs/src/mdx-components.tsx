import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import type { ComponentType } from "react";
import { StartHere } from "@/components/home/start-here";
import {
  Contact,
  License,
  PrivacyEffectiveDate,
  ReleaseLink,
  RepoLink,
  SiteLink,
  StoreAvailability,
  StoreListing,
} from "@/components/mdx/links";
import { Screenshot } from "@/components/mdx/screenshot";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Step,
    Steps,
    Tab,
    Tabs,
    Contact,
    License,
    PrivacyEffectiveDate,
    ReleaseLink,
    RepoLink,
    Screenshot,
    SiteLink,
    StartHere,
    StoreAvailability,
    StoreListing,
    ...components,
  };
}

/** `Component` with its `locale` prop fixed, so MDX never has to pass it. */
function withLocale<Props extends { locale?: string }>(
  Component: ComponentType<Props>,
  locale: string,
) {
  return function Localized(props: Omit<Props, "locale">) {
    return <Component {...(props as Props)} locale={locale} />;
  };
}

/**
 * The MDX components that write text or link to the website, bound to the page's language.
 * A new component with a `locale` prop goes here as well as in `getMDXComponents`.
 */
export function localizedMdxComponents(locale: string): MDXComponents {
  return {
    PrivacyEffectiveDate: withLocale(PrivacyEffectiveDate, locale),
    ReleaseLink: withLocale(ReleaseLink, locale),
    Screenshot: withLocale(Screenshot, locale),
    SiteLink: withLocale(SiteLink, locale),
    StartHere: withLocale(StartHere, locale),
    StoreAvailability: withLocale(StoreAvailability, locale),
    StoreListing: withLocale(StoreListing, locale),
  };
}

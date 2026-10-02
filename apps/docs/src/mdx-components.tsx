import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
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

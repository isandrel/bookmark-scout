#!/usr/bin/env bun
/**
 * Generate README.md files from templates
 *
 * Reads config/site.config.toml and replaces placeholders in templates/ files
 * to generate the final README.md files.
 *
 * Usage: bun run scripts/generate-readme.ts
 */

import { parse } from "smol-toml";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

// Read config
const configPath = resolve(rootDir, "config/site.config.toml");
const tomlContent = readFileSync(configPath, "utf-8");

interface SiteConfig {
    site: { name: string; url: string; description: string };
    author: { name: string; url: string };
    github: { url: string };
    locales: { supported: string[]; default: string };
}

const config = parse(tomlContent) as unknown as SiteConfig;

// Define placeholder mappings
const placeholders: Record<string, string> = {
    "{{SITE_NAME}}": config.site.name,
    "{{SITE_URL}}": config.site.url,
    "{{SITE_DESCRIPTION}}": config.site.description,
    "{{AUTHOR_NAME}}": config.author.name,
    "{{AUTHOR_URL}}": config.author.url,
    "{{GITHUB_URL}}": config.github.url,
    // Derived values
    "{{GITHUB_REPO}}": config.github.url.replace("https://github.com/", ""),
};

/**
 * Replace all placeholders in content
 */
function replacePlaceholders(content: string): string {
    let result = content;
    for (const [placeholder, value] of Object.entries(placeholders)) {
        result = result.replaceAll(placeholder, value);
    }
    return result;
}

/**
 * Process a template file and generate the output file
 */
function processTemplate(templatePath: string, outputPath: string): void {
    console.log(`Processing: ${templatePath} -> ${outputPath}`);
    const template = readFileSync(templatePath, "utf-8");
    const output = replacePlaceholders(template);
    writeFileSync(outputPath, output, "utf-8");
    console.log(`  ✓ Generated ${outputPath}`);
}

// Process all templates in templates/ folder
const templatesDir = resolve(rootDir, "templates");
const translationsDir = resolve(rootDir, "translations");

try {
    const files = readdirSync(templatesDir);
    for (const file of files) {
        if (file.endsWith(".md")) {
            const templatePath = resolve(templatesDir, file);

            // Determine output path
            let outputPath: string;
            if (file === "README.md") {
                // Main README goes to root
                outputPath = resolve(rootDir, "README.md");
            } else if (file.startsWith("README.") && file.endsWith(".md")) {
                // Translated READMEs go to translations/
                outputPath = resolve(translationsDir, file);
            } else {
                // Other templates go to root
                outputPath = resolve(rootDir, file);
            }

            processTemplate(templatePath, outputPath);
        }
    }
} catch (error) {
    console.error("Error processing templates:", error);
    process.exit(1);
}

console.log("\n✅ README generation complete!");

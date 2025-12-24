"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { routing, type Locale } from "@/i18n/routing";

const localeNames: Record<Locale, string> = {
    en: "🇺🇸 English",
    ja: "🇯🇵 日本語",
    ko: "🇰🇷 한국어",
};

export function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Get the path without the locale prefix
    const getPathWithoutLocale = () => {
        const segments = pathname.split("/");
        const pathWithoutLocale = segments.slice(2).join("/");
        return pathWithoutLocale ? `/${pathWithoutLocale}` : "";
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-white/10 transition-colors"
                aria-expanded={isOpen}
                aria-haspopup="true"
            >
                <span className="text-base">🌐</span>
                <span>{localeNames[currentLocale as Locale]}</span>
                <svg
                    className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl bg-card border border-card-border shadow-lg overflow-hidden z-50">
                    {routing.locales.map((locale) => {
                        const isActive = locale === currentLocale;
                        const newPath = `/${locale}${getPathWithoutLocale()}`;

                        return (
                            <Link
                                key={locale}
                                href={newPath}
                                onClick={() => setIsOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${isActive
                                    ? "bg-white/10 text-foreground"
                                    : "text-muted hover:text-foreground hover:bg-white/5"
                                    }`}
                            >
                                {isActive && (
                                    <svg className="w-4 h-4 text-primary-light" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                )}
                                {!isActive && <span className="w-4" />}
                                {localeNames[locale]}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

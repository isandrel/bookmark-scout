/** Static export has no server redirects; React 19 hoists this `<meta>` into `<head>`. */
export function MetaRedirect({ to, label }: { to: string; label: string }) {
    return (
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
            <meta httpEquiv="refresh" content={`0; url=${to}`} />
            <a href={to} className="font-display text-2xl font-bold text-teal underline-offset-4 hover:underline">
                {label}
            </a>
        </div>
    );
}

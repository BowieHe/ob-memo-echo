export function extractWikilinkConcepts(content: string): string[] {
    const concepts = new Set<string>();
    const regex = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        const raw = match[1].trim();
        if (!raw) continue;

        const withoutAlias = raw.split('|')[0].trim();
        if (!withoutAlias) continue;

        const withoutHeading = withoutAlias.split('#')[0].trim();
        if (!withoutHeading) continue;

        const parts = withoutHeading.split('/').filter((part) => part.length > 0);
        const concept = parts.length > 0 ? parts[parts.length - 1] : withoutHeading;

        if (concept) {
            concepts.add(concept);
        }
    }

    return Array.from(concepts);
}

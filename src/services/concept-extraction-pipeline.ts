import type { App, TFile } from 'obsidian';
import type { ConceptExtractionSettings, ConceptExtractionResult, ConfirmedConcept, ExtractedConceptWithMatch } from '@core/types/concept';
import { ConceptMatcher } from './concept-matcher';
import { NoteTypeDetector } from './note-type-detector';
import { ConceptDictionaryStore } from './concept-dictionary-store';
import { ConceptExtractor } from './concept-extractor';
import { FrontmatterService } from './frontmatter-service';
import { ConceptRegistry } from './concept-registry';

export class ConceptExtractionPipeline {
    private app: App;
    private extractor: ConceptExtractor;
    private frontmatterService: FrontmatterService;
    private settings: ConceptExtractionSettings;
    private detector: NoteTypeDetector;
    private dictionaryStore: ConceptDictionaryStore;
    private conceptRegistry?: ConceptRegistry; // v0.7.0+: Optional concept registry for deduplication

    constructor(
        app: App,
        extractor: ConceptExtractor,
        frontmatterService: FrontmatterService,
        settings: ConceptExtractionSettings,
        conceptRegistry?: ConceptRegistry // v0.7.0+: Optional parameter
    ) {
        this.app = app;
        this.extractor = extractor;
        this.frontmatterService = frontmatterService;
        this.settings = settings;
        this.detector = new NoteTypeDetector(settings.skipRules);
        this.dictionaryStore = new ConceptDictionaryStore(app, settings.skipRules.conceptDictionaryPath);
        this.conceptRegistry = conceptRegistry;
    }

    updateSettings(settings: ConceptExtractionSettings): void {
        this.settings = settings;
        this.detector = new NoteTypeDetector(settings.skipRules);
        this.dictionaryStore = new ConceptDictionaryStore(this.app, settings.skipRules.conceptDictionaryPath);
    }

    /**
     * v0.7.0+: Update or set the concept registry
     */
    setConceptRegistry(registry: ConceptRegistry | undefined): void {
        this.conceptRegistry = registry;
    }

    async extract(note: { path: string; title: string; content: string; tags?: string[] }): Promise<ConceptExtractionResult> {
        if (!this.settings.enableConceptExtraction) {
            return { skipped: true, reason: 'Concept extraction disabled' };
        }

        const detection = this.detector.detect({ path: note.path, content: note.content, tags: note.tags });
        console.debug('Note type detection', {
            noteType: detection.type,
            shouldSkip: detection.shouldSkip,
            reason: detection.reason,
        });
        if (detection.shouldSkip) {
            return { skipped: true, reason: detection.reason, noteType: detection.type };
        }

        const dictionary = await this.dictionaryStore.load();
        console.debug('Loaded concept dictionary', {
            conceptCount: Object.keys(dictionary.concepts).length,
        });
        const matcher = new ConceptMatcher(dictionary);
        const maxConcepts = this.getMaxConceptsForLength(this.getTextLength(note.content));
        console.debug('Concept extraction parameters', { maxConcepts });

        const detailed = await this.extractor.extractDetailed(note.content, note.title, {
            existingConcepts: Object.keys(dictionary.concepts),
            maxConcepts,
        });

        console.debug('Detailed concept extraction result', {
            conceptCount: detailed.concepts.length,
            noteType: detailed.noteType,
            skipReason: detailed.skipReason,
        });

        if (detailed.skipReason) {
            return { skipped: true, reason: detailed.skipReason, noteType: detailed.noteType };
        }

        // v0.7.0+: Use ConceptRegistry for deduplication if available
        if (this.conceptRegistry) {
            const concepts: ExtractedConceptWithMatch[] = [];
            for (const extracted of detailed.concepts) {
                // Use registry to match or create concept
                const matchResult = await this.conceptRegistry.registerOrMatch(
                    extracted.name,
                    extracted.reason
                );

                concepts.push({
                    name: matchResult.concept, // Use matched concept name
                    confidence: extracted.confidence,
                    reason: extracted.reason,
                    matchInfo: {
                        originalTerm: extracted.name,
                        matchedConcept: matchResult.concept,
                        matchType: matchResult.isNew ? 'new' : 'alias',
                        confidence: matchResult.similarity,
                    },
                });
            }
            return {
                skipped: false,
                concepts,
                noteType: detailed.noteType,
            };
        }

        // Fallback: Use original logic without registry
        const concepts: ExtractedConceptWithMatch[] = detailed.concepts.map((concept) => ({
            name: concept.name,
            confidence: concept.confidence,
            reason: concept.reason,
            matchInfo: matcher.match(concept.name),
        }));

        return {
            skipped: false,
            concepts,
            noteType: detailed.noteType,
        };
    }

    async apply(file: TFile, confirmedConcepts: ConfirmedConcept[]): Promise<void> {
        if (confirmedConcepts.length === 0) {
            return;
        }

        if (this.settings.injectToFrontmatter) {
            await this.frontmatterService.updateAfterIndexing(
                file,
                confirmedConcepts.map((concept) => concept.name)
            );
        }

        if (this.settings.autoCreateConceptPage) {
            await this.createConceptPages(confirmedConcepts.filter((concept) => concept.isNew && concept.createPage));
        }

        await this.updateDictionary(confirmedConcepts);
    }

    private async updateDictionary(confirmedConcepts: ConfirmedConcept[]): Promise<void> {
        const dictionary = await this.dictionaryStore.load();
        const now = new Date().toISOString();

        for (const concept of confirmedConcepts) {
            const existing = dictionary.concepts[concept.name];
            if (!existing) {
                dictionary.concepts[concept.name] = {
                    aliases: concept.aliases || [],
                    createdAt: now,
                    noteCount: 1,
                };
            } else {
                existing.noteCount += 1;
                if (concept.aliases && concept.aliases.length > 0) {
                    const merged = new Set([...existing.aliases, ...concept.aliases]);
                    existing.aliases = Array.from(merged);
                }
            }
        }

        dictionary.lastUpdated = now;
        await this.dictionaryStore.save(dictionary);
    }

    private async createConceptPages(concepts: ConfirmedConcept[]): Promise<void> {
        if (concepts.length === 0) {
            return;
        }

        const folderPath = this.settings.conceptPagePrefix;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }

        for (const concept of concepts) {
            const pagePath = `${folderPath}/${concept.name}.md`;
            const existing = this.app.vault.getAbstractFileByPath(pagePath);
            if (!existing) {
                await this.app.vault.create(pagePath, `# ${concept.name}\n`);
            }
        }
    }

    private getTextLength(content: string): number {
        return content
            .replace(/!\[\[.*?\]\]/g, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/`[^`]+`/g, '')
            .replace(/^---[\s\S]*?---/m, '')
            .trim()
            .length;
    }


    private getMaxConceptsForLength(textLength: number): number {
        const rules = [
            { minChars: 0, maxChars: 199, maxConcepts: 1 },
            { minChars: 200, maxChars: 499, maxConcepts: 2 },
            { minChars: 500, maxChars: 999, maxConcepts: 3 },
            { minChars: 1000, maxChars: Infinity, maxConcepts: 4 },
        ]
        for (const rule of rules) {
            if (textLength >= rule.minChars && textLength < rule.maxChars) {
                return rule.maxConcepts;
            }
        }

        return 4;
    }

}

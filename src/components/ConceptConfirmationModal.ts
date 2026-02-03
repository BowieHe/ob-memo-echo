import { Modal, Setting } from 'obsidian';
import type { ConfirmedConcept, ExtractedConceptWithMatch } from '@core/types/concept';

interface ConceptConfirmationProps {
    note: {
        path: string;
        title: string;
        content: string;
    };
    extractedConcepts: ExtractedConceptWithMatch[];
    onConfirm: (concepts: ConfirmedConcept[]) => void;
    onSkip: () => void;
    onCancel: () => void;
}

export class ConceptConfirmationModal extends Modal {
    private props: ConceptConfirmationProps;
    private selected: Map<string, boolean> = new Map();
    private createPagesForNew = false;

    constructor(app: any, props: ConceptConfirmationProps) {
        super(app);
        this.props = props;
        props.extractedConcepts.forEach((concept) => this.selected.set(concept.name, true));
    }

    onOpen(): void {
        const { contentEl } = this;
        const { note, extractedConcepts } = this.props;

        contentEl.empty();
        contentEl.createEl('h3', { text: 'Confirm Extracted Concepts' });
        contentEl.createEl('p', { text: `Note: ${note.title}` });

        extractedConcepts.forEach((concept) => {
            new Setting(contentEl)
                .setName(`[[${concept.name}]]`) 
                .setDesc(`${Math.round(concept.confidence * 100)}% • ${concept.matchInfo.matchType}`)
                .addToggle((toggle) => {
                    toggle.setValue(true).onChange((value) => {
                        this.selected.set(concept.name, value);
                    });
                });

            if (concept.reason) {
                contentEl.createEl('div', { text: concept.reason, cls: 'memo-echo-concept-reason' });
            }
        });

        new Setting(contentEl)
            .setName('Create concept pages for new concepts')
            .setDesc('Applies to concepts marked as new')
            .addToggle((toggle) => {
                toggle.setValue(false).onChange((value) => {
                    this.createPagesForNew = value;
                });
            });

        const actions = contentEl.createDiv('memo-echo-concept-actions');

        new Setting(actions)
            .addButton((button) =>
                button.setButtonText('Cancel').onClick(() => {
                    this.close();
                    this.props.onCancel();
                })
            )
            .addButton((button) =>
                button.setButtonText('Skip Note').setWarning().onClick(() => {
                    this.close();
                    this.props.onSkip();
                })
            )
            .addButton((button) =>
                button.setButtonText('Apply').setCta().onClick(() => {
                    const confirmed: ConfirmedConcept[] = [];

                    for (const concept of extractedConcepts) {
                        if (!this.selected.get(concept.name)) {
                            continue;
                        }

                        const aliases = concept.matchInfo.matchType === 'alias'
                            ? [concept.matchInfo.originalTerm]
                            : undefined;

                        confirmed.push({
                            name: concept.matchInfo.matchedConcept,
                            isNew: concept.matchInfo.matchType === 'new',
                            createPage: this.createPagesForNew,
                            aliases,
                        });
                    }

                    this.close();
                    this.props.onConfirm(confirmed);
                })
            );
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoEchoSettingTab, DEFAULT_SETTINGS } from '../settings';
import { App } from 'obsidian';

describe('MemoEchoSettingTab layout', () => {
    it('renders top-level sections in the expected order', () => {
        const app = new App();
        const plugin = {
            settings: { ...DEFAULT_SETTINGS },
            vectorBackend: {
                count: vi.fn().mockResolvedValue(0),
            },
            associationEngine: {
                getStats: vi.fn().mockReturnValue({
                    totalNotes: 0,
                    totalConcepts: 0,
                    totalAssociations: 0,
                    avgConceptsPerNote: 0,
                }),
            },
        } as any;

        const tab = new MemoEchoSettingTab(app, plugin);
        const headings: string[] = [];
        const container = tab.containerEl as any;

        container.empty = vi.fn(() => {
            container.innerHTML = '';
        });

        const createEl = (tag: string, options?: { text?: string }) => {
            const el = document.createElement(tag);
            if (options?.text) {
                el.textContent = options.text;
            }
            if (tag === 'h3' && options?.text) {
                headings.push(options.text);
            }
            container.appendChild(el);
            return el;
        };

        const createDiv = (cls?: string) => {
            const el = document.createElement('div');
            if (cls) {
                el.className = cls;
            }
            (el as any).createEl = createEl;
            (el as any).createDiv = createDiv;
            (el as any).empty = () => {
                el.innerHTML = '';
            };
            container.appendChild(el);
            return el;
        };

        container.createEl = createEl;
        container.createDiv = createDiv;

        tab.display();

        expect(headings).toEqual([
            '概览',
            '环境配置',
            'AI 总结与标签',
            '知识图谱',
            '索引管理',
            '数据库管理',
        ]);
    });
});

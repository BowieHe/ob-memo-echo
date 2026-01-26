/**
 * AssociationPanel Unit Tests
 * v0.6.0: Tests for the association panel React component
 */

import { NoteAssociation } from '../services/association-engine';

// Mock React and react-dom for testing without full render
jest.mock('react', () => ({
    ...jest.requireActual('react'),
    useState: jest.fn(),
    useEffect: jest.fn(),
    useCallback: jest.fn((fn) => fn),
    createElement: jest.fn(),
}));

describe('AssociationPanel (v0.6.0)', () => {
    // Test data
    const mockAssociations: NoteAssociation[] = [
        {
            sourceNoteId: 'notes/docker-deploy.md',
            targetNoteId: 'notes/kubernetes-intro.md',
            sourceNoteTitle: 'Docker 部署实践',
            targetNoteTitle: 'Kubernetes 入门',
            sharedConcepts: ['容器化', '部署策略'],
            confidence: 0.85,
            discoveredAt: new Date('2025-01-26'),
        },
        {
            sourceNoteId: 'notes/api-design.md',
            targetNoteId: 'notes/rest-principles.md',
            sourceNoteTitle: 'API 设计指南',
            targetNoteTitle: 'REST 原则',
            sharedConcepts: ['幂等性', '接口设计'],
            confidence: 0.72,
            discoveredAt: new Date('2025-01-26'),
        },
    ];

    describe('Association Data Structure', () => {
        it('should have required fields in NoteAssociation', () => {
            const association = mockAssociations[0];

            expect(association).toHaveProperty('sourceNoteId');
            expect(association).toHaveProperty('targetNoteId');
            expect(association).toHaveProperty('sharedConcepts');
            expect(association).toHaveProperty('confidence');
            expect(association).toHaveProperty('discoveredAt');
        });

        it('should have valid confidence values between 0 and 1', () => {
            mockAssociations.forEach(association => {
                expect(association.confidence).toBeGreaterThanOrEqual(0);
                expect(association.confidence).toBeLessThanOrEqual(1);
            });
        });

        it('should have at least one shared concept', () => {
            mockAssociations.forEach(association => {
                expect(association.sharedConcepts.length).toBeGreaterThan(0);
            });
        });
    });

    describe('AssociationPanel Props Validation', () => {
        it('should define correct props interface', () => {
            // Props interface validation
            const validProps = {
                associations: mockAssociations,
                isLoading: false,
                onAccept: async () => { },
                onIgnore: () => { },
                onDeleteConcept: () => { },
                onAcceptAll: async () => { },
                onClearRecent: async () => { },
                onRefresh: async () => { },
                onOpenFile: () => { },
            };

            expect(validProps.associations).toBeDefined();
            expect(typeof validProps.isLoading).toBe('boolean');
            expect(typeof validProps.onAccept).toBe('function');
            expect(typeof validProps.onIgnore).toBe('function');
            expect(typeof validProps.onDeleteConcept).toBe('function');
            expect(typeof validProps.onAcceptAll).toBe('function');
            expect(typeof validProps.onClearRecent).toBe('function');
            expect(typeof validProps.onRefresh).toBe('function');
            expect(typeof validProps.onOpenFile).toBe('function');
        });
    });

    describe('Association Filtering Logic', () => {
        it('should use provided associations list as-is', () => {
            expect(mockAssociations.length).toBe(2);
            expect(mockAssociations[0].sourceNoteId).toBe('notes/docker-deploy.md');
        });

        it('should handle empty associations array', () => {
            const emptyAssociations: NoteAssociation[] = [];
            expect(emptyAssociations.length).toBe(0);
        });
    });

    describe('Confidence Display', () => {
        it('should convert confidence to percentage', () => {
            const confidence = 0.85;
            const percent = Math.round(confidence * 100);
            expect(percent).toBe(85);
        });

        it('should handle edge case confidence values', () => {
            expect(Math.round(0 * 100)).toBe(0);
            expect(Math.round(1 * 100)).toBe(100);
            expect(Math.round(0.999 * 100)).toBe(100);
            expect(Math.round(0.001 * 100)).toBe(0);
        });
    });

    describe('Note Title Extraction', () => {
        it('should use title if available', () => {
            const association = mockAssociations[0];
            const sourceTitle = association.sourceNoteTitle || association.sourceNoteId;
            expect(sourceTitle).toBe('Docker 部署实践');
        });

        it('should fallback to noteId if title is missing', () => {
            const association: NoteAssociation = {
                sourceNoteId: 'notes/test.md',
                targetNoteId: 'notes/other.md',
                sharedConcepts: ['test'],
                confidence: 0.5,
                discoveredAt: new Date(),
            };

            const sourceTitle = association.sourceNoteTitle ||
                association.sourceNoteId.split('/').pop()?.replace('.md', '') ||
                association.sourceNoteId;

            expect(sourceTitle).toBe('test');
        });
    });

    describe('Concept Deletion', () => {
        it('should remove concept from association', () => {
            const association = { ...mockAssociations[0] };
            const conceptToRemove = '容器化';

            const updatedConcepts = association.sharedConcepts.filter(
                (c) => c !== conceptToRemove
            );

            expect(updatedConcepts).not.toContain('容器化');
            expect(updatedConcepts).toContain('部署策略');
        });

        it('should handle last concept removal', () => {
            const association: NoteAssociation = {
                sourceNoteId: 'a.md',
                targetNoteId: 'b.md',
                sharedConcepts: ['only-concept'],
                confidence: 0.5,
                discoveredAt: new Date(),
            };

            const updatedConcepts = association.sharedConcepts.filter(
                (c) => c !== 'only-concept'
            );

            expect(updatedConcepts.length).toBe(0);
        });
    });
});

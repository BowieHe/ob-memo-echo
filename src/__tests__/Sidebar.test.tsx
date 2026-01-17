import React from "react";
import ReactDOM from "react-dom/client";
import { act } from "react-dom/test-utils";
import { Sidebar } from "../components/Sidebar";
import { VectorIndexManager } from "../services/vector-index-manager";

describe("Sidebar Component", () => {
    let container: HTMLDivElement;
    let mockIndexManager: VectorIndexManager;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        mockIndexManager = {
            search: jest.fn(),
        } as any;
    });

    afterEach(() => {
        document.body.removeChild(container);
        container.remove();
    });

    it("renders without crashing in ambient mode", () => {
        act(() => {
            const root = ReactDOM.createRoot(container);
            root.render(
                <Sidebar
                    indexManager={mockIndexManager}
                    initialMode="ambient"
                />
            );
        });

        // Check for class presence
        expect(container.querySelector(".memo-echo-sidebar")).toBeTruthy();
        // Check for ambient view header
        expect(container.textContent).toContain("Related Thoughts");
    });

    it("renders search mode correctly", () => {
        act(() => {
            const root = ReactDOM.createRoot(container);
            root.render(
                <Sidebar indexManager={mockIndexManager} initialMode="search" />
            );
        });

        // Check for search view header
        expect(container.textContent).toContain("Search Results");
    });
});

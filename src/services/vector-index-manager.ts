/**
 * VectorIndexManager - Orchestrates indexing, caching, and persistence
 * v0.7.0: Removed association engine, simplified to Index service only
 */

import { MemoryCache, CachedChunk } from "./memory-cache";
import { PersistQueue, MultiVectorQueuedChunk } from "./persist-queue";
import type { VectorBackend, SearchResult } from "./vector-backend";
import { VECTOR_NAMES } from "@core/constants";
import { EmbeddingService } from "./embedding-service";
import { Chunker, ChunkResult } from "./chunker";
import { MetadataExtractor } from "./metadata-extractor";
import { ContentPreprocessor } from "./content-preprocessor";
import { SemanticChunker } from "./semantic-chunker";
import type {
	ExtractedConceptDetail,
	ExtractedMetadataConcept,
} from "@core/types/extraction";
import type { SemanticChunk, UnifiedIndexResult } from "@core/types/indexing";

export class VectorIndexManager {
	private memoryCache: MemoryCache;
	private persistQueue: PersistQueue;
	private backend: VectorBackend;
	private embeddingService: EmbeddingService;
	private chunker: Chunker;
	private metadataExtractor: MetadataExtractor;
	private contentPreprocessor: ContentPreprocessor;
	private semanticChunker: SemanticChunker;

	constructor(
		backend: VectorBackend,
		embeddingService: EmbeddingService,
		chunker: Chunker,
		metadataExtractor: MetadataExtractor,
		contentPreprocessor: ContentPreprocessor,
		semanticChunker: SemanticChunker,
		cacheSize: number = 50 * 1024 * 1024, // 50MB default
	) {
		this.backend = backend;
		this.embeddingService = embeddingService;
		this.chunker = chunker;
		this.metadataExtractor = metadataExtractor;
		this.contentPreprocessor = contentPreprocessor;
		this.semanticChunker = semanticChunker;

		this.memoryCache = new MemoryCache(cacheSize);
		this.persistQueue = new PersistQueue(backend, {
			batchSize: 50,
			flushInterval: 30000,
			useMultiVector: true,
		});
	}

	/**
	 * Index a file
	 */
	async indexFile(filePath: string, content: string): Promise<void> {
		console.log("[MemoEcho] Index start:", filePath);

		// Chunk the content
		const chunks = this.chunker.chunk(content);
		console.log(
			"[MemoEcho] Chunk count:",
			chunks.length,
			"Content length:",
			content.length,
		);

		for (const chunk of chunks) {
			try {
				if (chunks.length <= 3 || chunk.index === 0) {
					console.log(
						"[MemoEcho] Indexing chunk",
						chunk.index,
						"len",
						chunk.content.length,
						"header",
						chunk.header_path || "",
					);
				}
				await this.indexChunk(filePath, chunk);
			} catch (error) {
				console.error(
					"[MemoEcho] Failed indexing chunk",
					chunk.index,
					"for",
					filePath,
					error,
				);
				throw error;
			}
		}
		console.log("[MemoEcho] Index finished:", filePath);
	}

	/**
	 * Unified indexing pipeline: preprocess -> semantic chunk -> metadata extract -> index
	 */
	async indexFileComplete(
		filePath: string,
		content: string,
		title: string,
	): Promise<UnifiedIndexResult> {
		console.log("[MemoEcho] Unified index start:", filePath);

		const preprocessed = this.contentPreprocessor.preprocess(content);
		const semanticChunks = await this.semanticChunker.chunk(
			preprocessed.cleaned,
			title,
		);
		const chunks = this.buildChunksFromSemantic(content, semanticChunks);

		console.log(
			"[MemoEcho] Semantic chunk count:",
			chunks.length,
			"Content length:",
			content.length,
		);

		const concepts: ExtractedConceptDetail[] = [];

		for (const chunk of chunks) {
			try {
				if (chunks.length <= 3 || chunk.index === 0) {
					console.log(
						"[MemoEcho] Indexing semantic chunk",
						chunk.index,
						"len",
						chunk.content.length,
						"header",
						chunk.header_path || "",
					);
				}

				const extractedMetadata = await this.metadataExtractor.extract(
					chunk.content,
				);
				const chunkConcepts = this.mapConceptsFromMetadata(
					extractedMetadata.concepts,
					extractedMetadata.summary,
					chunk.header_path,
				);

				concepts.push(...chunkConcepts);
				await this.indexChunkWithMetadata(
					filePath,
					chunk,
					extractedMetadata,
				);
			} catch (error) {
				console.error(
					"[MemoEcho] Failed indexing semantic chunk",
					chunk.index,
					"for",
					filePath,
					error,
				);
				throw error;
			}
		}

		console.log("[MemoEcho] Unified index finished:", filePath);

		return {
			chunks,
			concepts: this.deduplicateConcepts(concepts),
		};
	}

	/**
	 * Index a single chunk with Named Vectors (v0.4.0)
	 * Generates three embeddings: content, summary, title
	 */
	private async indexChunk(
		filePath: string,
		chunk: ChunkResult,
	): Promise<void> {
		const extractedMetadata = await this.metadataExtractor.extract(
			chunk.content,
		);
		await this.indexChunkWithMetadata(filePath, chunk, extractedMetadata);
	}

	private async indexChunkWithMetadata(
		filePath: string,
		chunk: ChunkResult,
		extractedMetadata: {
			summary: string;
			tags: string[];
			category: string;
			concepts: ExtractedMetadataConcept[];
		},
	): Promise<void> {
		const chunkId = `${filePath}-chunk-${chunk.index}`;

		// Generate three embeddings in parallel
		const [contentEmbedding, summaryEmbedding, titleEmbedding] =
			await Promise.all([
				this.embeddingService.embed(chunk.content),
				this.embeddingService.embed(
					extractedMetadata.summary || chunk.content.slice(0, 200),
				),
				this.embeddingService.embed(chunk.header_path || filePath),
			]);

		const conceptNames = extractedMetadata.concepts
			.map((concept) => concept.name)
			.filter(Boolean);

		// Simplified payload (v0.4.0)
		const payload = {
			filePath,
			header_path: chunk.header_path,
			start_line: chunk.start_line,
			end_line: chunk.end_line,
			content: chunk.content,
			summary: extractedMetadata.summary,
			tags: [
				...extractedMetadata.tags,
				extractedMetadata.category, // Merge category into tags
			].filter(Boolean),
			concepts: conceptNames,
			type: "chunk",
			word_count: chunk.content.length,
			indexedAt: Date.now(),
		};

		// Create cached chunk (use content embedding for cache search)
		const cachedChunk: CachedChunk = {
			id: chunkId,
			content: chunk.content,
			embedding: contentEmbedding,
			metadata: payload,
			timestamp: Date.now(),
		};

		// Add to cache
		this.memoryCache.set(chunkId, cachedChunk);

		// Add to multi-vector persist queue
		const queuedChunk: MultiVectorQueuedChunk = {
			id: chunkId,
			vectors: {
				[VECTOR_NAMES.CONTENT]: contentEmbedding,
				[VECTOR_NAMES.SUMMARY]: summaryEmbedding,
				[VECTOR_NAMES.TITLE]: titleEmbedding,
			},
			metadata: payload,
		};

		this.persistQueue.enqueueMultiVector(queuedChunk);
	}

	private buildChunksFromSemantic(
		content: string,
		semanticChunks: SemanticChunk[],
	): ChunkResult[] {
		const lines = content.split("\n");
		const maxLine = lines.length;
		const chunks: ChunkResult[] = [];

		for (let i = 0; i < semanticChunks.length; i++) {
			const semantic = semanticChunks[i];
			const startLine = Math.max(
				1,
				Math.min(maxLine, semantic.start_line),
			);
			const endLine = Math.max(
				startLine,
				Math.min(maxLine, semantic.end_line),
			);

			const contentSlice = lines.slice(startLine - 1, endLine).join("\n");
			const startPos = this.offsetFromLine(lines, startLine);
			const endPos = startPos + contentSlice.length;

			chunks.push({
				content: contentSlice,
				headers: [],
				index: chunks.length,
				startPos,
				endPos,
				start_line: startLine,
				end_line: endLine,
				header_path: semantic.header_path || semantic.title || "",
			});
		}

		return chunks;
	}

	private offsetFromLine(lines: string[], lineNumber: number): number {
		let pos = 0;
		for (let i = 0; i < lineNumber - 1; i++) {
			pos += lines[i].length + 1;
		}
		return pos;
	}

	private mapConceptsFromMetadata(
		concepts: ExtractedMetadataConcept[],
		summary: string,
		headerPath: string,
	): ExtractedConceptDetail[] {
		const reason = summary?.trim()
			? summary.trim()
			: headerPath
				? `片段主题: ${headerPath}`
				: "来自片段内容";

		return concepts
			.filter((concept) => concept && concept.name)
			.map((concept) => ({
				name: concept.name,
				confidence: Number.isFinite(concept.confidence)
					? concept.confidence
					: 0.7,
				reason,
			}));
	}

	private deduplicateConcepts(
		concepts: ExtractedConceptDetail[],
	): ExtractedConceptDetail[] {
		const map = new Map<string, ExtractedConceptDetail>();

		for (const concept of concepts) {
			const key = concept.name.toLowerCase();
			const existing = map.get(key);
			if (!existing || existing.confidence < concept.confidence) {
				map.set(key, concept);
			}
		}

		return Array.from(map.values());
	}

	/**
	 * Search across cache and vector store with Named Vectors fusion (v0.4.0)
	 */
	async search(
		query: string,
		options: { limit?: number; tags?: string[] } = {},
	): Promise<SearchResult[]> {
		const limit = options.limit || 10;

		// Generate query embedding
		const queryEmbedding = await this.embeddingService.embed(query);

		// Search in cache
		const cacheResults = this.searchInCache(queryEmbedding, limit);

		// Search in vector store with fusion (v0.5.0)
		const storeResults = await this.backend.searchWithFusion(
			queryEmbedding,
			{
				limit,
				filter: options.tags ? { tags: options.tags } : undefined,
			},
		);

		// Combine and deduplicate results
		const combinedResults = this.combineResults(
			cacheResults,
			storeResults,
			limit,
		);

		return combinedResults;
	}

	async ensureBackendReady(): Promise<void> {
		if (typeof (this.backend as any).ensureReady === "function") {
			await (this.backend as any).ensureReady();
		}
	}

	/**
	 * Search in memory cache
	 */
	private searchInCache(
		queryEmbedding: number[],
		limit: number,
	): SearchResult[] {
		const allCached = this.memoryCache.getAll();

		// Calculate cosine similarity for each cached chunk
		const results: SearchResult[] = allCached.map((chunk) => ({
			id: chunk.id,
			score: this.cosineSimilarity(queryEmbedding, chunk.embedding),
			metadata: chunk.metadata,
		}));

		// Sort by score and limit
		return results.sort((a, b) => b.score - a.score).slice(0, limit);
	}

	/**
	 * Combine and deduplicate results from cache and store
	 */
	private combineResults(
		cacheResults: SearchResult[],
		storeResults: SearchResult[],
		limit: number,
	): SearchResult[] {
		const resultMap = new Map<string, SearchResult>();

		// Add cache results (prioritize cache)
		for (const result of cacheResults) {
			resultMap.set(result.id, result);
		}

		// Add store results (only if not in cache)
		for (const result of storeResults) {
			if (!resultMap.has(result.id)) {
				resultMap.set(result.id, result);
			}
		}

		// Sort by score and limit
		return Array.from(resultMap.values())
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}

	/**
	 * Calculate cosine similarity
	 */
	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		return denominator === 0 ? 0 : dotProduct / denominator;
	}

	/**
	 * Flush persist queue to vector store (v0.4.0: uses multi-vector)
	 */
	async flush(): Promise<void> {
		await this.persistQueue.flushMultiVector();
	}

	/**
	 * Handle file save event
	 */
	async onFileSave(filePath: string): Promise<void> {
		// Flush chunks for this file
		const fileChunks = this.persistQueue.getByFilePath(filePath);

		if (fileChunks.length > 0) {
			await this.persistQueue.flushMultiVector();
		}
	}

	/**
	 * Remove file from cache and queue
	 */
	removeFile(filePath: string): void {
		this.memoryCache.deleteByFilePath(filePath);
		this.persistQueue.removeByFilePath(filePath);
	}

	/**
	 * Update file (remove old, index new)
	 */
	async updateFile(filePath: string, content: string): Promise<void> {
		this.removeFile(filePath);
		await this.indexFile(filePath, content);
	}

	/**
	 * Get chunk from cache
	 */
	getFromCache(chunkId: string): CachedChunk | undefined {
		return this.memoryCache.get(chunkId);
	}

	/**
	 * Get cache size
	 */
	getCacheSize(): number {
		return this.memoryCache.size();
	}

	/**
	 * Get queue size
	 */
	getQueueSize(): number {
		return this.persistQueue.size();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return {
			size: this.memoryCache.size(),
			currentSize: this.memoryCache.getCurrentSize(),
			maxSize: this.memoryCache.getMaxSize(),
		};
	}

	/**
	 * Get queue statistics
	 */
	getQueueStats() {
		return this.persistQueue.getStats();
	}

	/**
	 * Stop all background processes
	 */
	stop(): void {
		this.persistQueue.stop();
	}
}

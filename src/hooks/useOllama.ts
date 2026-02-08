import { useCallback } from 'react';
import { useAppStore, OllamaModel } from '../store/appStore';
import { TextChunk } from '../utils/textChunker';

// Always use native fetch - simpler and more reliable
// For production, user may need to configure Ollama with OLLAMA_ORIGINS="*"
const fetch = window.fetch;

interface OllamaTagsResponse {
    models: Array<{
        name: string;
        size: number;
        modified_at: string;
    }>;
}

interface OllamaGenerateResponse {
    response: string;
    done: boolean;
}

interface OllamaChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AgenticResponse {
    action: 'rewrite' | 'insert' | 'append' | 'none' | 'edit';
    content?: string;
    message: string;
    search?: string;
    replace?: string;
    thought?: string; // Add thought field for reasoning transparency
}

export function useOllama() {
    const {
        ollamaUrl,
        selectedModel,
        embeddingModel,
        systemPrompt,
        temperature,
        topK,
        topP,
        setAvailableModels,
        setOllamaConnected,
        setSelectedModel,
        contextDocuments,
    } = useAppStore();

    // Common options for all requests
    const getOptions = (tempOverride?: number) => {
        const temp = tempOverride ?? temperature;
        return {
            ...(temp !== undefined ? { temperature: temp } : {}),
            top_k: topK,
            top_p: topP,
        };
    };

    // Generate embedding using Ollama API
    const generateEmbedding = useCallback(async (text: string): Promise<number[]> => {
        if (!embeddingModel) return [];

        try {
            const response = await fetch(`${ollamaUrl}/api/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: embeddingModel,
                    input: text,
                }),
            });

            if (!response.ok) throw new Error('Embedding request failed');

            const data = await response.json();
            return data.embeddings?.[0] || [];
        } catch (error) {
            console.error('Embedding error:', error);
            return [];
        }
    }, [ollamaUrl, embeddingModel]);

    // Cosine similarity between two vectors
    const cosineSimilarity = (a: number[], b: number[]): number => {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        return dot / (Math.sqrt(magA) * Math.sqrt(magB));
    };

    // Helper: Get representative samples from documents (for general queries)
    const getRepresentativeSamples = useCallback((maxChunks: number = 5): TextChunk[] => {
        if (!contextDocuments.length) return [];

        const allChunks = contextDocuments.flatMap(d => d.chunks);
        if (allChunks.length <= maxChunks) return allChunks;

        // Get evenly distributed samples from across all documents
        const step = Math.floor(allChunks.length / maxChunks);
        const samples: TextChunk[] = [];
        for (let i = 0; i < allChunks.length && samples.length < maxChunks; i += step) {
            samples.push(allChunks[i]);
        }
        return samples;
    }, [contextDocuments]);

    // Helper: Find relevant chunks (keyword or embedding-based)
    // Now also returns representative samples when no exact matches
    const findRelevantChunks = useCallback(async (query: string, forceReturnSamples: boolean = false): Promise<TextChunk[]> => {
        if (!contextDocuments.length) return [];

        const allChunks = contextDocuments.flatMap(d => d.chunks);

        // Check if query is a general/summary request
        const generalQueryPatterns = [
            /özet/i, /summary/i, /summarize/i, /özetle/i,
            /tell me about/i, /what is this/i, /describe/i,
            /ne hakkında/i, /anlat/i, /explain/i, /açıkla/i,
            /context/i, /belge/i, /document/i, /book/i, /kitap/i
        ];
        const isGeneralQuery = generalQueryPatterns.some(p => p.test(query)) || forceReturnSamples;

        // If embedding model is available, use vector similarity
        if (embeddingModel) {
            const queryEmbedding = await generateEmbedding(query);
            if (queryEmbedding.length > 0) {
                const scored = await Promise.all(
                    allChunks.map(async (chunk) => {
                        // Cache embeddings on chunk if not present
                        if (!chunk.embedding) {
                            chunk.embedding = await generateEmbedding(chunk.text);
                        }
                        const score = cosineSimilarity(queryEmbedding, chunk.embedding || []);
                        return { chunk, score };
                    })
                );

                const filtered = scored
                    .filter(s => s.score > 0.3) // Threshold
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 5)
                    .map(s => s.chunk);

                // If no good matches but query is general, return samples
                if (filtered.length === 0 && isGeneralQuery) {
                    return getRepresentativeSamples(5);
                }
                return filtered;
            }
        }

        // Fallback: keyword-based matching
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
        const scored = allChunks.map(chunk => {
            const text = chunk.text.toLowerCase();
            let score = 0;
            terms.forEach(term => {
                if (text.includes(term)) score += 1;
            });
            if (text.includes(query.toLowerCase())) score += 5;
            return { chunk, score };
        });

        const filtered = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(s => s.chunk);

        // If no keyword matches but query is general, return representative samples
        if (filtered.length === 0 && isGeneralQuery) {
            return getRepresentativeSamples(5);
        }

        return filtered;
    }, [contextDocuments, embeddingModel, generateEmbedding, getRepresentativeSamples]);

    const fetchModels = useCallback(async (): Promise<OllamaModel[]> => {
        try {
            const response = await fetch(`${ollamaUrl}/api/tags`, {
                method: 'GET',
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data: OllamaTagsResponse = await response.json();

            if (!data || !data.models) {
                console.error('Invalid data structure:', data);
                throw new Error('Invalid data structure received from Ollama');
            }
            const models = data.models.map((m) => ({
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
            }));

            setAvailableModels(models);
            setOllamaConnected(true);

            // Auto-select first model if none selected
            if (models.length > 0 && !selectedModel) {
                setSelectedModel(models[0].name);
            }

            return models;
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            setOllamaConnected(false);
            throw error;
        }
    }, [ollamaUrl, selectedModel, setAvailableModels, setOllamaConnected, setSelectedModel]);

    const generateStream = useCallback(
        async (
            prompt: string,
            onChunk: (chunk: string, done: boolean) => void,
            context?: string,
            signal?: AbortSignal
        ): Promise<void> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            const fullPrompt = context
                ? `${systemPrompt}\n\nContext:\n${context}\n\nRequest:\n${prompt}`
                : `${systemPrompt}\n\nRequest:\n${prompt}`;

            try {
                const response = await fetch(`${ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    signal,
                    body: JSON.stringify({
                        model: selectedModel,
                        prompt: fullPrompt,
                        stream: true,
                        options: getOptions(),
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No reader available');

                const decoder = new TextDecoder();
                let fullResponse = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data: OllamaGenerateResponse = JSON.parse(line);
                            fullResponse += data.response;
                            onChunk(fullResponse, data.done);
                        } catch {
                            // Ignore parse errors for incomplete JSON
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to generate stream:', error);
                throw error;
            }
        },
        [ollamaUrl, selectedModel, systemPrompt, temperature, topK, topP]
    );

    const chatStream = useCallback(
        async (
            messages: OllamaChatMessage[],
            onChunk: (chunk: string, done: boolean, usedChunks?: TextChunk[]) => void,
            signal?: AbortSignal
        ): Promise<void> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            // RAG Logic: Find relevant chunks based on the last user message
            let usedChunks: TextChunk[] = [];
            let fullMessages = [...messages];

            const lastUserMsg = messages.filter(m => m.role === 'user').pop();
            if (lastUserMsg && contextDocuments.length > 0) {
                usedChunks = await findRelevantChunks(lastUserMsg.content);

                // Always include context document info
                const docNames = contextDocuments.map(d => d.name).join(', ');

                if (usedChunks.length > 0) {
                    const contextText = usedChunks.map((c: TextChunk) => `[From ${c.source}]: ${c.text}`).join('\n\n');
                    const systemWithContext = `${systemPrompt}\n\nYou have access to the following context documents: ${docNames}\n\nUse the following relevant excerpts to answer the user's request:\n\nCONTEXT:\n${contextText}`;

                    fullMessages = [
                        { role: 'system', content: systemWithContext },
                        ...messages,
                    ];
                } else {
                    // No matching chunks but documents exist - still mention them
                    const systemWithDocs = `${systemPrompt}\n\nYou have access to context documents: ${docNames}. The user may ask about their content. If asked about these documents, let the user know you can see them and try to help based on general knowledge.`;

                    fullMessages = [
                        { role: 'system', content: systemWithDocs },
                        ...messages,
                    ];
                }
            } else {
                fullMessages = [
                    { role: 'system', content: systemPrompt },
                    ...messages,
                ];
            }

            try {
                const response = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    signal,
                    body: JSON.stringify({
                        model: selectedModel,
                        messages: fullMessages,
                        stream: true,
                        options: getOptions(),
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No reader available');

                const decoder = new TextDecoder();
                let fullResponse = '';

                // Notify initial used chunks
                if (usedChunks.length > 0) {
                    onChunk('', false, usedChunks);
                }

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.message?.content) {
                                fullResponse += data.message.content;
                                onChunk(fullResponse, data.done || false, usedChunks);
                            }
                        } catch {
                            // Ignore parse errors for incomplete JSON
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to chat stream:', error);
                throw error;
            }
        },
        [ollamaUrl, selectedModel, systemPrompt, temperature, topK, topP, findRelevantChunks, contextDocuments]
    );

    const agenticChat = useCallback(
        async (messages: OllamaChatMessage[], _documentContent: string): Promise<AgenticResponse> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            // RAG logic for Agentic Chat (Non-stream) 
            let ragSystemPrompt = systemPrompt;
            const lastUserMsg = messages.filter(m => m.role === 'user').pop();
            if (lastUserMsg && contextDocuments.length > 0) {
                const usedChunks = await findRelevantChunks(lastUserMsg.content);
                if (usedChunks.length > 0) {
                    const contextText = usedChunks.map((c: TextChunk) => `[From ${c.source}]: ${c.text}`).join('\n\n');
                    ragSystemPrompt += `\n\nCONTEXT:\n${contextText}`;
                }
            }

            const finalSystemPrompt = `${ragSystemPrompt}

You are an AI writing assistant with the ability to edit the user's document. 
When the user asks you to make changes, respond with a JSON object:
{
  "action": "replace_all" | "insert" | "append" | "none",
  "content": "new content",
  "message": "explanation"
}`;

            const fullMessages: OllamaChatMessage[] = [
                { role: 'system', content: finalSystemPrompt },
                ...messages,
            ];

            try {
                const response = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    body: JSON.stringify({
                        model: selectedModel,
                        messages: fullMessages,
                        stream: false,
                        options: getOptions(), // Use user-configured temperature
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const content = data.message?.content || '';

                try {
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        return {
                            action: parsed.action || 'none',
                            content: parsed.content,
                            message: parsed.message || 'Done.',
                        };
                    }
                } catch {
                }

                return {
                    action: 'none',
                    content: undefined,
                    message: content,
                };
            } catch (error) {
                console.error('Failed to agentic chat:', error);
                throw error;
            }
        },
        [ollamaUrl, selectedModel, systemPrompt, temperature, topK, topP, findRelevantChunks, contextDocuments]
    );

    // Agentic RAG Planner: Decides what to search for or do based on user query
    const generateSearchQueries = useCallback(async (
        userQuery: string,
        docSummary: string
    ): Promise<{ queries: string[], thought: string }> => {
        if (!selectedModel) return { queries: [], thought: '' };

        const plannerPrompt = `
You are an expert researcher and document editor.
User Query: "${userQuery}"

Available Documents Summary:
${docSummary}

Determine if you need to look up specific information from the documents to answer the query or perform the edit.
- If the user asks for a summary of the whole document, you probably don't need to search if the summary is sufficient, or you might want to search for "key points".
- If the user asks about specific details (e.g. "What does it say about X?"), generate 1-3 search queries to find that information.
- If the request is a direct edit (e.g. "Fix typo in first paragraph"), you don't need to search.

Respond with a JSON object:
{
  "thought": "Reasoning for your decision...",
  "search_queries": ["query 1", "query 2"] (empty if no search needed)
}
`;

        try {
            const response = await fetch(`${ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: selectedModel,
                    prompt: plannerPrompt,
                    stream: false,
                    options: getOptions(0.2), // Low temp for structured output
                    format: "json"
                }),
            });

            if (!response.ok) return { queries: [], thought: '' };
            const data = await response.json();
            const result = JSON.parse(data.response);
            return {
                queries: result.search_queries || [],
                thought: result.thought || ''
            };
        } catch (e) {
            console.error("Planner failed:", e);
            // Fallback: simple keyword extraction
            return { queries: [userQuery], thought: 'Planner failed, falling back to direct query.' };
        }
    }, [ollamaUrl, selectedModel, getOptions]);

    const agenticChatStream = useCallback(
        async (
            messages: OllamaChatMessage[],
            documentContent: string,
            onChunk: (response: AgenticResponse, done: boolean) => void,
            signal?: AbortSignal
        ): Promise<void> => {
            // DEBUG: Trace execution
            onChunk({ action: 'none', message: 'Debug: Stream Started', content: '' }, false);

            if (!selectedModel) {
                throw new Error('No model selected');
            }

            onChunk({ action: 'none', message: `Debug: Model ${selectedModel}`, content: '' }, false);

            // 1. Prepare Context Summary
            let fullContextSummary = '';
            if (contextDocuments.length > 0) {
                const docSummaries = contextDocuments.map(doc => {
                    const preview = doc.content.slice(0, 500).replace(/\n/g, ' ');
                    return `[${doc.name}]: ${preview}...`;
                }).join('\n\n');
                fullContextSummary = `\n\nAVAILABLE CONTEXT DOCUMENTS:\n${docSummaries}`;
                onChunk({ action: 'none', message: `Debug: Context Prepared (${contextDocuments.length} docs)`, content: '' }, false);
            } else {
                onChunk({ action: 'none', message: 'Debug: No Context Docs', content: '' }, false);
            }
            // 2. Planner Step
            let ragContext = '';
            let plannerThought = '';
            const lastUserMsg = messages.filter(m => m.role === 'user').pop();

            if (lastUserMsg && contextDocuments.length > 0) {
                onChunk({
                    action: 'none',
                    message: '🧠 Planning research strategy...',
                    content: '',
                }, false);

                const { queries, thought } = await generateSearchQueries(lastUserMsg.content, fullContextSummary);
                plannerThought = thought;

                if (queries.length > 0) {
                    onChunk({
                        action: 'none',
                        message: `🔍 Searching for: ${queries.join(', ')}...`,
                        content: '',
                    }, false);

                    console.log("Agentic Planner:", thought, "Searching for:", queries);

                    const searchResults = await Promise.all(queries.map(q => findRelevantChunks(q)));
                    const allChunks = Array.from(new Set(searchResults.flat()));
                    if (allChunks.length > 0) {
                        ragContext = allChunks.map((c: TextChunk) => `[From ${c.source}]: ${c.text}`).join('\n\n');
                    }
                }
            }

            // 3. Construct Final Prompt
            const contextSection = ragContext
                ? `\n\nRELEVANT EXCERPTS FROM SEARCH:\n${ragContext}`
                : (fullContextSummary ? '\n\nNote: Documents available. ' + (plannerThought ? `Planner thought: ${plannerThought}` : '') : '');

            const agenticSystemPrompt = `You are an AI writing assistant that can edit documents directly.
            
DEFINITIONS:
- "Canvas" = The document you're editing
- "Action" = Use one of the available tools below to modify the document

AVAILABLE TOOLS (Use ONLY these):
- reply: Answer questions without editing. Params: {"message": "your answer"}
- append_text: Add text at the end of the document. Params: {"text": "content"}
- prepend_text: Add text at the beginning of the document. Params: {"text": "content"}
- replace_all: Replace the entire document content. Params: {"text": "new content"}
- add_title: Add a title. Params: {"title": "text"}
- edit_first_paragraph: Edit the first paragraph. Params: {"new_content": "text"}
- edit_last_paragraph: Edit the last paragraph. Params: {"new_content": "text"}
- add_table: Add a table. Params: {"headers": [], "rows": [[]], "caption": ""}
- add_table: Add a table. Params: {"headers": [], "rows": [[]], "caption": ""}

Current document preview: "${documentContent.slice(0, 300).replace(/"/g, '\\"').replace(/\n/g, ' ')}..."
Document length: ${documentContent.length} chars
${fullContextSummary}${contextSection}

User says: "${lastUserMsg?.content}"

RULES:
1. Questions → Use 'reply' tool. Put your answer in the "message" field.
2. Edit requests → Use editing tool. Write ORIGINAL content in your own words.
3. ALWAYS use HTML formatting for document edits:
   - Headings: <h1>, <h2>, <h3>
   - Paragraphs: <p>Your text here</p>
   - Lists: <ul><li>Item</li></ul> or <ol><li>Item</li></ol>
   - Bold: <b>important</b>
4. Write complete, well-formatted content. Do NOT just copy context verbatim.

RESPOND WITH JSON ONLY. Use the correct parameter name for the chosen tool (e.g., "text" or "new_content"):
{"thought": "(optional) reasoning", "tool": "tool_name", "text": "content...", "message": "confirmation"}

Examples:
{"tool": "reply", "message": "This document discusses..."}
{"tool": "append_text", "text": "<h2>Summary</h2><p>...</p>", "message": "Added summary."}
{"tool": "edit_last_paragraph", "new_content": "<p>New conclusion...</p>", "message": "Updated conclusion."}`;

            const fullMessages: OllamaChatMessage[] = [
                { role: 'system', content: agenticSystemPrompt },
                ...messages,
            ];

            try {
                // Initial message
                onChunk({
                    action: 'none',
                    message: plannerThought ? `Evaluating request... (Thought: ${plannerThought})` : 'Thinking...',
                    content: '',
                }, false);

                const response = await fetch(`${ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    signal,
                    body: JSON.stringify({
                        model: selectedModel,
                        messages: fullMessages,
                        stream: true,
                        options: getOptions(),
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No reader available');

                const decoder = new TextDecoder();
                let fullText = '';
                let lastAction: AgenticResponse['action'] = 'none';
                // Start with the reasoning or default to thinking - NEVER empty
                let lastMessage = plannerThought ? `Evaluating request... (Thought: ${plannerThought})` : 'Thinking...';
                let lastContent = '';

                // Streaming state variables
                let isJsonDetected = false;
                let detectedTool = '';
                let accumulatedContent = '';
                let accumulatedThought = '';

                let accumulatedRaw = ''; // Buffer for raw NDJSON

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    accumulatedRaw += chunk;

                    // Process lines from raw buffer
                    const lines = accumulatedRaw.split('\n');
                    // Keep the last partial line in the buffer
                    accumulatedRaw = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const data = JSON.parse(line);
                            if (data.message && data.message.content) {
                                fullText += data.message.content;
                            }
                            // Ollama's native thinking field for reasoning models (DeepSeek R1, etc.)
                            // Ollama sends thinking as DELTA (new tokens each chunk), so we APPEND
                            if (data.message && data.message.thinking) {
                                accumulatedThought += data.message.thinking;
                                // Immediately stream the thinking to UI
                                onChunk({
                                    action: 'none',
                                    message: 'Thinking...',
                                    thought: accumulatedThought,
                                    content: ''
                                }, false);
                            }
                        } catch (e) {
                            // Verify if it's not just a partial JSON
                            console.warn('Error parsing stream line:', line, e);
                        }
                    }

                    // EXISTING LOGIC:
                    if (!isJsonDetected && (fullText.trim().startsWith('{') || fullText.trim().startsWith('```json'))) {
                        isJsonDetected = true;
                    }

                    // 0. Detect NATIVE thinking blocks (<think>, <thinking>) from reasoning models
                    // These models output their reasoning BEFORE the actual response
                    const thinkTagMatch = fullText.match(/<think(?:ing)?>([\s\S]*?)(?:<\/think(?:ing)?>|$)/i);
                    if (thinkTagMatch) {
                        const nativeThought = thinkTagMatch[1].trim();
                        if (nativeThought.length > accumulatedThought.length) {
                            accumulatedThought = nativeThought;
                            // Show the thinking is in progress
                            const isThinkingComplete = fullText.includes('</think') || fullText.includes('</thinking');
                            lastMessage = isThinkingComplete ? 'Processing response...' : 'Thinking...';

                            onChunk({
                                action: 'none',
                                message: lastMessage,
                                thought: accumulatedThought,
                                content: ''
                            }, false);
                        }
                    }

                    if (isJsonDetected) {
                        // 1. Detect JSON Thought field (for non-thinking models following our schema)
                        const thoughtMatch = fullText.match(/"thought"\s*:\s*"((?:[^"\\]|\\.)*)/s);
                        if (thoughtMatch) {
                            let rawThought = thoughtMatch[1];
                            const quoteSplit = rawThought.split(/(?<!\\)"/);
                            if (quoteSplit.length > 1) {
                                rawThought = quoteSplit[0];
                            }
                            const cleanThought = rawThought.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

                            if (cleanThought.length > accumulatedThought.length) {
                                accumulatedThought = cleanThought;
                                onChunk({
                                    action: 'none',
                                    message: lastMessage,
                                    thought: accumulatedThought,
                                    content: ''
                                }, false);
                            }
                        }
                        // 2. Detect Tool Name early
                        if (!detectedTool) {
                            const toolMatch = fullText.match(/"tool"\s*:\s*"([^"]+)"/);
                            if (toolMatch) {
                                detectedTool = toolMatch[1];
                            }
                        }

                        // 3. Optimistic Content Streaming
                        if (['append_text', 'replace_all', 'prepend_text'].includes(detectedTool)) {
                            // Match text, new_content, replacement_content
                            // Use non-greedy match until unescaped quote
                            const contentMatch = fullText.match(/"(text|new_content|replacement_content)"\s*:\s*"((?:[^"\\]|\\.)*)/s);
                            if (contentMatch) {
                                let rawContent = contentMatch[2];

                                const quoteSplit = rawContent.split(/(?<!\\)"/);
                                if (quoteSplit.length > 1) {
                                    rawContent = quoteSplit[0];
                                }

                                // Basic unescaping for display (preserving newlines for preview)
                                let cleanContent = rawContent.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

                                // Only emit if content grew
                                if (cleanContent.length > accumulatedContent.length) {
                                    accumulatedContent = cleanContent;

                                    // Stream directly to canvas (right side)
                                    lastMessage = 'Writing...';

                                    let streamContent = accumulatedContent;
                                    if (detectedTool === 'append_text') {
                                        streamContent = documentContent + '\n' + accumulatedContent;
                                    } else if (detectedTool === 'prepend_text') {
                                        streamContent = accumulatedContent + '\n' + documentContent;
                                    }

                                    onChunk({
                                        action: 'rewrite', // Always use rewrite for preview to ensure consistency
                                        message: lastMessage,
                                        thought: accumulatedThought,
                                        content: streamContent, // Live update canvas with FULL content
                                    }, false);
                                }
                            }
                        }
                    } else {
                        // Fallback processing for non-JSON or pre-JSON buffering
                        // Don't show raw JSON in chat - keep status message clean
                        if (fullText.trim().startsWith('{') || fullText.includes('"tool"')) {
                            // JSON-like content detected - don't show raw JSON
                            lastMessage = 'Processing...';
                        } else if (fullText.trim() === '```' || fullText.trim() === '`' || fullText.trim() === '```json') {
                            lastMessage = 'Thinking...';
                        } else if (fullText.length < 50 && !fullText.includes('{')) {
                            // Short non-JSON response - might be a simple reply
                            lastMessage = fullText;
                        } else {
                            // Long content - just show status
                            lastMessage = 'Generating...';
                        }

                        onChunk({
                            action: 'none',
                            message: lastMessage,
                            thought: accumulatedThought,
                            content: ''
                        }, false);
                    }
                }

                // Final processing to catch complete JSON or fallback
                if (isJsonDetected) {
                    // Try to clean up markdown blocks if present
                    const cleanJson = fullText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                    try {
                        const lastBrace = cleanJson.lastIndexOf('}');
                        if (lastBrace === -1) throw new Error("No closing brace found");

                        const validJsonStr = cleanJson.substring(0, lastBrace + 1);
                        const toolCall = JSON.parse(validJsonStr);

                        const { executeTool } = await import('../utils/documentTools');
                        const result = executeTool(toolCall.tool, toolCall, documentContent);

                        if (result.success) {
                            if (toolCall.tool === 'reply') {
                                lastAction = 'none';
                                lastMessage = result.message;
                            } else {
                                // Now we apply to canvas
                                // executeTool acts on the *original* documentContent and returns the FULL new HTML
                                lastAction = 'rewrite';
                                lastContent = result.newHtml || documentContent;
                                lastMessage = result.message;
                            }
                        } else {
                            lastMessage = result.message || 'Tool execution failed';
                        }
                    } catch (e) {
                        console.warn("Final JSON parse failed", e);
                        // Fallback: If parsing failed but we have text, assume it's a raw reply
                        if (fullText.trim().length > 0) {
                            lastMessage = fullText.replace(/```json/g, '').replace(/```/g, ''); // Strip markdown if stuck
                            lastAction = 'none';
                        } else {
                            lastMessage = "Error parsing AI response. Please try again.";
                            lastAction = 'none';
                        }
                    }
                } else {
                    lastMessage = fullText;
                    lastAction = 'none';
                }

                // Final flush
                onChunk({
                    action: lastAction,
                    message: lastMessage,
                    thought: accumulatedThought, // Persist thought in final update
                    content: lastContent,
                }, true);

            } catch (error) {
                if ((error as Error).name === 'AbortError') {
                    console.log('Stream aborted');
                } else {
                    console.error('Failed to agentic chat stream:', error);
                    throw error;
                }
            }
        },
        [ollamaUrl, selectedModel, temperature, topK, topP, contextDocuments, findRelevantChunks, generateSearchQueries]
    );

    // Process selected text with a command (streaming)
    // Now includes context documents for reference
    const processSelectionStream = useCallback(
        async (
            selectedText: string,
            command: string,
            onChunk: (chunk: string, done: boolean) => void,
            precedingContext?: string,
            signal?: AbortSignal
        ): Promise<void> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            // Get relevant context from documents if available
            let contextSection = '';
            if (contextDocuments.length > 0) {
                const relevantChunks = await findRelevantChunks(command, true);
                if (relevantChunks.length > 0) {
                    const docNames = contextDocuments.map(d => d.name).join(', ');
                    const contextText = relevantChunks.slice(0, 3).map(c => `[${c.source}]: ${c.text.slice(0, 300)}...`).join('\n\n');
                    contextSection = `\nReference materials available: ${docNames}\n\nRelevant excerpts:\n${contextText}\n\n`;
                }
            }

            const prompt = `
You are helping edit a document. The user has selected the following text and wants you to "${command}".
${contextSection}
${precedingContext ? `Context (text before the selection):\n"""${precedingContext}"""\n\n` : ''}
Selected text to modify:
"""${selectedText}"""

Command: ${command}

IMPORTANT: You are writing for a Rich Text Editor.
- Use HTML formatting for styling: <b>bold</b>, <i>italic</i>, <ul><li>lists</li></ul>, <h1>headings</h1>, etc.
- If the user asks for a specific format (e.g., table, list), provide it.
- Respond ONLY with the modified text/content. Do not include conversational filler or explanations.
`.trim();

            try {
                const response = await fetch(`${ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    signal,
                    body: JSON.stringify({
                        model: selectedModel,
                        prompt,
                        stream: true,
                        options: getOptions(),
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No reader available');

                const decoder = new TextDecoder();
                let fullResponse = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const data: OllamaGenerateResponse = JSON.parse(line);
                            fullResponse += data.response;

                            // Clean up response on final chunk
                            let cleanedResponse = fullResponse.trim();
                            if (data.done) {
                                // Remove surrounding quotes if present
                                if ((cleanedResponse.startsWith('"') && cleanedResponse.endsWith('"')) ||
                                    (cleanedResponse.startsWith("'") && cleanedResponse.endsWith("'"))) {
                                    cleanedResponse = cleanedResponse.slice(1, -1);
                                }
                                // Remove markdown code blocks if present
                                if (cleanedResponse.startsWith('```') && cleanedResponse.endsWith('```')) {
                                    cleanedResponse = cleanedResponse.slice(3, -3).trim();
                                    const newlineIndex = cleanedResponse.indexOf('\n');
                                    if (newlineIndex > 0 && newlineIndex < 20) {
                                        cleanedResponse = cleanedResponse.slice(newlineIndex + 1);
                                    }
                                }
                            }
                            onChunk(cleanedResponse, data.done);
                        } catch {
                            // Ignore parse errors for incomplete JSON
                        }
                    }
                }
            } catch (error) {
                console.error('Failed to process selection stream:', error);
                throw error;
            }
        },
        [ollamaUrl, selectedModel, temperature, topK, topP, contextDocuments, findRelevantChunks]
    );

    // Check if Ollama is running
    const checkConnection = useCallback(async (): Promise<boolean> => {
        try {
            const response = await fetch(`${ollamaUrl}/api/tags`, {
                method: 'GET',
                ...(import.meta.env.PROD ? { headers: { 'Origin': 'http://localhost' } } : {}),
            });
            const isConnected = response.ok;
            setOllamaConnected(isConnected);
            return isConnected;
        } catch {
            setOllamaConnected(false);
            return false;
        }
    }, [ollamaUrl, setOllamaConnected]);

    return {
        fetchModels,
        generateStream,
        chatStream,
        agenticChat,
        agenticChatStream,
        processSelectionStream,
        checkConnection,
    };
}

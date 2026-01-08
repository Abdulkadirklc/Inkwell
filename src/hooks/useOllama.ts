import { useCallback } from 'react';
import { useAppStore, OllamaModel } from '../store/appStore';

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
    action: 'replace_all' | 'insert' | 'append' | 'none';
    content?: string;
    message: string;
}

export function useOllama() {
    const {
        ollamaUrl,
        selectedModel,
        systemPrompt,
        temperature,
        topK,
        topP,
        setAvailableModels,
        setOllamaConnected,
        setSelectedModel,
    } = useAppStore();

    // Common options for all requests
    const getOptions = (tempOverride?: number) => ({
        temperature: tempOverride ?? temperature,
        top_k: topK,
        top_p: topP,
    });

    // Fetch available models from Ollama
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

    // Generate response from Ollama with streaming
    const generateStream = useCallback(
        async (
            prompt: string,
            onChunk: (chunk: string, done: boolean) => void,
            context?: string
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

    // Chat with Ollama with streaming
    const chatStream = useCallback(
        async (
            messages: OllamaChatMessage[],
            onChunk: (chunk: string, done: boolean) => void
        ): Promise<void> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            // Add system prompt to the beginning
            const fullMessages: OllamaChatMessage[] = [
                { role: 'system', content: systemPrompt },
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
                            const data = JSON.parse(line);
                            if (data.message?.content) {
                                fullResponse += data.message.content;
                                onChunk(fullResponse, data.done || false);
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
        [ollamaUrl, selectedModel, systemPrompt, temperature, topK, topP]
    );

    // Agentic chat - can make edits to the document (non-streaming for JSON parsing)
    const agenticChat = useCallback(
        async (messages: OllamaChatMessage[], documentContent: string): Promise<AgenticResponse> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            const agenticSystemPrompt = `${systemPrompt}

You are an AI writing assistant with the ability to edit the user's document. 
You have access to the current document content and can modify it based on user requests.

When the user asks you to make changes to the document, respond with a JSON object in this format:
{
  "action": "replace_all" | "insert" | "append" | "none",
  "content": "the new content (only if action is not 'none')",
  "message": "A brief explanation of what you did or your response to the user"
}

Actions:
- "replace_all": Replace the entire document with new content
- "insert": (future) Insert content at a specific position
- "append": Add content at the end of the document
- "none": Just respond without making changes (for questions/discussions)

Current document content:
"""
${documentContent}
"""

Always respond with valid JSON only. No markdown, no extra text.`;

            const fullMessages: OllamaChatMessage[] = [
                { role: 'system', content: agenticSystemPrompt },
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
                        options: getOptions(0.3), // Lower temp for more consistent JSON
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const content = data.message?.content || '';

                // Try to parse JSON response
                try {
                    // Extract JSON from response (in case there's extra text)
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
                    // If JSON parsing fails, treat as regular response
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
        [ollamaUrl, selectedModel, systemPrompt, temperature, topK, topP]
    );

    // Process selected text with a command (streaming)
    const processSelectionStream = useCallback(
        async (
            selectedText: string,
            command: string,
            onChunk: (chunk: string, done: boolean) => void,
            precedingContext?: string
        ): Promise<void> => {
            if (!selectedModel) {
                throw new Error('No model selected');
            }

            const prompt = `
You are helping edit a document. The user has selected the following text and wants you to "${command}".

${precedingContext ? `Context (text before the selection):\n"""${precedingContext}"""\n\n` : ''}
Selected text to modify:
"""${selectedText}"""

Command: ${command}

IMPORTANT: Respond ONLY with the modified text. Do not include any explanations, quotes, or markdown formatting. The response will directly replace the selected text.
`.trim();

            try {
                const response = await fetch(`${ollamaUrl}/api/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(import.meta.env.PROD ? { 'Origin': 'http://localhost' } : {}),
                    },
                    body: JSON.stringify({
                        model: selectedModel,
                        prompt,
                        stream: true,
                        options: getOptions(Math.max(0.3, temperature - 0.2)),
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
        [ollamaUrl, selectedModel, temperature, topK, topP]
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
        processSelectionStream,
        checkConnection,
    };
}

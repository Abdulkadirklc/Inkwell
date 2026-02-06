import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TextChunk } from '../utils/textChunker';

export interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isEdit?: boolean;
    isStreaming?: boolean;
    thought?: string; // Reasoning process
    usedChunks?: TextChunk[]; // Track used chunks for citation
}

export interface Document {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ContextDocument {
    id: string;
    name: string;
    content: string;
    chunks: TextChunk[];
    createdAt: Date;
}

export type ThemeMode = 'dark' | 'light';

interface AppState {
    // Theme
    theme: ThemeMode;

    // Ollama settings
    ollamaUrl: string;
    selectedModel: string;
    embeddingModel: string;
    availableModels: OllamaModel[];
    systemPrompt: string;
    temperature: number | undefined; // Allow undefined to use model default
    topK: number | undefined;
    topP: number | undefined;
    isOllamaConnected: boolean;

    // Chat
    chatMessages: ChatMessage[];
    isChatLoading: boolean;
    agenticMode: boolean;

    // Context / RAG
    contextDocuments: ContextDocument[];
    isContextLoading: boolean;

    // Document
    currentDocument: Document | null;
    documentContent: string;

    // UI State
    sidebarTab: 'settings' | 'chat' | 'context';
    sidebarCollapsed: boolean;
    isProcessing: boolean;

    // Actions
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
    setOllamaUrl: (url: string) => void;
    setSelectedModel: (model: string) => void;
    setEmbeddingModel: (model: string) => void;
    setAvailableModels: (models: OllamaModel[]) => void;
    setSystemPrompt: (prompt: string) => void;
    setTemperature: (temp: number | undefined) => void; // Update setter
    setTopK: (k: number | undefined) => void;
    setTopP: (p: number | undefined) => void;
    setOllamaConnected: (connected: boolean) => void;
    addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
    updateChatMessage: (id: string, content: string, isStreaming?: boolean, usedChunks?: TextChunk[], isEdit?: boolean, thought?: string) => void;
    clearChatMessages: () => void;
    setChatLoading: (loading: boolean) => void;
    setAgenticMode: (enabled: boolean) => void;

    // Context Actions
    addContextDocument: (doc: ContextDocument) => void;
    removeContextDocument: (id: string) => void;
    setContextLoading: (loading: boolean) => void;

    setDocumentContent: (content: string) => void;
    setCurrentDocument: (doc: Document | null) => void;
    setSidebarTab: (tab: 'settings' | 'chat' | 'context') => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleSidebar: () => void;
    setProcessing: (processing: boolean) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            // Initial state
            theme: 'dark',
            ollamaUrl: 'http://127.0.0.1:11434',
            selectedModel: '',
            embeddingModel: '',
            availableModels: [],
            systemPrompt: 'You are a helpful AI writing assistant. Help the user improve their writing, fix grammar, expand ideas, and refine their content. Be concise and professional.',
            temperature: undefined, // Use model default
            topK: 40,
            topP: 0.9,
            isOllamaConnected: false,

            chatMessages: [],
            isChatLoading: false,
            agenticMode: false,

            contextDocuments: [],
            isContextLoading: false,

            currentDocument: null,
            documentContent: '',

            sidebarTab: 'settings',
            sidebarCollapsed: false,
            isProcessing: false,

            // Actions
            setTheme: (theme) => set({ theme }),
            toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
            setOllamaUrl: (url) => set({ ollamaUrl: url }),
            setSelectedModel: (model) => set({ selectedModel: model }),
            setEmbeddingModel: (model) => set({ embeddingModel: model }),
            setAvailableModels: (models) => set({ availableModels: models }),
            setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
            setTemperature: (temp) => set({ temperature: temp }),
            setTopK: (k) => set({ topK: k }),
            setTopP: (p) => set({ topP: p }),
            setOllamaConnected: (connected) => set({ isOllamaConnected: connected }),

            addChatMessage: (message) => set((state) => ({
                chatMessages: [
                    ...state.chatMessages,
                    {
                        ...message,
                        id: crypto.randomUUID(),
                        timestamp: new Date(),
                    },
                ],
            })),
            updateChatMessage: (id, content, isStreaming, usedChunks, isEdit, thought) => set((state) => ({
                chatMessages: state.chatMessages.map((msg) =>
                    msg.id === id ? {
                        ...msg,
                        content,
                        isStreaming: isStreaming ?? msg.isStreaming,
                        usedChunks: usedChunks ?? msg.usedChunks,
                        isEdit: isEdit ?? msg.isEdit,
                        thought: thought ?? msg.thought // Preserve existing thought if new value is undefined
                    } : msg
                ),
            })),
            clearChatMessages: () => set({ chatMessages: [] }),
            setChatLoading: (loading) => set({ isChatLoading: loading }),
            setAgenticMode: (enabled) => set({ agenticMode: enabled }),

            addContextDocument: (doc) => set((state) => ({
                contextDocuments: [...state.contextDocuments, doc]
            })),
            removeContextDocument: (id) => set((state) => ({
                contextDocuments: state.contextDocuments.filter((d) => d.id !== id)
            })),
            setContextLoading: (loading) => set({ isContextLoading: loading }),

            setDocumentContent: (content) => set({ documentContent: content }),
            setCurrentDocument: (doc) => set({ currentDocument: doc }),

            setSidebarTab: (tab) => set({ sidebarTab: tab }),
            setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
            toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            setProcessing: (processing) => set({ isProcessing: processing }),
        }),
        {
            name: 'inkwell-storage',
            partialize: (state) => ({
                theme: state.theme,
                ollamaUrl: state.ollamaUrl,
                selectedModel: state.selectedModel,
                systemPrompt: state.systemPrompt,
                temperature: state.temperature,
                topK: state.topK,
                topP: state.topP,
                agenticMode: state.agenticMode,
                embeddingModel: state.embeddingModel,
                sidebarCollapsed: state.sidebarCollapsed,
                // Do not persist contextDocuments to avoid quota limits
            }),
        }
    )
);

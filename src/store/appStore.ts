import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
    isEdit?: boolean; // Whether this message made an edit to the document
    isStreaming?: boolean; // Whether this message is currently streaming
}

export interface Document {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ThemeMode = 'dark' | 'light';

interface AppState {
    // Theme
    theme: ThemeMode;

    // Ollama settings
    ollamaUrl: string;
    selectedModel: string;
    availableModels: OllamaModel[];
    systemPrompt: string;
    temperature: number;
    topK: number;
    topP: number;
    isOllamaConnected: boolean;

    // Chat
    chatMessages: ChatMessage[];
    isChatLoading: boolean;
    agenticMode: boolean; // Whether chat can edit the document

    // Document
    currentDocument: Document | null;
    documentContent: string;

    // UI State
    sidebarTab: 'settings' | 'chat';
    sidebarCollapsed: boolean;
    isProcessing: boolean;

    // Actions
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
    setOllamaUrl: (url: string) => void;
    setSelectedModel: (model: string) => void;
    setAvailableModels: (models: OllamaModel[]) => void;
    setSystemPrompt: (prompt: string) => void;
    setTemperature: (temp: number) => void;
    setTopK: (k: number) => void;
    setTopP: (p: number) => void;
    setOllamaConnected: (connected: boolean) => void;
    addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
    updateChatMessage: (id: string, content: string, isStreaming?: boolean) => void;
    clearChatMessages: () => void;
    setChatLoading: (loading: boolean) => void;
    setAgenticMode: (enabled: boolean) => void;
    setDocumentContent: (content: string) => void;
    setCurrentDocument: (doc: Document | null) => void;
    setSidebarTab: (tab: 'settings' | 'chat') => void;
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
            availableModels: [],
            systemPrompt: 'You are a helpful AI writing assistant. Help the user improve their writing, fix grammar, expand ideas, and refine their content. Be concise and professional.',
            temperature: 0.7,
            topK: 40,
            topP: 0.9,
            isOllamaConnected: false,

            chatMessages: [],
            isChatLoading: false,
            agenticMode: false,

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
            updateChatMessage: (id, content, isStreaming) => set((state) => ({
                chatMessages: state.chatMessages.map((msg) =>
                    msg.id === id ? { ...msg, content, isStreaming } : msg
                ),
            })),
            clearChatMessages: () => set({ chatMessages: [] }),
            setChatLoading: (loading) => set({ isChatLoading: loading }),
            setAgenticMode: (enabled) => set({ agenticMode: enabled }),

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
                sidebarCollapsed: state.sidebarCollapsed,
            }),
        }
    )
);

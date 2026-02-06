import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Settings,
    MessageSquare,
    RefreshCw,
    Send,
    Trash2,
    CheckCircle,
    XCircle,
    Thermometer,
    Bot,
    FileText,
    Sparkles,
    Zap,
    Edit3,
    ToggleLeft,
    ToggleRight,
    ChevronLeft,
    ChevronRight,
    Sliders,
    Moon,
    Sun,
    Square,
    Library,
    Plus,
    ChevronDown,
} from 'lucide-react';
import { parseFile } from '../utils/fileParser';
import { chunkText } from '../utils/textChunker';
import { useAppStore, ChatMessage } from '../store/appStore';
import { useOllama } from '../hooks/useOllama';

interface SidebarProps {
    documentContent: string;
    onDocumentChange?: (newContent: string) => void;
}

export default function Sidebar({ documentContent, onDocumentChange }: SidebarProps) {
    const {
        theme,
        toggleTheme,
        sidebarTab,
        setSidebarTab,
        sidebarCollapsed,
        toggleSidebar,
        selectedModel,
        setSelectedModel,
        availableModels,
        systemPrompt,
        setSystemPrompt,
        temperature,
        setTemperature,
        topK,
        setTopK,
        topP,
        setTopP,
        isOllamaConnected,
        chatMessages,
        addChatMessage,
        updateChatMessage,
        clearChatMessages,
        isChatLoading,
        setChatLoading,
        agenticMode,
        setAgenticMode,
        ollamaUrl,
        setOllamaUrl,
        contextDocuments,
        addContextDocument,
        removeContextDocument,
        isContextLoading,
        setContextLoading,
        embeddingModel,
        setEmbeddingModel,
    } = useAppStore();

    const { fetchModels, chatStream, agenticChatStream, checkConnection } = useOllama();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const streamingMessageIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const isDark = theme === 'dark';

    // Check connection and fetch models on mount
    useEffect(() => {
        const init = async () => {
            await checkConnection();
            try {
                await fetchModels();
            } catch (error) {
                console.error('Failed to fetch models on init:', error);
            }
        };
        init();
    }, [checkConnection, fetchModels]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    const handleRefreshModels = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await fetchModels();
        } catch (error) {
            console.error('Failed to refresh models:', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [fetchModels]);

    const handleStopChat = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setChatLoading(false);
            streamingMessageIdRef.current = null;
        }
    }, [setChatLoading]);

    const handleSendChat = useCallback(async () => {
        if (!chatInput.trim() || isChatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput('');
        addChatMessage({ role: 'user', content: userMessage });
        setChatLoading(true);

        // Reset and create new abort controller
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        try {
            if (agenticMode) {
                // Agentic mode - STREAMING document edits
                const messages = chatMessages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));
                messages.push({ role: 'user', content: userMessage });

                // Initial AI status
                const placeholderMessage = {
                    role: 'assistant' as const,
                    content: 'Thinking...',
                    isStreaming: true,
                };
                addChatMessage(placeholderMessage);

                // Get ID
                const currentMessages = useAppStore.getState().chatMessages;
                const lastMessage = currentMessages[currentMessages.length - 1];
                streamingMessageIdRef.current = lastMessage.id;

                await agenticChatStream(messages, documentContent, (response, done) => {
                    if (streamingMessageIdRef.current) {
                        // Determine if this is an editing action
                        const isEditAction = response.action !== 'none';

                        // Update chat bubble
                        updateChatMessage(
                            streamingMessageIdRef.current,
                            response.message || 'Processing...',
                            !done,
                            undefined,
                            isEditAction, // Pass the edit flag
                            response.thought // Pass the thought for toggle UI
                        );

                        // Apply document changes - stream directly to canvas
                        if (onDocumentChange && response.content) {
                            if (response.action === 'rewrite') {
                                onDocumentChange(response.content);
                            } else if (response.action === 'append') {
                                onDocumentChange(documentContent + response.content);
                            } else if (response.action === 'edit') {
                                onDocumentChange(response.content);
                            }
                        }
                    }
                }, abortControllerRef.current?.signal);

                streamingMessageIdRef.current = null;
            } else {
                // Regular chat mode - STREAMING
                const contextMessage = documentContent
                    ? `Current document content:\n"""${documentContent}"""\n\n`
                    : '';

                const messages = chatMessages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));

                const messagesWithContext = [
                    ...messages,
                    {
                        role: 'user' as const,
                        content: contextMessage + userMessage,
                    },
                ];

                // Create placeholder message for streaming
                const placeholderMessage = {
                    role: 'assistant' as const,
                    content: '',
                    isStreaming: true,
                };
                addChatMessage(placeholderMessage);

                // Get the ID of the last message (our placeholder)
                const currentMessages = useAppStore.getState().chatMessages;
                const lastMessage = currentMessages[currentMessages.length - 1];
                streamingMessageIdRef.current = lastMessage.id;

                // Stream the response
                await chatStream(messagesWithContext, (chunk, done, usedChunks) => {
                    if (streamingMessageIdRef.current) {
                        updateChatMessage(streamingMessageIdRef.current, chunk, !done, usedChunks);
                    }
                }, abortControllerRef.current.signal);

                streamingMessageIdRef.current = null;
            }
        } catch (error) {
            console.error('Chat failed:', error);
            addChatMessage({
                role: 'assistant',
                content: 'Sorry, I encountered an error. Please check if Ollama is running.',
            });
        } finally {
            setChatLoading(false);
            abortControllerRef.current = null;
        }
    }, [chatInput, isChatLoading, agenticMode, documentContent, chatMessages, addChatMessage, updateChatMessage, setChatLoading, chatStream, agenticChatStream, onDocumentChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    };

    // Collapsed sidebar view
    if (sidebarCollapsed) {
        return (
            <div className={`w-12 h-full flex flex-col items-center py-4 rounded-xl no-print transition-colors ${isDark ? 'glass-dark' : 'bg-white/90 backdrop-blur border border-gray-200'
                }`}>
                <button
                    onClick={toggleSidebar}
                    className={`p-2 rounded-lg transition-colors mb-4 ${isDark
                        ? 'text-gray-400 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title="Expand Sidebar"
                >
                    <ChevronRight size={18} />
                </button>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center mb-4">
                    <Sparkles size={16} className="text-white" />
                </div>
                <div className="flex-1 flex flex-col items-center gap-2">
                    <button
                        onClick={() => { toggleSidebar(); setSidebarTab('settings'); }}
                        className={`p-2 rounded-lg transition-colors ${sidebarTab === 'settings'
                            ? 'text-purple-400 bg-purple-500/10'
                            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Settings"
                    >
                        <Settings size={18} />
                    </button>
                    <button
                        onClick={() => { toggleSidebar(); setSidebarTab('chat'); }}
                        className={`p-2 rounded-lg transition-colors ${sidebarTab === 'chat'
                            ? 'text-purple-400 bg-purple-500/10'
                            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Chat"
                    >
                        <MessageSquare size={18} />
                    </button>
                    <button
                        onClick={() => { toggleSidebar(); setSidebarTab('context'); }}
                        className={`p-2 rounded-lg transition-colors ${sidebarTab === 'context'
                            ? 'text-purple-400 bg-purple-500/10'
                            : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        title="Context Library"
                    >
                        <Library size={18} />
                    </button>
                </div>
                <div className="mt-auto flex flex-col gap-2 items-center">
                    <button
                        onClick={toggleTheme}
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {isDark ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    {isOllamaConnected ? (
                        <CheckCircle size={16} className="text-emerald-400" />
                    ) : (
                        <XCircle size={16} className="text-red-400" />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`w-80 h-full flex flex-col rounded-xl overflow-hidden no-print transition-colors ${isDark ? 'glass-dark' : 'bg-white/90 backdrop-blur border border-gray-200'
            }`}>
            {/* Header with Logo */}
            <div className={`p-4 border-b ${isDark ? 'border-purple-500/10' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center">
                            <Sparkles size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className={`text-lg font-semibold ${isDark ? 'gradient-text' : 'text-gray-900'}`}>
                                Inkwell
                            </h1>
                            <div className="flex items-center gap-1.5 text-xs">
                                {isOllamaConnected ? (
                                    <>
                                        <CheckCircle size={12} className="text-emerald-400" />
                                        <span className="text-emerald-500">Connected</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle size={12} className="text-red-400" />
                                        <span className="text-red-500">Disconnected</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={toggleTheme}
                            className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {isDark ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <button
                            onClick={toggleSidebar}
                            className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                            title="Collapse Sidebar"
                        >
                            <ChevronLeft size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className={`flex border-b ${isDark ? 'border-purple-500/10' : 'border-gray-200'}`}>
                <button
                    onClick={() => setSidebarTab('settings')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${sidebarTab === 'settings'
                        ? 'text-purple-500 border-b-2 border-purple-500 bg-purple-500/5'
                        : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <Settings size={16} />
                    Settings
                </button>
                <button
                    onClick={() => setSidebarTab('chat')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${sidebarTab === 'chat'
                        ? 'text-purple-500 border-b-2 border-purple-500 bg-purple-500/5'
                        : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <MessageSquare size={16} />
                    Chat
                </button>
                <button
                    onClick={() => setSidebarTab('context')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all ${sidebarTab === 'context'
                        ? 'text-purple-500 border-b-2 border-purple-500 bg-purple-500/5'
                        : isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'
                        }`}
                >
                    <Library size={16} />
                    Context
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
                {sidebarTab === 'settings' ? (
                    <SettingsTab
                        isDark={isDark}
                        selectedModel={selectedModel}
                        setSelectedModel={setSelectedModel}
                        availableModels={availableModels}
                        systemPrompt={systemPrompt}
                        setSystemPrompt={setSystemPrompt}
                        temperature={temperature}
                        setTemperature={setTemperature}
                        topK={topK}
                        setTopK={setTopK}
                        topP={topP}
                        setTopP={setTopP}
                        isRefreshing={isRefreshing}
                        onRefresh={handleRefreshModels}
                        ollamaUrl={ollamaUrl}
                        setOllamaUrl={setOllamaUrl}
                    />
                ) : sidebarTab === 'context' ? (
                    <ContextTab
                        isDark={isDark}
                        contextDocuments={contextDocuments}
                        onAddDocument={addContextDocument}
                        onRemoveDocument={removeContextDocument}
                        isLoading={isContextLoading}
                        setLoading={setContextLoading}
                        availableModels={availableModels}
                        embeddingModel={embeddingModel}
                        setEmbeddingModel={setEmbeddingModel}
                    />
                ) : (
                    <ChatTab
                        isDark={isDark}
                        chatMessages={chatMessages}
                        chatInput={chatInput}
                        setChatInput={setChatInput}
                        isChatLoading={isChatLoading}
                        onSend={handleSendChat}
                        onClear={clearChatMessages}
                        onKeyDown={handleKeyDown}
                        chatContainerRef={chatContainerRef}
                        isConnected={isOllamaConnected}
                        agenticMode={agenticMode}
                        setAgenticMode={setAgenticMode}
                        onStop={handleStopChat}
                    />
                )}
            </div>
        </div>
    );
}

interface SettingsTabProps {
    isDark: boolean;
    ollamaUrl: string;
    setOllamaUrl: (url: string) => void;
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    availableModels: Array<{ name: string; size: number }>;
    systemPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    temperature: number | undefined;
    setTemperature: (temp: number | undefined) => void;
    topK: number | undefined;
    setTopK: (k: number | undefined) => void;
    topP: number | undefined;
    setTopP: (p: number | undefined) => void;
    isRefreshing: boolean;
    onRefresh: () => void;
}

function SettingsTab({
    isDark,
    ollamaUrl,
    setOllamaUrl,
    selectedModel,
    setSelectedModel,
    availableModels,
    systemPrompt,
    setSystemPrompt,
    temperature,
    setTemperature,
    topK,
    setTopK,
    topP,
    setTopP,
    isRefreshing,
    onRefresh,
}: SettingsTabProps) {
    const [showAdvanced, setShowAdvanced] = useState(false);

    return (
        <div className="p-4 space-y-5">
            {/* ... (Ollama URL and Model Selection omitted for brevity if unchanged, but need to be careful with replace_file_content context) ... */}
            {/* Ollama URL */}
            <div className="space-y-2">
                <label className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <Zap size={16} className="text-purple-500" />
                    Ollama URL
                </label>
                <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    onBlur={onRefresh} // Refresh models when URL changes
                    className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${isDark
                        ? 'bg-surface-300/50 border border-purple-500/20 text-white placeholder-gray-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                        }`}
                    placeholder="http://localhost:11434"
                />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Bot size={16} className="text-purple-500" />
                        AI Model
                    </label>
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                        title="Refresh models"
                    >
                        <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
                <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none cursor-pointer ${isDark
                        ? 'bg-surface-300/50 border border-purple-500/20 text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-900'
                        }`}
                >
                    {availableModels.length === 0 ? (
                        <option value="">No models found</option>
                    ) : (
                        availableModels.map((model) => (
                            <option key={model.name} value={model.name}>
                                {model.name} ({formatBytes(model.size)})
                            </option>
                        ))
                    )}
                </select>
            </div>

            {/* Temperature & Parameters Reset */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Thermometer size={16} className="text-purple-500" />
                        Temperature: {temperature !== undefined ? temperature.toFixed(1) : 'Default'}
                    </label>
                    {(temperature !== undefined || topK !== 40 || topP !== 0.9) && (
                        <button
                            onClick={() => {
                                setTemperature(undefined);
                                setTopK(undefined);
                                setTopP(undefined);
                            }}
                            className="text-xs text-purple-500 hover:text-purple-600 underline"
                            title="Reset all to model defaults"
                        >
                            Reset
                        </button>
                    )}
                </div>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature ?? 0.7}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-300 dark:bg-surface-300 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className={`flex justify-between text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <span>Precise</span>
                    <span>Creative</span>
                </div>
            </div>

            {/* Advanced Sampling Parameters */}
            <div className="space-y-3">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <Sliders size={14} />
                    Advanced Sampling
                    <ChevronRight size={14} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                </button>

                {showAdvanced && (
                    <div className={`space-y-4 pl-2 border-l-2 ${isDark ? 'border-purple-500/20' : 'border-purple-200'}`}>
                        {/* Top K */}
                        <div className="space-y-2">
                            <label className={`text-xs font-medium flex items-center justify-between ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <span>Top K: {topK ?? 'Default'}</span>
                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>1-100</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                step="1"
                                value={topK ?? 40}
                                onChange={(e) => setTopK(parseInt(e.target.value))}
                                className="w-full h-1.5 bg-gray-300 dark:bg-surface-300 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Limits token selection to top K candidates
                            </p>
                        </div>

                        {/* Top P */}
                        <div className="space-y-2">
                            <label className={`text-xs font-medium flex items-center justify-between ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <span>Top P: {topP !== undefined ? topP.toFixed(2) : 'Default'}</span>
                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>0-1</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={topP ?? 0.9}
                                onChange={(e) => setTopP(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-gray-300 dark:bg-surface-300 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Nucleus sampling probability threshold
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
                <label className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <FileText size={16} className="text-purple-500" />
                    System Prompt
                </label>
                <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={5}
                    className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none ${isDark
                        ? 'bg-surface-300/50 border border-purple-500/20 text-white placeholder-gray-500'
                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                        }`}
                    placeholder="Instructions for the AI assistant..."
                />
            </div>

            {/* Quick Tips */}
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-purple-500/10 border-purple-500/20' : 'bg-purple-50 border-purple-100'
                }`}>
                <h4 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? 'text-purple-300' : 'text-purple-600'
                    }`}>
                    Quick Tips
                </h4>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <li>• Select text and click "AI Magic" to transform it</li>
                    <li>• Enable Agentic Mode in Chat to let AI edit your document</li>
                    <li>• Lower temperature = more predictable responses</li>
                    <li>• Higher Top K/P = more diverse word choices</li>
                </ul>
            </div>
        </div>
    );
}

interface ChatTabProps {
    isDark: boolean;
    chatMessages: ChatMessage[];
    chatInput: string;
    setChatInput: (value: string) => void;
    isChatLoading: boolean;
    onSend: () => void;
    onClear: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    chatContainerRef: React.RefObject<HTMLDivElement>;
    isConnected: boolean;
    agenticMode: boolean;
    setAgenticMode: (enabled: boolean) => void;
    onStop: () => void;
}

function ChatTab({
    isDark,
    chatMessages,
    chatInput,
    setChatInput,
    isChatLoading,
    onSend,
    onClear,
    onKeyDown,
    chatContainerRef,
    isConnected,
    agenticMode,
    setAgenticMode,
    onStop,
}: ChatTabProps) {
    return (
        <div className="flex flex-col h-full">
            {/* Chat Header with Agentic Mode Toggle */}
            <div className={`p-3 border-b ${isDark ? 'border-purple-500/10' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {agenticMode ? 'AI can edit your document' : 'Read-only mode'}
                    </span>
                    <button
                        onClick={onClear}
                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                        title="Clear chat"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
                <button
                    onClick={() => setAgenticMode(!agenticMode)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all ${agenticMode
                        ? 'bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-500/30 text-amber-500'
                        : isDark
                            ? 'bg-surface-300/50 border border-purple-500/20 text-gray-400 hover:text-gray-300'
                            : 'bg-gray-50 border border-gray-200 text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        {agenticMode ? <Zap size={16} /> : <Edit3 size={16} />}
                        <span>Agentic Mode</span>
                    </div>
                    {agenticMode ? (
                        <ToggleRight size={20} className="text-amber-500" />
                    ) : (
                        <ToggleLeft size={20} />
                    )}
                </button>
                {agenticMode && (
                    <p className="text-xs text-amber-500/70 mt-2">
                        ⚠️ AI can modify your document directly
                    </p>
                )}
            </div>

            {/* Messages */}
            <div
                ref={chatContainerRef}
                className="flex-1 overflow-auto p-4 space-y-4"
            >
                {chatMessages.length === 0 ? (
                    <div className={`text-center text-sm py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
                        <p>No messages yet.</p>
                        <p className="text-xs mt-1">
                            {agenticMode
                                ? 'Ask AI to edit your document!'
                                : 'Ask questions about your document!'}
                        </p>
                    </div>
                ) : (
                    chatMessages.map((msg) => (
                        <div key={msg.id} className="space-y-1">
                            <div
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.isStreaming && !msg.content ? (
                                    <div className={`px-4 py-3 rounded-xl rounded-bl-sm flex items-center gap-1 ${isDark ? 'bg-surface-200' : 'bg-gray-100'
                                        }`}>
                                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce"></div>
                                    </div>
                                ) : (
                                    <div
                                        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${msg.role === 'user'
                                            ? 'bg-purple-600 text-white rounded-br-sm'
                                            : msg.isEdit
                                                ? 'bg-amber-600/20 text-amber-300 rounded-bl-sm border border-amber-500/30'
                                                : isDark
                                                    ? 'bg-surface-200 text-gray-200 rounded-bl-sm'
                                                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                            }`}
                                    >
                                        {msg.thought && msg.thought.trim().length > 0 && (
                                            <div className="mb-2 border-b border-black/10 dark:border-white/10 pb-2">
                                                <details className="group" open>
                                                    <summary className="list-none cursor-pointer flex items-center gap-1.5 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity select-none">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></div>
                                                        Thinking Process
                                                        <ChevronDown size={12} className="group-open:rotate-180 transition-transform" />
                                                    </summary>
                                                    <div className="mt-2 text-xs opacity-90 whitespace-pre-wrap pl-2 border-l-2 border-black/10 dark:border-white/10 font-mono bg-black/5 dark:bg-white/5 p-2 rounded">
                                                        {msg.thought}
                                                    </div>
                                                </details>
                                            </div>
                                        )}
                                        <p className="whitespace-pre-wrap">
                                            {msg.isEdit && (
                                                <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium mb-1 border-b border-amber-500/20 pb-1 w-full block">
                                                    <Edit3 size={12} />
                                                    <span>Snippet Edited</span>
                                                </span>
                                            )}
                                            {msg.content}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {msg.usedChunks && msg.usedChunks.length > 0 && (
                                <div className="flex justify-start px-3">
                                    <div className={`text-[10px] p-2 rounded-lg border max-w-[85%] ${isDark ? 'bg-surface-300/30 border-white/10 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                        <div className="font-semibold mb-1 flex items-center gap-1">
                                            <Library size={10} />
                                            Sources Used:
                                        </div>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            {[...new Set(msg.usedChunks.map(c => c.source))].map((source, i) => (
                                                <li key={i} className="truncate">{source}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Input */}
            <div className={`p-3 border-t ${isDark ? 'border-purple-500/10' : 'border-gray-200'}`}>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={
                            isConnected
                                ? agenticMode
                                    ? "Tell AI what to change..."
                                    : "Ask about your document..."
                                : "Connect to Ollama first"
                        }
                        disabled={!isConnected || isChatLoading}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 ${isDark
                            ? 'bg-surface-300/50 border border-purple-500/20 text-white placeholder-gray-500'
                            : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                            }`}
                    />
                    {isChatLoading ? (
                        <button
                            onClick={onStop}
                            className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
                            title="Stop Generation"
                        >
                            <Square size={18} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            onClick={onSend}
                            disabled={!isConnected || isChatLoading || !chatInput.trim()}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${agenticMode
                                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                                }`}
                        >
                            <Send size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}

// ----------------------------------------------------------------------
// Context Tab Component
// ----------------------------------------------------------------------

interface ContextTabProps {
    isDark: boolean;
    contextDocuments: import('../store/appStore').ContextDocument[];
    onAddDocument: (doc: import('../store/appStore').ContextDocument) => void;
    onRemoveDocument: (id: string) => void;
    isLoading: boolean;
    setLoading: (loading: boolean) => void;
    availableModels: import('../store/appStore').OllamaModel[];
    embeddingModel: string;
    setEmbeddingModel: (model: string) => void;
}

function ContextTab({
    isDark,
    contextDocuments,
    onAddDocument,
    onRemoveDocument,
    isLoading,
    setLoading,
    availableModels,
    embeddingModel,
    setEmbeddingModel
}: ContextTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setLoading(true);
        const errors: string[] = [];

        try {
            // Process all selected files
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    // Parse
                    const content = await parseFile(file);

                    // Chunk
                    const chunks = chunkText(content, file.name);

                    // Store
                    onAddDocument({
                        id: crypto.randomUUID(),
                        name: file.name,
                        content,
                        chunks,
                        createdAt: new Date(),
                    });
                } catch (error) {
                    console.error(`Failed to process file ${file.name}:`, error);
                    errors.push(file.name);
                }
            }

            if (errors.length > 0) {
                alert(`Failed to process ${errors.length} file(s): ${errors.join(', ')}`);
            }
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Filter for likely embedding models
    const embeddingModels = availableModels.filter(m =>
        m.name.includes('embed') ||
        m.name.includes('nomic') ||
        m.name.includes('mxbai')
    );

    return (
        <div className="p-4 space-y-4 h-full flex flex-col">
            {/* Embedding Model Selector */}
            <div className={`p-3 rounded-lg border ${isDark ? 'bg-surface-300/30 border-white/5' : 'bg-gray-50 border-gray-200'}`}>
                <label className={`text-xs font-medium mb-2 block ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Embedding Model
                </label>
                <select
                    value={embeddingModel}
                    onChange={(e) => setEmbeddingModel(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${isDark
                        ? 'bg-surface-400/50 border border-purple-500/20 text-white'
                        : 'bg-white border border-gray-300 text-gray-900'
                        }`}
                >
                    <option value="">None (keyword search)</option>
                    {embeddingModels.length > 0 ? (
                        embeddingModels.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                        ))
                    ) : (
                        availableModels.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                        ))
                    )}
                </select>
                <p className={`text-[10px] mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {embeddingModel ? '🔮 Using vector similarity' : '🔤 Using keyword matching'}
                </p>
            </div>

            <div className={`p-4 rounded-xl border border-dashed text-center transition-colors ${isDark
                ? 'border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10'
                : 'border-purple-200 bg-purple-50 hover:bg-purple-100'
                }`}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.md,.pdf,.docx"
                    multiple
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className="flex flex-col items-center gap-2 w-full"
                >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-white text-purple-600 shadow-sm'
                        }`}>
                        {isLoading ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
                    </div>
                    <div>
                        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                            {isLoading ? 'Processing...' : 'Add Context Document'}
                        </p>
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            PDF, Word, or Text
                        </p>
                    </div>
                </button>
            </div>

            <div className="flex-1 overflow-auto space-y-2">
                {contextDocuments.length === 0 ? (
                    <div className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        <Library size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No documents added</p>
                        <p className="text-xs">Upload files to give the AI more context</p>
                    </div>
                ) : (
                    contextDocuments.map(doc => (
                        <div key={doc.id} className={`p-3 rounded-lg border flex items-center justify-between group ${isDark ? 'bg-surface-300/30 border-white/5' : 'bg-white border-gray-100 shadow-sm'
                            }`}>
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`p-2 rounded-lg ${isDark ? 'bg-surface-400/50' : 'bg-gray-100'}`}>
                                    <FileText size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                                </div>
                                <div className="min-w-0">
                                    <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        {doc.name}
                                    </p>
                                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                        {doc.chunks.length} chunks • {doc.content.length > 1000 ? (doc.content.length / 1024).toFixed(1) + ' KB' : doc.content.length + ' chars'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => onRemoveDocument(doc.id)}
                                className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isDark ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                                    }`}
                                title="Remove document"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

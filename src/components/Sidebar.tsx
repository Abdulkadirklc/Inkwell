import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Settings,
    MessageCircle,
    RefreshCw,
    Loader2,
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
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
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
    } = useAppStore();

    const { fetchModels, chatStream, agenticChat, checkConnection } = useOllama();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const streamingMessageIdRef = useRef<string | null>(null);

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

    const handleSendChat = useCallback(async () => {
        if (!chatInput.trim() || isChatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput('');
        addChatMessage({ role: 'user', content: userMessage });
        setChatLoading(true);

        try {
            if (agenticMode) {
                // Agentic mode - AI can edit the document (no streaming for JSON)
                const messages = chatMessages.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));
                messages.push({ role: 'user', content: userMessage });

                const response = await agenticChat(messages, documentContent);

                // If the AI wants to make changes, apply them
                if (response.action !== 'none' && response.content && onDocumentChange) {
                    if (response.action === 'replace_all') {
                        onDocumentChange(response.content);
                    } else if (response.action === 'append') {
                        onDocumentChange(documentContent + response.content);
                    }
                    addChatMessage({
                        role: 'assistant',
                        content: `✏️ ${response.message}`,
                        isEdit: true,
                    });
                } else {
                    addChatMessage({ role: 'assistant', content: response.message });
                }
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
                await chatStream(messagesWithContext, (chunk, done) => {
                    if (streamingMessageIdRef.current) {
                        updateChatMessage(streamingMessageIdRef.current, chunk, !done);
                    }
                });

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
        }
    }, [chatInput, isChatLoading, agenticMode, documentContent, chatMessages, addChatMessage, updateChatMessage, setChatLoading, chatStream, agenticChat, onDocumentChange]);

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
                        <MessageCircle size={18} />
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
                    <MessageCircle size={16} />
                    Chat
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
    temperature: number;
    setTemperature: (temp: number) => void;
    topK: number;
    setTopK: (k: number) => void;
    topP: number;
    setTopP: (p: number) => void;
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

            {/* Temperature */}
            <div className="space-y-2">
                <label className={`text-sm font-medium flex items-center gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    <Thermometer size={16} className="text-purple-500" />
                    Temperature: {temperature.toFixed(1)}
                </label>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={temperature}
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
                                <span>Top K: {topK}</span>
                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>1-100</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                step="1"
                                value={topK}
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
                                <span>Top P: {topP.toFixed(2)}</span>
                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>0-1</span>
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={topP}
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
    chatMessages: Array<{ id: string; role: string; content: string; isEdit?: boolean; isStreaming?: boolean }>;
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
                        <MessageCircle size={32} className="mx-auto mb-3 opacity-50" />
                        <p>No messages yet.</p>
                        <p className="text-xs mt-1">
                            {agenticMode
                                ? 'Ask AI to edit your document!'
                                : 'Ask questions about your document!'}
                        </p>
                    </div>
                ) : (
                    chatMessages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
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
                                <p className="whitespace-pre-wrap">
                                    {msg.content}
                                    {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-purple-400 animate-pulse" />}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                {isChatLoading && chatMessages.length > 0 && !chatMessages[chatMessages.length - 1]?.isStreaming && (
                    <div className="flex justify-start">
                        <div className={`px-4 py-3 rounded-xl rounded-bl-sm ${isDark ? 'bg-surface-200' : 'bg-gray-100'}`}>
                            <div className="typing-dots">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
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
                    <button
                        onClick={onSend}
                        disabled={!isConnected || isChatLoading || !chatInput.trim()}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${agenticMode
                            ? 'bg-amber-600 hover:bg-amber-500 text-white'
                            : 'bg-purple-600 hover:bg-purple-500 text-white'
                            }`}
                    >
                        {isChatLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </div>
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

import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor } from '@tiptap/react';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import { useAppStore } from './store/appStore';

function App() {
    const [documentContent, setDocumentContent] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
    const { theme } = useAppStore();

    const isDark = theme === 'dark';

    // Apply theme class to document
    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
    }, [isDark]);

    const handleContentChange = useCallback((content: string) => {
        setDocumentContent(content);
    }, []);

    const handleExportPdf = useCallback(() => {
        // Use browser's print functionality for PDF export
        window.print();
    }, []);

    const handleLoadContent = useCallback((content: string) => {
        if (editorRef.current) {
            editorRef.current.commands.setContent(content);
        }
        setDocumentContent(content);
    }, []);

    // Handle document changes from the Agentic Chat
    const handleDocumentChange = useCallback((newContent: string) => {
        if (editorRef.current) {
            editorRef.current.commands.setContent(newContent);
        }
        setDocumentContent(newContent);
    }, []);

    // Autosave to LocalStorage
    useEffect(() => {
        const interval = setInterval(() => {
            if (documentContent && documentContent.length > 10) {
                localStorage.setItem('inkwell_autosave', documentContent);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [documentContent]);

    // Restore on Load
    useEffect(() => {
        const saved = localStorage.getItem('inkwell_autosave');
        if (saved && !documentContent) {
            const checkAndRestore = () => {
                if (editorRef.current) {
                    editorRef.current.commands.setContent(saved);
                    setDocumentContent(saved);
                    return true;
                }
                return false;
            };

            if (!checkAndRestore()) {
                const interval = setInterval(() => {
                    if (checkAndRestore()) {
                        clearInterval(interval);
                    }
                }, 100);
                setTimeout(() => clearInterval(interval), 5000);
            }
        }
    }, []);

    // Close Confirmation Removed per user request (Autosave handles it)
    /* useEffect(() => { ... } */

    return (
        <div className={`h-screen flex flex-col overflow-hidden transition-colors duration-300 ${isDark
            ? 'bg-gradient-to-br from-[#0f0f1a] via-[#1a1a2e] to-[#16213e]'
            : 'bg-gradient-to-br from-gray-50 via-white to-gray-100'
            }`}>
            {/* Header */}
            <Header
                onExportPdf={handleExportPdf}
                documentContent={documentContent}
                onLoadContent={handleLoadContent}
            />

            {/* Main Content */}
            <div className="flex-1 flex gap-4 p-4 overflow-hidden">
                {/* Sidebar */}
                <Sidebar
                    documentContent={documentContent}
                    onDocumentChange={handleDocumentChange}
                />

                {/* Editor */}
                <main className={`flex-1 rounded-xl overflow-hidden transition-colors ${isDark ? 'glass' : 'bg-white/80 backdrop-blur border border-gray-200 shadow-lg'
                    }`}>
                    <Editor
                        initialContent=""
                        onContentChange={handleContentChange}
                        onWordCountChange={setWordCount}
                        editorRef={editorRef}
                    />
                </main>
            </div>

            {/* Status Bar */}
            <footer className={`px-4 py-2 flex items-center justify-between text-xs border-t no-print transition-colors ${isDark
                ? 'text-gray-500 border-purple-500/10'
                : 'text-gray-400 border-gray-200'
                }`}>
                <span>Inkwell v0.2.0 • {wordCount} words</span>
                <span>Powered by Ollama • Running 100% Offline</span>
            </footer>
        </div>
    );
}

export default App;

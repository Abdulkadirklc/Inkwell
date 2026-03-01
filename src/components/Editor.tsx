import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import ImageResize from 'tiptap-extension-resize-image';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { FontSize } from '../extensions/FontSize';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Quote,
    Sparkles,
    Loader2,
    Send,
    X,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    ImagePlus,
    Undo,
    Redo,
    Minus,
    Type,
    ZoomIn,
    ZoomOut,
    Table as TableIcon,
    Trash2,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    Split,
} from 'lucide-react';
import { useOllama } from '../hooks/useOllama';
import { useAppStore } from '../store/appStore';

interface EditorProps {
    initialContent?: string;
    onContentChange?: (content: string) => void;
    onWordCountChange?: (count: number) => void;
    editorRef?: React.MutableRefObject<ReturnType<typeof useEditor> | null>;
}

export default function Editor({ initialContent = '', onContentChange, onWordCountChange, editorRef }: EditorProps) {
    const [showAiInput, setShowAiInput] = useState(false);
    const [aiCommand, setAiCommand] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [streamingResult, setStreamingResult] = useState('');
    const [textColor, setTextColor] = useState('#000000');
    const [savedColor, setSavedColor] = useState('#000000');
    const [isColorActive, setIsColorActive] = useState(false);
    const [zoom, setZoom] = useState(100);
    const aiInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);

    const { processSelectionStream } = useOllama();
    const { isOllamaConnected, selectedModel, theme } = useAppStore();
    const isDark = theme === 'dark';

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder: 'Start writing your masterpiece...',
            }),
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            ImageResize,
            Underline,
            TextStyle,
            Color,
            FontFamily,
            FontSize,
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: initialContent,
        editorProps: {
            attributes: {
                class: isDark ? 'prose prose-invert max-w-none focus:outline-none' : 'prose max-w-none focus:outline-none',
                spellcheck: 'false',
            },
            handleDrop: (_view, event, _slice, moved) => {
                if (!moved && event.dataTransfer?.files?.length) {
                    const file = event.dataTransfer.files[0];
                    if (file.type.startsWith('image/')) {
                        event.preventDefault();
                        const reader = new FileReader();
                        reader.onload = () => {
                            const src = reader.result as string;
                            (editor?.chain().focus() as any).setImage({ src }).run();
                        };
                        reader.readAsDataURL(file);
                        return true;
                    }
                }
                return false;
            },
            handlePaste: (_view, event) => {
                const items = event.clipboardData?.items;
                if (items) {
                    for (const item of items) {
                        if (item.type.startsWith('image/')) {
                            event.preventDefault();
                            const file = item.getAsFile();
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const src = reader.result as string;
                                    (editor?.chain().focus() as any).setImage({ src }).run();
                                };
                                reader.readAsDataURL(file);
                                return true;
                            }
                        }
                    }
                }
                return false;
            },
            handleKeyDown: (_view, event) => {
                // TAB key for paragraph indentation
                if (event.key === 'Tab' && !event.shiftKey) {
                    event.preventDefault();
                    editor?.chain().focus().insertContent('    ').run();
                    return true;
                }
                return false;
            },
        },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            onContentChange?.(html);
            // Update word count and notify parent
            const text = editor.getText();
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            onWordCountChange?.(words);

            // Update color state
            const color = editor.getAttributes('textStyle').color;
            if (color) {
                setTextColor(color);
                setIsColorActive(true);
            } else {
                setIsColorActive(false);
            }
        },
        onSelectionUpdate: ({ editor }) => {
            const color = editor.getAttributes('textStyle').color;
            if (color) {
                setTextColor(color);
                setIsColorActive(true);
            } else {
                setIsColorActive(false);
            }
        },
    });

    // Expose editor to parent via ref
    useEffect(() => {
        if (editorRef) {
            editorRef.current = editor;
        }
    }, [editor, editorRef]);

    useEffect(() => {
        if (showAiInput && aiInputRef.current) {
            aiInputRef.current.focus();
        }
    }, [showAiInput]);

    // Update editor attributes
    useEffect(() => {
        if (editor) {
            editor.setOptions({
                editorProps: {
                    attributes: {
                        spellcheck: 'false',
                        class: isDark ? 'prose prose-invert max-w-none focus:outline-none' : 'prose max-w-none focus:outline-none',
                    }
                }
            });
        }
    }, [editor, isDark]);

    // Ctrl+Wheel zoom handler
    useEffect(() => {
        const container = editorContainerRef.current;
        if (!container) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -10 : 10;
                setZoom(prev => Math.min(200, Math.max(50, prev + delta)));
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    const handleImageUpload = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = () => {
                const src = reader.result as string;
                (editor?.chain().focus() as any).setImage({ src }).run();
            };
            reader.readAsDataURL(file);
        }
        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [editor]);

    const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const color = e.target.value;
        setTextColor(color);
        setSavedColor(color);
        editor?.chain().focus().setColor(color).run();
        setIsColorActive(true);
    }, [editor]);

    const handleColorButtonClick = useCallback(() => {
        if (isColorActive) {
            editor?.chain().focus().unsetColor().run();
            setIsColorActive(false);
        } else {
            editor?.chain().focus().setColor(savedColor).run();
            setTextColor(savedColor);
            setIsColorActive(true);
            setTimeout(() => {
                colorInputRef.current?.click();
            }, 0);
        }
    }, [editor, isColorActive, savedColor]);

    const handleFontChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const font = e.target.value;
        if (font === 'Inter') {
            editor?.chain().focus().unsetFontFamily().run();
        } else {
            editor?.chain().focus().setFontFamily(font).run();
        }
    }, [editor]);

    const handleAiCommand = useCallback(async () => {
        if (!editor || !aiCommand.trim() || !isOllamaConnected || !selectedModel) return;

        const { from, to } = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(from, to, ' ');

        if (!selectedText.trim()) {
            setAiCommand('');
            setShowAiInput(false);
            return;
        }

        // Get preceding context (up to 500 chars before selection)
        const precedingStart = Math.max(0, from - 500);
        const precedingContext = editor.state.doc.textBetween(precedingStart, from, ' ');

        setIsProcessing(true);
        setProcessingStatus('Thinking...');
        setStreamingResult('');

        // Helper to strip <think> tags and their content
        const stripThinkTags = (text: string): string => {
            // Remove <think>...</think> blocks
            return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        };

        try {
            // Store the start position for streaming insertion
            const startPos = from;
            let isFirstChunk = true;

            // Use streaming for real-time response
            await processSelectionStream(
                selectedText,
                aiCommand.trim(),
                (chunk, done) => {
                    // Strip think tags from the streaming result
                    const cleanChunk = stripThinkTags(chunk);

                    // Update preview state (optional, but good for debug)
                    setStreamingResult(cleanChunk);

                    if (cleanChunk) {
                        // If it's the first chunk, delete the original selection
                        if (isFirstChunk) {
                            editor.chain().focus().deleteSelection().run();
                            isFirstChunk = false;
                        }

                        // Select the range from the start of our insertion to the current cursor (end of insertion)
                        // Then replace it with the new accumulated chunk
                        const currentPos = editor.state.selection.to;

                        // Ensure we are selecting a valid range. 
                        // In the first iteration after delete, startPos == currentPos (empty)
                        // In subsequent iterations, currentPos > startPos

                        editor
                            .chain()
                            .focus()
                            .setTextSelection({ from: startPos, to: currentPos })
                            .insertContent(cleanChunk) // insertContent handles HTML parsing
                            .run();
                    }

                    if (done) {
                        setProcessingStatus('');
                        setAiCommand('');
                        setShowAiInput(false);
                        setIsProcessing(false);
                        setStreamingResult('');
                    }
                },
                precedingContext
            );
        } catch (error) {
            console.error('AI processing failed:', error);
            setProcessingStatus('Failed!');
            setTimeout(() => {
                setProcessingStatus('');
                setIsProcessing(false);
            }, 2000);
        }
    }, [editor, aiCommand, isOllamaConnected, selectedModel, processSelectionStream]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiCommand();
            } else if (e.key === 'Escape') {
                setShowAiInput(false);
                setAiCommand('');
            }
        },
        [handleAiCommand]
    );

    const quickCommands = [
        { label: 'Fix Grammar', command: 'Fix grammar and spelling errors' },
        { label: 'Improve', command: 'Improve the writing style and clarity' },
        { label: 'Expand', command: 'Expand this with more detail' },
        { label: 'Simplify', command: 'Simplify and make it more concise' },
        { label: 'Professional', command: 'Make this more professional' },
    ];

    if (!editor) {
        return null;
    }

    return (
        <div className="h-full flex flex-col">
            {/* Hidden file input for image upload */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Toolbar - Word-like formatting bar */}
            <div className={`flex items-center gap-1 p-2 rounded-t-xl border-b no-print flex-wrap transition-colors ${isDark
                ? 'glass-dark border-purple-500/10'
                : 'bg-gray-50 border-gray-200'}`}>
                {/* Undo/Redo */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    title="Undo (Ctrl+Z)"
                    isDark={isDark}
                >
                    <Undo size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    title="Redo (Ctrl+Y)"
                    isDark={isDark}
                >
                    <Redo size={16} />
                </ToolbarButton>

                <Divider isDark={isDark} />

                {/* Font Family */}
                <div className="flex items-center gap-1 mx-1">
                    <select
                        onChange={handleFontChange}
                        className={`text-xs p-1.5 rounded-md focus:outline-none cursor-pointer border-none bg-transparent max-w-[100px] ${isDark
                            ? 'text-gray-300 hover:text-white hover:bg-white/5 option:bg-surface-800'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            } `}
                        defaultValue="Inter"
                    >
                        <option value="Inter" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>Default</option>
                        <option value="Arial" className={isDark ? 'bg-[#1a1b26] font-sans' : 'bg-white font-sans'}>Arial</option>
                        <option value="Georgia" className={isDark ? 'bg-[#1a1b26] font-serif' : 'bg-white font-serif'}>Georgia</option>
                        <option value="Times New Roman" className={isDark ? 'bg-[#1a1b26] font-serif' : 'bg-white font-serif'}>Times New Roman</option>
                        <option value="Courier New" className={isDark ? 'bg-[#1a1b26] font-mono' : 'bg-white font-mono'}>Courier New</option>
                        <option value="Comic Sans MS" className={isDark ? 'bg-[#1a1b26] font-[cursive]' : 'bg-white font-[cursive]'}>Comic Sans</option>
                    </select>
                </div>

                {/* Text Formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold (Ctrl+B)"
                    isDark={isDark}
                >
                    <Bold size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic (Ctrl+I)"
                    isDark={isDark}
                >
                    <Italic size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive('underline')}
                    title="Underline (Ctrl+U)"
                    isDark={isDark}
                >
                    <UnderlineIcon size={16} />
                </ToolbarButton>

                <div className="flex items-center gap-1 mx-1">
                    <button
                        onClick={handleColorButtonClick}
                        className={`flex items-center justify-center p-1.5 rounded-md cursor-pointer transition-colors ${isColorActive
                            ? 'bg-purple-600 text-white'
                            : isDark
                                ? 'text-gray-400 hover:text-white hover:bg-white/5'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            } `}
                        title={isColorActive ? "Remove Color" : "Text Color"}
                    >
                        <Type size={16} style={{ color: isColorActive ? textColor : undefined }} />
                    </button>
                    <input
                        ref={colorInputRef}
                        type="color"
                        value={textColor}
                        onChange={handleColorChange}
                        className="w-0 h-0 opacity-0 absolute pointer-events-none"
                    />
                </div>

                <Divider isDark={isDark} />

                {/* Font Size */}
                <div className="flex items-center gap-1 mx-1">
                    <select
                        onChange={(e) => {
                            const size = e.target.value;
                            if (size === 'default') {
                                editor.chain().focus().unsetFontSize().run();
                            } else {
                                editor.chain().focus().setFontSize(size).run();
                            }
                        }}
                        className={`text-xs p-1.5 rounded-md focus:outline-none cursor-pointer border-none bg-transparent w-[60px] ${isDark
                            ? 'text-gray-300 hover:text-white hover:bg-white/5'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            } `}
                        defaultValue="default"
                    >
                        <option value="default" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>Size</option>
                        <option value="8pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>8</option>
                        <option value="10pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>10</option>
                        <option value="12pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>12</option>
                        <option value="14pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>14</option>
                        <option value="16pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>16</option>
                        <option value="18pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>18</option>
                        <option value="24pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>24</option>
                        <option value="36pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>36</option>
                        <option value="48pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>48</option>
                        <option value="72pt" className={isDark ? 'bg-[#1a1b26]' : 'bg-white'}>72</option>
                    </select>
                </div>

                <Divider isDark={isDark} />

                {/* Text Alignment */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={editor.isActive({ textAlign: 'left' })}
                    title="Align Left"
                    isDark={isDark}
                >
                    <AlignLeft size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={editor.isActive({ textAlign: 'center' })}
                    title="Align Center"
                    isDark={isDark}
                >
                    <AlignCenter size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    isActive={editor.isActive({ textAlign: 'right' })}
                    title="Align Right"
                    isDark={isDark}
                >
                    <AlignRight size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                    isActive={editor.isActive({ textAlign: 'justify' })}
                    title="Justify"
                    isDark={isDark}
                >
                    <AlignJustify size={16} />
                </ToolbarButton>

                <Divider isDark={isDark} />

                {/* Lists */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                    isDark={isDark}
                >
                    <List size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Numbered List"
                    isDark={isDark}
                >
                    <ListOrdered size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Quote"
                    isDark={isDark}
                >
                    <Quote size={16} />
                </ToolbarButton>

                <Divider isDark={isDark} />

                {/* Tables */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    title="Insert Table (3x3)"
                    isDark={isDark}
                >
                    <TableIcon size={16} />
                </ToolbarButton>

                <Divider isDark={isDark} />

                {/* Insert */}
                <ToolbarButton
                    onClick={handleImageUpload}
                    title="Insert Image"
                    isDark={isDark}
                >
                    <ImagePlus size={16} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Line"
                    isDark={isDark}
                >
                    <Minus size={16} />
                </ToolbarButton>

                <Divider isDark={isDark} />

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 mx-1">
                    <ToolbarButton
                        onClick={() => setZoom(Math.max(50, zoom - 10))}
                        title="Zoom Out"
                        isDark={isDark}
                        disabled={zoom <= 50}
                    >
                        <ZoomOut size={16} />
                    </ToolbarButton>
                    <button
                        onClick={() => setZoom(100)}
                        className={`text-xs px-2 py-1 rounded-md ${isDark
                            ? 'text-gray-400 hover:text-white hover:bg-white/5'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                        title="Reset Zoom"
                    >
                        {zoom}%
                    </button>
                    <ToolbarButton
                        onClick={() => setZoom(Math.min(200, zoom + 10))}
                        title="Zoom In"
                        isDark={isDark}
                        disabled={zoom >= 200}
                    >
                        <ZoomIn size={16} />
                    </ToolbarButton>
                </div>
            </div>

            {/* Table Bubble Menu */}
            {editor && (
                <BubbleMenu
                    editor={editor}
                    tippyOptions={{
                        duration: 100,
                        placement: 'top',
                        maxWidth: 'none',
                    }}
                    shouldShow={({ editor }) => editor.isActive('table')}
                    className="z-50"
                >
                    <div className={`rounded-xl shadow-lg p-2 flex items-center gap-1 ${isDark ? 'glass shadow-purple-500/10' : 'bg-white border border-gray-200 shadow-gray-200/50'}`}>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().addColumnBefore().run()}
                            title="Add Column Before"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center"><ArrowLeft size={12} /><span className="text-[10px] ml-0.5">+</span></div>
                        </ToolbarButton>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().addColumnAfter().run()}
                            title="Add Column After"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center"><span className="text-[10px] mr-0.5">+</span><ArrowRight size={12} /></div>
                        </ToolbarButton>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().deleteColumn().run()}
                            title="Delete Column"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center text-red-400"><Trash2 size={12} /><span className="text-[10px] ml-0.5">Col</span></div>
                        </ToolbarButton>
                        <Divider isDark={isDark} />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().addRowBefore().run()}
                            title="Add Row Before"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center"><ArrowUp size={12} /><span className="text-[10px] ml-0.5">+</span></div>
                        </ToolbarButton>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().addRowAfter().run()}
                            title="Add Row After"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center"><span className="text-[10px] mr-0.5">+</span><ArrowDown size={12} /></div>
                        </ToolbarButton>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().deleteRow().run()}
                            title="Delete Row"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center text-red-400"><Trash2 size={12} /><span className="text-[10px] ml-0.5">Row</span></div>
                        </ToolbarButton>
                        <Divider isDark={isDark} />
                        <ToolbarButton
                            onClick={() => editor.chain().focus().mergeCells().run()}
                            title="Merge Cells"
                            isDark={isDark}
                            small
                        >
                            <Split size={14} />
                        </ToolbarButton>
                        <ToolbarButton
                            onClick={() => editor.chain().focus().deleteTable().run()}
                            title="Delete Table"
                            isDark={isDark}
                            small
                        >
                            <div className="flex items-center text-red-500 font-bold"><Trash2 size={14} /><span className="text-[10px] ml-1">Table</span></div>
                        </ToolbarButton>
                    </div>
                </BubbleMenu>
            )}

            {/* Text Bubble Menu */}
            <BubbleMenu
                editor={editor}
                tippyOptions={{
                    duration: 100,
                    placement: 'top',
                    maxWidth: 'none',
                }}
                shouldShow={({ editor, from, to }) => {
                    // Only show if selection is not empty AND not in a table (or at least let table menu take precedence if we want distinct menus)
                    // Actually, showing both might be confusing. Let's hide this one if in table.
                    return !editor.isEmpty && (to - from > 0) && !editor.isActive('table');
                }}
                className="z-50"
            >
                <div className={`rounded-xl shadow-lg p-2 animate-fade-in ${isDark ? 'glass shadow-purple-500/10' : 'bg-white border border-gray-200 shadow-gray-200/50'}`}>
                    {!showAiInput ? (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowAiInput(true)}
                                disabled={!isOllamaConnected}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isOllamaConnected
                                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500'
                                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                                title={isOllamaConnected ? 'AI Magic' : 'Connect to Ollama first'}
                            >
                                <Sparkles size={16} />
                                <span>AI Magic</span>
                            </button>
                            <Divider isDark={isDark} />
                            <ToolbarButton
                                onClick={() => editor.chain().focus().toggleBold().run()}
                                isActive={editor.isActive('bold')}
                                small
                                isDark={isDark}
                            >
                                <Bold size={14} />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => editor.chain().focus().toggleItalic().run()}
                                isActive={editor.isActive('italic')}
                                small
                                isDark={isDark}
                            >
                                <Italic size={14} />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => editor.chain().focus().toggleUnderline().run()}
                                isActive={editor.isActive('underline')}
                                small
                                isDark={isDark}
                            >
                                <UnderlineIcon size={14} />
                            </ToolbarButton>
                            <Divider isDark={isDark} />
                            <ToolbarButton
                                onClick={() => editor.chain().focus().setTextAlign('left').run()}
                                isActive={editor.isActive({ textAlign: 'left' })}
                                small
                                isDark={isDark}
                            >
                                <AlignLeft size={14} />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => editor.chain().focus().setTextAlign('center').run()}
                                isActive={editor.isActive({ textAlign: 'center' })}
                                small
                                isDark={isDark}
                            >
                                <AlignCenter size={14} />
                            </ToolbarButton>
                            <ToolbarButton
                                onClick={() => editor.chain().focus().setTextAlign('right').run()}
                                isActive={editor.isActive({ textAlign: 'right' })}
                                small
                                isDark={isDark}
                            >
                                <AlignRight size={14} />
                            </ToolbarButton>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 min-w-[400px]">
                            {/* Streaming preview */}
                            {isProcessing && streamingResult && (
                                <div className={`p-2 rounded-lg text-xs max-h-32 overflow-auto ${isDark ? 'bg-purple-500/10 text-purple-200' : 'bg-purple-50 text-purple-800'
                                    } `}>
                                    <div className="flex items-center gap-1 mb-1 text-purple-400">
                                        <Loader2 size={12} className="animate-spin" />
                                        <span>Preview:</span>
                                    </div>
                                    {streamingResult}
                                </div>
                            )}

                            {/* Quick commands */}
                            <div className="flex flex-wrap gap-1">
                                {quickCommands.map((qc) => (
                                    <button
                                        key={qc.label}
                                        onClick={() => {
                                            setAiCommand(qc.command);
                                            setTimeout(handleAiCommand, 100);
                                        }}
                                        disabled={isProcessing}
                                        className={`px-2 py-1 text-xs rounded-md transition-colors disabled:opacity-50 ${isDark
                                            ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200'
                                            : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                                            } `}
                                    >
                                        {qc.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom command input */}
                            <div className="flex items-center gap-2">
                                <input
                                    ref={aiInputRef}
                                    type="text"
                                    value={aiCommand}
                                    onChange={(e) => setAiCommand(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type a command (e.g., 'Make it funnier')"
                                    disabled={isProcessing}
                                    className={`flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 ${isDark
                                        ? 'bg-surface-300/50 border border-purple-500/20 text-white placeholder-gray-500'
                                        : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                                        } `}
                                />
                                {isProcessing ? (
                                    <div className="flex items-center gap-2 text-purple-400">
                                        <Loader2 size={18} className="animate-spin" />
                                        <span className="text-xs">{processingStatus}</span>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleAiCommand}
                                            disabled={!aiCommand.trim()}
                                            className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white"
                                        >
                                            <Send size={16} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowAiInput(false);
                                                setAiCommand('');
                                            }}
                                            className={`p-2 rounded-lg transition-colors ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'
                                                } `}
                                        >
                                            <X size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </BubbleMenu>

            <div
                ref={editorContainerRef}
                className={`flex-1 overflow-auto p-8 transition-colors ${isDark
                    ? 'bg-gradient-to-br from-surface-300/30 to-surface-400/30'
                    : 'bg-gradient-to-br from-gray-100/50 to-gray-50/50'
                    }`}>
                <div
                    className={`max-w-[850px] mx-auto min-h-[1123px] rounded-lg p-12 paper-shadow print-area visual-pages transition-all origin-top ${isDark ? 'bg-transparent' : 'bg-transparent'
                        }`}
                    style={{
                        transform: `scale(${zoom / 100})`,
                        marginBottom: `${(zoom / 100 - 1) * 1100}px`,
                        padding: '48px' // Explicit padding for content margins
                    }}
                >
                    <EditorContent editor={editor} className={`h-full ${isDark ? '' : 'editor-light'}`} />
                </div>
            </div>
        </div>
    );
}

interface ToolbarButtonProps {
    children: React.ReactNode;
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title?: string;
    small?: boolean;
    isDark?: boolean;
}

function ToolbarButton({ children, onClick, isActive, disabled, title, small, isDark = true }: ToolbarButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`${small ? 'p-1' : 'p-1.5'} rounded-md transition-all ${disabled
                ? isDark ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
                : isActive
                    ? 'bg-purple-600 text-white'
                    : isDark
                        ? 'text-gray-400 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                } `}
        >
            {children}
        </button>
    );
}

function Divider({ isDark = true }: { isDark?: boolean }) {
    return <div className={`w-px h-5 mx-1 ${isDark ? 'bg-purple-500/20' : 'bg-gray-300'}`} />;
}

import { useState, useCallback, useRef } from 'react';
import {
    FileText,
    Download,
    Save,
    X,
    FileType,
    Printer,
    Moon,
    Sun,
    Upload,
    FilePlus,
} from 'lucide-react';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { save, ask } from '@tauri-apps/plugin-dialog';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType } from 'docx';
import mammoth from 'mammoth';
import * as html2pdfPkg from 'html2pdf.js';
const html2pdf = (html2pdfPkg as any).default || html2pdfPkg;
import { useAppStore } from '../store/appStore';

interface HeaderProps {
    onExportPdf: () => void;
    documentContent: string;
    onLoadContent?: (content: string) => void;
}

export default function Header({ onExportPdf, documentContent, onLoadContent }: HeaderProps) {
    const { theme, toggleTheme } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);
    const [fileName, setFileName] = useState('Untitled Document');
    const [showMenu, setShowMenu] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleNewDocument = useCallback(async () => {
        if (documentContent && documentContent.length > 20) {
            const confirmed = await ask('Yeni belge oluşturmak istiyor musunuz? Kaydedilmeyen veriler silinebilir.', {
                title: 'Yeni Belge',
                kind: 'warning',
                okLabel: 'Evet, Temizle',
                cancelLabel: 'İptal'
            });
            if (!confirmed) return;
        }

        if (onLoadContent) {
            onLoadContent('');
            setFileName('Untitled Document');
        }
    }, [documentContent, onLoadContent]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        setSaveStatus('saving');
        try {
            const sanitizedName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const fullFileName = `${sanitizedName}.html`;

            const path = await save({
                defaultPath: fullFileName,
                filters: [{ name: 'HTML Document', extensions: ['html'] }]
            });

            if (path) {
                await writeTextFile(path, documentContent);
                setSaveStatus('saved');
            } else {
                setSaveStatus('idle'); // User cancelled
            }

            setTimeout(() => {
                setIsSaving(false);
                setSaveStatus('idle');
            }, 2000);
        } catch (error) {
            console.error('Failed to save:', error);
            setIsSaving(false);
            setSaveStatus('idle');
        }
    }, [fileName, documentContent]);

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onLoadContent) return;

        const extension = file.name.split('.').pop()?.toLowerCase();

        try {
            if (extension === 'md' || extension === 'txt') {
                // Import Markdown or plain text
                const text = await file.text();
                // Convert markdown to simple HTML
                let html = text
                    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/^- (.*$)/gm, '<li>$1</li>')
                    .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
                    .replace(/\n\n/g, '</p><p>')
                    .replace(/\n/g, '<br/>');
                html = `<p>${html}</p>`;
                onLoadContent(html);
                setFileName(file.name.replace(/\.[^/.]+$/, ''));
            } else if (extension === 'html' || extension === 'htm') {
                // Import HTML directly
                const html = await file.text();
                onLoadContent(html);
                setFileName(file.name.replace(/\.[^/.]+$/, ''));
            } else if (extension === 'json') {
                // Import JSON (our format)
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.content) {
                    onLoadContent(data.content);
                    if (data.title) setFileName(data.title);
                }
            } else if (extension === 'docx') {
                // Import DOCX using mammoth
                const arrayBuffer = await file.arrayBuffer();
                const options = {
                    styleMap: [
                        "p[style-name='Heading 1'] => h1:fresh",
                        "p[style-name='Heading 2'] => h2:fresh",
                        "p[style-name='Heading 3'] => h3:fresh",
                        "p[style-name='Title'] => h1:fresh",
                        "p[style-name='Subtitle'] => h2:fresh",
                        "p[style-name='Quote'] => blockquote:fresh",
                        "r[style-name='Strong'] => strong"
                    ]
                };
                const result = await mammoth.convertToHtml({ arrayBuffer }, options);
                if (result.value) {
                    onLoadContent(result.value);
                    setFileName(file.name.replace(/\.[^/.]+$/, ''));
                }
            }
        } catch (error) {
            console.error('Failed to import file:', error);
        }

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setShowMenu(false);
    }, [onLoadContent]);



    const handleExportWord = useCallback(async () => {
        try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = documentContent;

            const children: (Paragraph | DocxTable)[] = [];

            // Recursive function to process nodes
            const processNodes = async (childNodes: NodeListOf<ChildNode>, parentRuns: TextRun[] | null = null) => {
                // const currentParagraphRuns: TextRun[] = []; // Unused

                for (const node of Array.from(childNodes)) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const text = node.textContent?.trim();
                        if (text) {
                            if (parentRuns) {
                                parentRuns.push(new TextRun(node.textContent || ''));
                            } else {
                                // Standalone text (likely in P)
                            }
                        }
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        const tagName = element.tagName.toLowerCase();
                        const textContent = element.textContent || '';
                        const style = element.getAttribute('style') || '';

                        // Format helpers
                        let alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT;
                        if (style.includes('text-align: center')) alignment = AlignmentType.CENTER;
                        if (style.includes('text-align: right')) alignment = AlignmentType.RIGHT;
                        if (style.includes('text-align: justify')) alignment = AlignmentType.JUSTIFIED;

                        // Image Handling
                        if (tagName === 'img') {
                            const src = element.getAttribute('src');
                            if (src && src.startsWith('data:image')) {
                                try {
                                    // Decode Base64
                                    const base64 = src.split(',')[1];
                                    const binaryString = atob(base64);
                                    const bytes = new Uint8Array(binaryString.length);
                                    for (let i = 0; i < binaryString.length; i++) {
                                        bytes[i] = binaryString.charCodeAt(i);
                                    }

                                    // Get dimensions if possible (from style or attributes)
                                    let width = 400;
                                    let height = 300;
                                    const widthAttr = element.getAttribute('width');
                                    const heightAttr = element.getAttribute('height');
                                    if (widthAttr) width = parseInt(widthAttr);
                                    if (heightAttr) height = parseInt(heightAttr);

                                    // Or parse style width
                                    const styleWidth = style.match(/width:\s*(\d+)px/);
                                    if (styleWidth) width = parseInt(styleWidth[1]);

                                    children.push(new Paragraph({
                                        children: [new ImageRun({
                                            data: bytes,
                                            transformation: { width, height }
                                        })],
                                        alignment
                                    }));
                                } catch (imgErr) {
                                    console.error("Image processing error", imgErr);
                                }
                            }
                            continue;
                        }

                        // Block Elements
                        switch (tagName) {
                            case 'h1':
                                children.push(new Paragraph({
                                    text: textContent,
                                    heading: HeadingLevel.HEADING_1,
                                    alignment,
                                    spacing: { after: 240 }
                                }));
                                break;
                            case 'h2':
                                children.push(new Paragraph({
                                    text: textContent,
                                    heading: HeadingLevel.HEADING_2,
                                    alignment,
                                    spacing: { before: 240, after: 120 }
                                }));
                                break;
                            case 'h3':
                                children.push(new Paragraph({
                                    text: textContent,
                                    heading: HeadingLevel.HEADING_3,
                                    alignment,
                                    spacing: { before: 240, after: 120 }
                                }));
                                break;
                            case 'p':
                                const runs: TextRun[] = [];

                                // Recursive function to extract formatting from nested elements
                                const extractRuns = (node: Node): void => {
                                    if (node.nodeType === Node.TEXT_NODE) {
                                        const text = node.textContent || '';
                                        if (text) runs.push(new TextRun(text));
                                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                                        const el = node as Element;
                                        const tag = el.tagName.toLowerCase();
                                        const style = el.getAttribute('style') || '';

                                        // Extract style properties
                                        const fontMatch = style.match(/font-family:\s*['"]?([^'";]+)/i);
                                        const colorMatch = style.match(/color:\s*([^;]+)/i);
                                        const sizeMatch = style.match(/font-size:\s*(\d+)px/i);

                                        const text = el.textContent || '';
                                        if (text) {
                                            runs.push(new TextRun({
                                                text,
                                                bold: tag === 'strong' || tag === 'b',
                                                italics: tag === 'em' || tag === 'i',
                                                underline: tag === 'u' ? {} : undefined,
                                                font: fontMatch ? fontMatch[1].replace(/['"]/g, '') : undefined,
                                                color: colorMatch ? colorMatch[1] : undefined,
                                                size: sizeMatch ? parseInt(sizeMatch[1]) * 2 : undefined,
                                            }));
                                        }
                                    }
                                };

                                // Process all child nodes
                                element.childNodes.forEach(child => extractRuns(child));

                                if (runs.length > 0 || textContent.trim()) {
                                    children.push(new Paragraph({
                                        children: runs.length > 0 ? runs : [new TextRun(textContent)],
                                        alignment,
                                        spacing: { after: 200, line: 276 }
                                    }));
                                }
                                break;
                            case 'blockquote':
                                children.push(new Paragraph({
                                    text: textContent,
                                    indent: { left: 720 },
                                    alignment,
                                    spacing: { after: 200 },
                                    style: "Intense Quote"
                                }));
                                break;
                            case 'li':
                                children.push(new Paragraph({
                                    text: `• ${textContent}`,
                                    indent: { left: 720, hanging: 360 },
                                    spacing: { after: 100 }
                                }));
                                break;
                            case 'div':
                                // Recursive for div containers
                                await processNodes(element.childNodes, null);
                                break;
                            case 'table':
                                // Handle table export
                                const tableElement = element as HTMLTableElement;
                                const tableRows: DocxTableRow[] = [];

                                for (const row of Array.from(tableElement.rows)) {
                                    const cells: DocxTableCell[] = [];
                                    for (const cell of Array.from(row.cells)) {
                                        const isHeader = cell.tagName.toLowerCase() === 'th';
                                        cells.push(new DocxTableCell({
                                            children: [new Paragraph({
                                                children: [new TextRun({
                                                    text: cell.textContent || '',
                                                    bold: isHeader,
                                                })],
                                            })],
                                            width: { size: Math.floor(100 / row.cells.length), type: WidthType.PERCENTAGE },
                                        }));
                                    }
                                    tableRows.push(new DocxTableRow({ children: cells }));
                                }

                                if (tableRows.length > 0) {
                                    children.push(new DocxTable({
                                        rows: tableRows,
                                        width: { size: 100, type: WidthType.PERCENTAGE },
                                    }));
                                }
                                break;
                            default:
                                // Try recursing
                                await processNodes(element.childNodes, null);
                        }
                    }
                }
            };

            await processNodes(tempDiv.childNodes);

            // If empty
            if (children.length === 0) {
                children.push(new Paragraph({ text: '' }));
            }

            const doc = new Document({
                creator: "Inkwell AI Writer",
                title: fileName,
                description: "Created with Inkwell",
                sections: [{
                    properties: {},
                    children,
                }],
            });

            const blob = await Packer.toBlob(doc);
            const sanitizedName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            const path = await save({
                defaultPath: `${sanitizedName}.docx`,
                filters: [{ name: 'Word Document', extensions: ['docx'] }]
            });

            if (path) {
                const buffer = await blob.arrayBuffer();
                await writeFile(path, new Uint8Array(buffer));
            }

            setShowMenu(false);
        } catch (error) {
            console.error('Failed to export Word:', error);
        }
    }, [fileName, documentContent]);

    const handleExportPdfFile = useCallback(() => {
        try {
            const element = document.querySelector('.print-area') as HTMLElement;
            if (!element) return;

            const opt = {
                margin: [10, 10, 10, 10],
                filename: `${fileName}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            // Temporarily Force Light Mode and Remove Visual Classes for PDF Generation
            const wasDark = document.documentElement.classList.contains('dark');
            const wasVisual = element.classList.contains('visual-pages');

            if (wasDark) {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
            }
            if (wasVisual) {
                element.classList.remove('visual-pages');
                element.classList.remove('paper-shadow');
                element.style.boxShadow = 'none';
            }

            html2pdf().set(opt).from(element).output('arraybuffer').then(async (pdfBuffer: ArrayBuffer) => {
                // Restore theme and visual classes
                if (wasDark) {
                    document.documentElement.classList.remove('light');
                    document.documentElement.classList.add('dark');
                }
                if (wasVisual) {
                    element.classList.add('visual-pages');
                    element.classList.add('paper-shadow');
                    element.style.boxShadow = '';
                }

                try {
                    const path = await save({
                        defaultPath: `${fileName}.pdf`,
                        filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
                    });

                    if (path) {
                        await writeFile(path, new Uint8Array(pdfBuffer));
                    }
                } catch (e) {
                    console.error('File save error:', e);
                }

                setShowMenu(false);
            });
        } catch (error) {
            console.error('Failed to export PDF:', error);
        }
    }, [fileName]);

    const isDark = theme === 'dark';

    return (
        <header className={`relative z-30 flex items-center justify-between px-4 py-3 border-b no-print transition-colors ${isDark
            ? 'glass-dark border-purple-500/10'
            : 'bg-white/90 backdrop-blur border-gray-200'
            }`}>
            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.html,.htm,.json,.docx"
                onChange={handleFileImport}
                className="hidden"
            />

            <div className="flex items-center gap-4">
                {/* Document Title */}
                <div className="flex items-center gap-2">
                    <FileText size={18} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                    <input
                        type="text"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        className={`bg-transparent font-medium focus:outline-none border-b border-transparent focus:border-purple-500/50 transition-colors min-w-[200px] ${isDark ? 'text-white' : 'text-gray-900'
                            }`}
                        placeholder="Document Title"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className={`p-2 rounded-lg transition-colors ${isDark
                        ? 'text-gray-400 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* New Document Button */}
                <button
                    onClick={handleNewDocument}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isDark
                        ? 'text-gray-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title="New Document"
                >
                    <FilePlus size={16} />
                    <span>New</span>
                </button>

                {/* Import Button */}
                <button
                    onClick={handleImportClick}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isDark
                        ? 'text-gray-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title="Import file (Markdown, HTML, JSON)"
                >
                    <Download size={16} />
                    <span>Import</span>
                </button>

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${isDark
                        ? 'text-gray-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title="Save to Documents folder as HTML"
                >
                    <Save size={16} className={isSaving ? 'animate-pulse' : ''} />
                    <span>
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save'}
                    </span>
                </button>

                {/* Export PDF */}
                <button
                    onClick={onExportPdf}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isDark
                        ? 'text-gray-300 hover:text-white hover:bg-white/5'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                    title="Print Document"
                >
                    <Printer size={16} />
                    <span>Print</span>
                </button>

                {/* More Export Options Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${isDark
                            ? 'text-gray-300 hover:text-white hover:bg-white/5'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                            }`}
                        title="More export options"
                    >
                        <Upload size={16} />
                        <span>Export</span>
                        {showMenu ? <X size={14} /> : null}
                    </button>

                    {showMenu && (
                        <div className={`absolute right-0 top-full mt-2 w-56 rounded-xl shadow-lg py-2 z-[100] animate-fade-in ${isDark
                            ? 'glass shadow-purple-500/10'
                            : 'bg-white border border-gray-200 shadow-gray-200/50'
                            }`}>
                            <div className={`px-3 py-1.5 text-xs uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                Export As
                            </div>
                            <button
                                onClick={handleExportPdfFile}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isDark
                                    ? 'text-gray-300 hover:text-white hover:bg-white/5'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <FileText size={16} className="text-red-400" />
                                <div className="text-left">
                                    <div>PDF Document</div>
                                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>.pdf</div>
                                </div>
                            </button>
                            <button
                                onClick={handleExportWord}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isDark
                                    ? 'text-gray-300 hover:text-white hover:bg-white/5'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <FileType size={16} className="text-blue-400" />
                                <div className="text-left">
                                    <div>Word Document</div>
                                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>.docx</div>
                                </div>
                            </button>

                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

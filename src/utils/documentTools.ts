/**
 * Document Tools for Agentic Mode
 * Provides structured operations on document content
 */

export interface DocumentSegment {
    id: string;
    type: 'title' | 'heading' | 'paragraph' | 'sentence';
    content: string;
    index: number;
}

export interface ParsedDocument {
    title: string | null;
    headings: DocumentSegment[];
    paragraphs: DocumentSegment[];
    fullText: string;
}

/**
 * Parse HTML content into structured segments
 */
export function parseDocumentSegments(html: string): ParsedDocument {
    // Create a temporary div to parse HTML
    const div = document.createElement('div');
    div.innerHTML = html;

    // Extract text content
    const fullText = div.textContent || '';

    // Find title (first h1)
    const h1 = div.querySelector('h1');
    const title = h1?.textContent?.trim() || null;

    // Find all headings
    const headingElements = div.querySelectorAll('h1, h2, h3');
    const headings: DocumentSegment[] = Array.from(headingElements).map((el, i) => ({
        id: `heading-${i}`,
        type: 'heading',
        content: el.textContent?.trim() || '',
        index: i,
    }));

    // Find all paragraphs
    const paragraphElements = div.querySelectorAll('p');
    const paragraphs: DocumentSegment[] = Array.from(paragraphElements).map((el, i) => ({
        id: `para-${i}`,
        type: 'paragraph',
        content: el.textContent?.trim() || '',
        index: i,
    }));

    return { title, headings, paragraphs, fullText };
}

/**
 * Get first paragraph
 */
export function getFirstParagraph(html: string): string | null {
    const { paragraphs } = parseDocumentSegments(html);
    return paragraphs[0]?.content || null;
}

/**
 * Get last paragraph
 */
export function getLastParagraph(html: string): string | null {
    const { paragraphs } = parseDocumentSegments(html);
    return paragraphs[paragraphs.length - 1]?.content || null;
}

/**
 * Get paragraph by index
 */
export function getParagraph(html: string, index: number): string | null {
    const { paragraphs } = parseDocumentSegments(html);
    return paragraphs[index]?.content || null;
}

/**
 * Get document title
 */
export function getTitle(html: string): string | null {
    const { title } = parseDocumentSegments(html);
    return title;
}

/**
 * Add title to document
 */
export function addTitle(html: string, titleText: string): string {
    // Prepend h1 to content
    return `<h1>${titleText}</h1>${html}`;
}

/**
 * Replace paragraph content
 */
export function replaceParagraph(html: string, index: number, newContent: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;

    const paragraphs = div.querySelectorAll('p');
    if (paragraphs[index]) {
        paragraphs[index].textContent = newContent;
    }

    return div.innerHTML;
}

/**
 * Available tools for LLM
 */
export const AVAILABLE_TOOLS = [
    {
        name: 'add_title',
        description: 'Add a title at the beginning of the document',
        parameters: { title: 'string - the title text' }
    },
    {
        name: 'edit_first_paragraph',
        description: 'Edit the first paragraph of the document',
        parameters: { new_content: 'string - the new paragraph content' }
    },
    {
        name: 'edit_last_paragraph',
        description: 'Edit the last paragraph of the document',
        parameters: { new_content: 'string - the new paragraph content' }
    },
    {
        name: 'edit_paragraph',
        description: 'Edit a specific paragraph by its number',
        parameters: {
            paragraph_number: 'number - which paragraph (1-based)',
            new_content: 'string - the new paragraph content'
        }
    },
    {
        name: 'append_text',
        description: 'Add text at the end of the document',
        parameters: { text: 'string - text to append' }
    },
    {
        name: 'prepend_text',
        description: 'Add text at the very beginning of the document (before title)',
        parameters: { text: 'string - text to prepend' }
    },
    {
        name: 'add_table',
        description: 'Add a table to the document',
        parameters: {
            headers: 'string[] - list of column headers',
            rows: 'string[][] - list of rows (array of strings)',
            caption: 'string - optional table caption'
        }
    },
    {
        name: 'replace_all',
        description: 'Replace the entire document content',
        parameters: { text: 'string - the new full document content' }
    },
    {
        name: 'reply',
        description: 'Just reply to the user without editing the document',
        parameters: { message: 'string - your reply' }
    }
];

/**
 * Execute a tool call
 */
export function executeTool(
    toolName: string,
    params: Record<string, any>,
    html: string
): { success: boolean; newHtml?: string; message: string } {
    const userSummary = params.summary || null;

    try {
        switch (toolName) {
            case 'add_title':
                return {
                    success: true,
                    newHtml: addTitle(html, params.title),
                    message: userSummary || `Added title: "${params.title}"`
                };

            case 'edit_first_paragraph':
                const contentFirst = params.new_content || params.text;
                if (!contentFirst || typeof contentFirst !== 'string') {
                    return { success: false, message: 'No content provided to edit - please specify what to write' };
                }
                return {
                    success: true,
                    newHtml: replaceParagraph(html, 0, contentFirst),
                    message: userSummary || 'Updated introduction paragraph'
                };

            case 'edit_last_paragraph': {
                const contentLast = params.new_content || params.text;
                if (!contentLast || typeof contentLast !== 'string') {
                    return { success: false, message: 'No content provided to edit - please specify what to write' };
                }
                const { paragraphs } = parseDocumentSegments(html);
                return {
                    success: true,
                    newHtml: replaceParagraph(html, paragraphs.length - 1, contentLast),
                    message: userSummary || 'Updated conclusion paragraph'
                };
            }

            case 'edit_paragraph':
                const contentSpecific = params.new_content || params.text;
                if (!contentSpecific || typeof contentSpecific !== 'string') {
                    return { success: false, message: 'No content provided to edit - please specify what to write' };
                }
                return {
                    success: true,
                    newHtml: replaceParagraph(html, params.paragraph_number - 1, contentSpecific),
                    message: userSummary || `Edited paragraph ${params.paragraph_number}`
                };

            case 'append_text':
                if (!params.text || typeof params.text !== 'string') {
                    return { success: false, message: 'No text provided to append' };
                }
                return {
                    success: true,
                    newHtml: html + `<p>${params.text}</p>`,
                    message: userSummary || 'Appended new text to document'
                };

            case 'prepend_text':
                if (!params.text || typeof params.text !== 'string') {
                    return { success: false, message: 'No text provided to prepend' };
                }
                return {
                    success: true,
                    newHtml: `<p>${params.text}</p>` + html,
                    message: userSummary || 'Added text to the beginning'
                };

            case 'add_table': {
                const headers = params.headers as string[];
                const rows = params.rows as string[][];
                const caption = params.caption || '';

                let tableHtml = `<table border="1" style="border-collapse: collapse; width: 100%; margin: 1em 0;">`;
                if (caption) tableHtml += `<caption>${caption}</caption>`;

                // Headers
                tableHtml += `<thead><tr>`;
                headers.forEach(h => tableHtml += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">${h}</th>`);
                tableHtml += `</tr></thead>`;

                // Rows
                tableHtml += `<tbody>`;
                rows.forEach(row => {
                    tableHtml += `<tr>`;
                    row.forEach(cell => tableHtml += `<td style="border: 1px solid #ddd; padding: 8px;">${cell}</td>`);
                    tableHtml += `</tr>`;
                });
                tableHtml += `</tbody></table>`;

                return {
                    success: true,
                    newHtml: html + tableHtml,
                    message: userSummary || 'Added a data table to the document'
                };
            }

            case 'replace_all':
                if (!params.text || typeof params.text !== 'string') {
                    return { success: false, message: 'No content provided to replace document' };
                }
                return {
                    success: true,
                    newHtml: params.text,
                    message: userSummary || 'Rewrote the entire document'
                };

            case 'reply':
                return {
                    success: true,
                    message: params.message || 'Response generated.'
                };

            default:
                return {
                    success: false,
                    message: `Unknown tool: ${toolName}`
                };
        }
    } catch (error) {
        return {
            success: false,
            message: `Tool error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

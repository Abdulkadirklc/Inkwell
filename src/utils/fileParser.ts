import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

// Set worker source explicitly using Vite's URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const parseFile = async (file: File): Promise<string> => {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'txt' || extension === 'md') {
        return await file.text();
    }
    else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    }
    else if (extension === 'pdf') {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                // Removed useWorkerFetch: false as we now have a worker
                isEvalSupported: false,
                useSystemFonts: true,
            });
            const pdf = await loadingTask.promise;

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map((item: any) => item.str)
                    .join(' ');
                fullText += pageText + '\n\n';
            }
            return fullText.trim();
        } catch (error) {
            console.error('PDF parsing error:', error);
            const msg = error instanceof Error ? error.message : 'Unknown error';
            alert(`PDF Parsing Error: ${msg}. Try using the "Legacy Build" or checking your file.`);
            throw new Error(`Failed to parse PDF: ${msg}`);
        }
    }

    throw new Error(`Unsupported file type: .${extension}`);
};

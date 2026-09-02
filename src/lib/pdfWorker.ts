/**
 * Side-effect module that points PDF.js at the bundled worker (bundling it
 * avoids CDN/CORS failures and the "messageHandler is null" error).
 *
 * Import this for its side effect from any module that renders PDFs, rather
 * than from the app entry — keeping it out of the entry chunk means react-pdf
 * and pdfjs-dist are only downloaded on routes that actually show a PDF.
 */
import { pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

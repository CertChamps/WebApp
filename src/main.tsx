//import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { pdfjs } from 'react-pdf'
import './index.css'
import App from './App.tsx'

// Set PDF.js worker once so LogTables/MarkingScheme work (avoids Vite bundling issues)
const pdfVersion = typeof pdfjs.version === 'string' ? pdfjs.version : '5.3.93'
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`

createRoot(document.getElementById('root')!).render(
  //<StrictMode>
      <App />
 // </StrictMode>,
)
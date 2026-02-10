//import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { pdfjs } from 'react-pdf'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import './index.css'
import App from './App.tsx'

// Set PDF.js worker once so all PDF viewers share it (bundled worker avoids CDN/CORS and messageHandler null)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

createRoot(document.getElementById('root')!).render(
  //<StrictMode>
      <App />
 // </StrictMode>,
)
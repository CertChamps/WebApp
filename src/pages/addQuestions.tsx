import { useContext, useState, useCallback, useRef, useEffect } from 'react'
import { UserContext } from '../context/UserContext'
import { useNavigate } from 'react-router-dom'
import { ref, uploadBytes } from 'firebase/storage'
import { doc, collection, setDoc } from 'firebase/firestore'
import { storage, db } from '../../firebase'
import RenderMath from '../components/math/mathdisplay'
import MathInput from '../components/math/mathinput'
import useMaths from '../hooks/useMaths'
import { LuPlus, LuTrash2, LuX, LuArrowLeft, LuChevronLeft, LuChevronRight, LuCheck, LuUpload, LuImage, LuLoader, LuFileText, LuPanelLeft, LuPanelRight, LuCode, LuEye } from 'react-icons/lu'
import Editor from 'react-simple-code-editor'
import { Highlight, themes } from 'prism-react-renderer'
import '../styles/settings.css'

// Admin user IDs
const ADMIN_UIDS = [
  "NkN9UBqoPEYpE21MC89fipLn0SP2",
  "gJIqKYlc1OdXUQGZQkR4IzfCIoL2"
]

// Type for image upload state
type ImageUpload = {
  file: File | null
  preview: string | null
  storagePath: string | null
  downloadUrl: string | null
  uploading: boolean
  error: string | null
}

// Input type for each answer field
type InputField = {
  before: string
  after: string
  answer: string
}

// Part type for each question part (i, ii, iii, etc.)
type QuestionPart = {
  question: string
  orderMatters: boolean
  inputs: InputField[]
}

// Question set type matching the new JSON format
type QuestionSet = {
  id: string
  name: string
  tags: string[]
  difficulty: number
  isExamQ: boolean
  markingScheme?: string | null
  logTables?: string | null
  parts: QuestionPart[]
}

const PART_LETTERS = "abcdefghijklmnopqrstuvwxyz"

// Theme options with their background colors
const THEME_OPTIONS = {
  dracula: { theme: themes.dracula, bg: '#282a36', name: 'Dracula' },
  nightOwl: { theme: themes.nightOwl, bg: '#011627', name: 'Night Owl' },
  vsDark: { theme: themes.vsDark, bg: '#1e1e1e', name: 'VS Dark' },
  oneDark: { theme: themes.oneDark, bg: '#282c34', name: 'One Dark' },
  oceanicNext: { theme: themes.oceanicNext, bg: '#1b2b34', name: 'Oceanic Next' },
  synthwave84: { theme: themes.synthwave84, bg: '#2b213a', name: 'Synthwave 84' },
  shadesOfPurple: { theme: themes.shadesOfPurple, bg: '#2d2b55', name: 'Shades of Purple' },
  duotoneDark: { theme: themes.duotoneDark, bg: '#2a2734', name: 'Duotone Dark' },
  okaidia: { theme: themes.okaidia, bg: '#272822', name: 'Okaidia' },
  palenight: { theme: themes.palenight, bg: '#292d3e', name: 'Palenight' },
  github: { theme: themes.github, bg: '#ffffff', name: 'GitHub Light' },
  vsLight: { theme: themes.vsLight, bg: '#ffffff', name: 'VS Light' },
  oneLight: { theme: themes.oneLight, bg: '#fafafa', name: 'One Light' },
  duotoneLight: { theme: themes.duotoneLight, bg: '#faf8f5', name: 'Duotone Light' },
} as const

type ThemeKey = keyof typeof THEME_OPTIONS

// PDF viewer position options
type PdfPosition = 'hidden' | 'left' | 'right' | 'third-column'

// Helper to format answers from inputs array for display
function formatAnswers(inputs: InputField[]): string {
  if (!inputs || inputs.length === 0) return 'No answer'
  return inputs.map(input => input.answer).join(', ')
}

export default function AddQuestions() {
  const { user } = useContext(UserContext)
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const partRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const { isCorrect } = useMaths()
  
  // localStorage key
  const STORAGE_KEY = 'addQuestions-state'
  
  // Load initial state from localStorage
  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e)
    }
    return null
  }
  
  const savedState = loadFromStorage()
  
  const [parsedQuestions, setParsedQuestions] = useState<QuestionSet[]>(savedState?.parsedQuestions || [])
  const [parseError, setParseError] = useState<string | null>(null)
  const [selectedQuestion, setSelectedQuestion] = useState<number>(savedState?.selectedQuestion || 0)
  const [selectedPart, setSelectedPart] = useState<number>(savedState?.selectedPart || 0)
  // inputs[partIdx] = string[] of input values for each answer box
  const [partInputs, setPartInputs] = useState<Record<number, string[]>>({})
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({})
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>(savedState?.selectedTheme || 'dracula')
  const [fileName, setFileName] = useState<string | null>(savedState?.fileName || null)
  
  // Raw JSON text for the editor (allows free typing without immediate parsing)
  const [editorText, setEditorText] = useState<string>(savedState?.editorText || '')
  
  // Image uploads: key = "questionIdx-partIdx" e.g. "0-0", "0-1", "1-0"
  const [imageUploads, setImageUploads] = useState<Record<string, ImageUpload>>({})
  
  // Uploading state for the submit button
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  
  // PDF viewer state - supports multiple PDFs
  const [pdfFiles, setPdfFiles] = useState<{ file: File; url: string; name: string }[]>([])
  const [currentPdfIndex, setCurrentPdfIndex] = useState(0)
  const [pdfPosition, setPdfPosition] = useState<PdfPosition>(savedState?.pdfPosition || 'hidden')
  const pdfInputRef = useRef<HTMLInputElement>(null)
  
  // Current PDF URL for display
  const pdfUrl = pdfFiles[currentPdfIndex]?.url || null
  
  // Column visibility state
  const [showJsonColumn, setShowJsonColumn] = useState(savedState?.showJsonColumn ?? true)
  const [showPreviewColumn, setShowPreviewColumn] = useState(savedState?.showPreviewColumn ?? true)
  
  // Save state to localStorage when key values change
  useEffect(() => {
    const stateToSave = {
      parsedQuestions,
      selectedQuestion,
      selectedPart,
      selectedTheme,
      fileName,
      editorText,
      pdfPosition,
      showJsonColumn,
      showPreviewColumn,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave))
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e)
    }
  }, [parsedQuestions, selectedQuestion, selectedPart, selectedTheme, fileName, editorText, pdfPosition, showJsonColumn, showPreviewColumn])
  
  // Calculate visible count for toggle logic
  const getVisibleCount = () => {
    const showPdfCol = pdfPosition !== 'hidden' && pdfUrl
    return (showJsonColumn ? 1 : 0) + (showPreviewColumn ? 1 : 0) + (showPdfCol ? 1 : 0)
  }
  
  // Simple toggle - just show/hide, but prevent going below 2 columns
  const toggleJsonColumn = () => {
    if (showJsonColumn) {
      // Trying to hide - only allow if at least 2 others will remain
      if (getVisibleCount() > 2) {
        setShowJsonColumn(false)
      }
    } else {
      setShowJsonColumn(true)
    }
  }
  
  const togglePreviewColumn = () => {
    if (showPreviewColumn) {
      // Trying to hide - only allow if at least 2 others will remain
      if (getVisibleCount() > 2) {
        setShowPreviewColumn(false)
      }
    } else {
      setShowPreviewColumn(true)
    }
  }
  
  const togglePdfColumn = () => {
    if (!pdfUrl) return
    
    const showPdfCol = pdfPosition !== 'hidden'
    if (showPdfCol) {
      // Trying to hide - only allow if at least 2 others will remain
      if (getVisibleCount() > 2) {
        setPdfPosition('hidden')
      }
    } else {
      setPdfPosition('right')
    }
  }

  // Sync editor text and clear inputs when selecting a different question
  useEffect(() => {
    if (parsedQuestions[selectedQuestion]) {
      setEditorText(JSON.stringify(parsedQuestions[selectedQuestion], null, 2))
    } else {
      setEditorText('')
    }
    // Clear inputs and test results when switching questions
    setPartInputs({})
    setTestResults({})
  }, [selectedQuestion, parsedQuestions.length]) // Only on question change, not on every parse

  // Auto-scroll to selected part
  useEffect(() => {
    if (partRefs.current[selectedPart]) {
      partRefs.current[selectedPart]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    }
  }, [selectedPart, selectedQuestion])

  // Check if user is admin
  const isAdmin = user?.uid && ADMIN_UIDS.includes(user.uid)

  // Get current theme config
  const currentTheme = THEME_OPTIONS[selectedTheme]

  // Sanitize folder name (same as Python script)
  const sanitizeFolderName = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9]/g, '')
  }

  // Get storage path for an image (matching Python script pattern)
  const getStoragePath = (question: QuestionSet, partIdx: number): string => {
    const folderPath = question.tags?.[0] ? sanitizeFolderName(question.tags[0]) : question.id
    const suffix = question.parts.length === 1 ? '' : PART_LETTERS[partIdx]
    const filename = `${question.id}${suffix}.png`
    return `images/${folderPath}/${filename}`
  }

  // Handle image selection for a specific part
  const handleImageSelect = (questionIdx: number, partIdx: number, file: File) => {
    const key = `${questionIdx}-${partIdx}`
    const preview = URL.createObjectURL(file)
    
    setImageUploads(prev => ({
      ...prev,
      [key]: {
        file,
        preview,
        storagePath: null,
        downloadUrl: null,
        uploading: false,
        error: null
      }
    }))
  }

  // Handle PDF file selection - adds to array
  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    const newPdfs = Array.from(files).map(file => ({
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }))
    
    setPdfFiles(prev => {
      const updated = [...prev, ...newPdfs]
      // Auto-select the first new PDF
      setCurrentPdfIndex(prev.length)
      return updated
    })
    
    // Auto-show PDF viewer if it was hidden
    if (pdfPosition === 'hidden') {
      setPdfPosition('right')
    }
    
    // Reset input
    if (pdfInputRef.current) {
      pdfInputRef.current.value = ''
    }
  }
  
  // Remove current PDF
  const removeCurrentPdf = () => {
    if (pdfFiles.length === 0) return
    
    const currentPdf = pdfFiles[currentPdfIndex]
    if (currentPdf) {
      URL.revokeObjectURL(currentPdf.url)
    }
    
    setPdfFiles(prev => {
      const updated = prev.filter((_, i) => i !== currentPdfIndex)
      // Adjust index if needed
      if (currentPdfIndex >= updated.length && updated.length > 0) {
        setCurrentPdfIndex(updated.length - 1)
      }
      if (updated.length === 0) {
        setPdfPosition('hidden')
      }
      return updated
    })
  }
  
  // Remove all PDFs
  const removeAllPdfs = () => {
    pdfFiles.forEach(pdf => URL.revokeObjectURL(pdf.url))
    setPdfFiles([])
    setCurrentPdfIndex(0)
    setPdfPosition('hidden')
  }


  // Remove image from a part
  const removeImage = (questionIdx: number, partIdx: number) => {
    const key = `${questionIdx}-${partIdx}`
    setImageUploads(prev => {
      const newUploads = { ...prev }
      if (newUploads[key]?.preview) {
        URL.revokeObjectURL(newUploads[key].preview!)
      }
      delete newUploads[key]
      return newUploads
    })
  }

  // Download all edited questions as JSON
  const handleDownloadJson = () => {
    const dataStr = JSON.stringify(parsedQuestions, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'questions.json'
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }

  // Syntax highlighting function for JSON
  const highlightCode = useCallback((code: string) => (
    <Highlight theme={currentTheme.theme} code={code} language="json">
      {({ tokens, getLineProps, getTokenProps }) => (
        <>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </>
      )}
      </Highlight>
  ), [currentTheme.theme])

  // Flatten nested arrays for parsing (handles the nested array at the end of 2025P1.json)
  const flattenQuestions = (data: any): QuestionSet[] => {
    const result: QuestionSet[] = []
    const process = (item: any) => {
      if (Array.isArray(item)) {
        item.forEach(process)
      } else if (item && typeof item === 'object' && item.id) {
        result.push(item as QuestionSet)
      }
    }
    process(data)
    return result
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const reader = new FileReader()
    
    reader.onload = (event) => {
      try {
        setParseError(null)
        const content = event.target?.result as string
        const parsed = JSON.parse(content)
        const questions = flattenQuestions(parsed)
        
        // Validate structure for new format
        for (const q of questions) {
          if (!q.id) {
            throw new Error('Each question must have an "id" field')
          }
          if (!q.parts || !Array.isArray(q.parts)) {
            throw new Error(`Question ${q.id} must have a "parts" array`)
          }
          for (let i = 0; i < q.parts.length; i++) {
            const part = q.parts[i]
            if (!part.question) {
              throw new Error(`Question ${q.id} part ${i + 1} must have a "question" field`)
            }
            if (!part.inputs || !Array.isArray(part.inputs)) {
              throw new Error(`Question ${q.id} part ${i + 1} must have an "inputs" array`)
            }
          }
        }
        
        setParsedQuestions(questions)
        setSelectedQuestion(0)
        setSelectedPart(0)
        setPartInputs({})
        setTestResults({})
      } catch (err: any) {
        setParseError(err.message || 'Invalid JSON')
        setParsedQuestions([])
      }
    }
    
    reader.onerror = () => {
      setParseError('Failed to read file')
    }
    
    reader.readAsText(file)
  }

  // Update editor text and try to parse JSON
  const handleQuestionJsonChange = (newJson: string) => {
    // Always update the editor text to allow free typing
    setEditorText(newJson)
    
    // Try to parse and update the question
    try {
      const updatedQuestion = JSON.parse(newJson)
      
      // Basic validation for the new format
      if (!updatedQuestion.id) {
        return // Invalid, but don't block typing
      }
      if (!updatedQuestion.parts || !Array.isArray(updatedQuestion.parts)) {
        return // Invalid, but don't block typing
      }
      
      setParsedQuestions(prev => {
        const newQuestions = [...prev]
        newQuestions[selectedQuestion] = updatedQuestion
        return newQuestions
      })
      setParseError(null)
    } catch {
      // Don't update parsed questions if invalid JSON, but allow typing to continue
    }
  }

  if (!isAdmin) {
    return (
      <div className="settings-page flex items-center justify-center">
        <div className="color-bg-grey-5 p-8 rounded-xl text-center">
          <LuX size={48} className="color-txt-accent mx-auto mb-4" />
          <h2 className="txt-heading-colour text-2xl mb-2">Access Denied</h2>
          <p className="color-txt-sub">You don't have permission to view this page.</p>
        </div>
      </div>
    )
  }

  const handleClear = () => {
    // Revoke all image preview URLs
    Object.values(imageUploads).forEach(upload => {
      if (upload.preview) URL.revokeObjectURL(upload.preview)
    })
    
    // Revoke PDF URL
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
    }
    
    setParsedQuestions([])
    setParseError(null)
    setSelectedQuestion(0)
    setSelectedPart(0)
    setPartInputs({})
    setTestResults({})
    setImageUploads({})
    setFileName(null)
    setEditorText('')
    removeAllPdfs()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = ''
    }
    
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY)
  }

  const handleSubmit = async () => {
    if (parsedQuestions.length === 0 || isUploading) return
    
    setIsUploading(true)
    setUploadProgress('Starting upload...')
    
    const COLLECTION_NAME = 'certchamps-questions'
    
    try {
      for (let qIdx = 0; qIdx < parsedQuestions.length; qIdx++) {
        const qSet = parsedQuestions[qIdx]
        setUploadProgress(`Uploading question ${qIdx + 1}/${parsedQuestions.length}: ${qSet.id}`)
        
        const qid = qSet.id
        const name = qSet.name
        const tags = qSet.tags || []
        const difficulty = qSet.difficulty
        const isExamQ = qSet.isExamQ ?? false
        const markingScheme = qSet.markingScheme ?? null
        const logTables = qSet.logTables ?? null
        
        // Create/overwrite the top-level document for this question set
        const docRef = doc(db, COLLECTION_NAME, qid)
        await setDoc(docRef, {
          id: qid,
          name: name,
          tags: tags,
          difficulty: difficulty,
          isExamQ: isExamQ,
          markingScheme: markingScheme,
          logTables: logTables,
        })
        
        // Create subcollection 'content' for individual parts
        const parts = qSet.parts || []
        
        for (let idx = 0; idx < parts.length; idx++) {
          const part = parts[idx]
          const suffix = parts.length === 1 ? '' : PART_LETTERS[idx]
          const imageKey = `${qIdx}-${idx}`
          const imageUpload = imageUploads[imageKey]
          
          let imageStoragePath: string | null = null
          
          // Upload image if one was selected
          if (imageUpload?.file) {
            setUploadProgress(`Uploading image for ${qid}${suffix}...`)
            const storagePath = getStoragePath(qSet, idx)
            const storageRef = ref(storage, storagePath)
            
            try {
              await uploadBytes(storageRef, imageUpload.file)
              imageStoragePath = storagePath
              console.log(`✅ Uploaded image for ${qid}${suffix} -> ${storagePath}`)
            } catch (imgErr) {
              console.error(`⚠️ Failed to upload image for ${qid}${suffix}:`, imgErr)
            }
          }
          
          // Build answers array from inputs
          const answers = part.inputs.map(input => input.answer)
          
          // Build prefix - for single input use [before, after], for multiple use flat structure
          // Firestore doesn't support nested arrays, so we store as alternating before/after
          // or as an object-based structure
          let prefixData: any
          if (part.inputs.length === 1) {
            // Single input: [before, after]
            prefixData = [part.inputs[0].before, part.inputs[0].after]
          } else {
            // Multiple inputs: store as array of objects to avoid nested arrays
            prefixData = part.inputs.map(input => ({
              before: input.before,
              after: input.after
            }))
          }
          
          // Write the question content document
          const questionDocId = `q${idx + 1}`
          const contentDocRef = doc(collection(docRef, 'content'), questionDocId)
          
          await setDoc(contentDocRef, {
            question: part.question,
            answer: answers.length === 1 ? answers[0] : answers,
            ordermatters: part.orderMatters ?? false,
            prefix: prefixData,
            image: imageStoragePath,
            markingScheme: markingScheme,
            logTables: logTables,
          })
          
          console.log(`✅ Uploaded question ${questionDocId} for set ${qid}`)
        }
        
        console.log(`✅ Finished uploading question set ${qid}`)
      }
      
      setUploadProgress('')
      alert(`Successfully uploaded ${parsedQuestions.length} question(s) to Firebase!`)
      handleClear()
    } catch (err: any) {
      console.error('❌ Upload failed:', err)
      setUploadProgress('')
      alert(`Upload failed: ${err.message}`)
    } finally {
      setIsUploading(false)
    }
  }

  const currentQuestion = parsedQuestions[selectedQuestion]

  const goToPrevPart = () => {
    if (selectedPart > 0) {
      setSelectedPart(selectedPart - 1)
    } else if (selectedQuestion > 0) {
      setSelectedQuestion(selectedQuestion - 1)
      setSelectedPart((parsedQuestions[selectedQuestion - 1]?.parts?.length || 1) - 1)
    }
  }

  const goToNextPart = () => {
    if (currentQuestion && selectedPart < currentQuestion.parts.length - 1) {
      setSelectedPart(selectedPart + 1)
    } else if (selectedQuestion < parsedQuestions.length - 1) {
      setSelectedQuestion(selectedQuestion + 1)
      setSelectedPart(0)
    }
  }

  // Check answer for a specific part using the same logic as the main app
  const handleCheckPart = (partIdx: number) => {
    const part = currentQuestion?.parts?.[partIdx]
    const userInputs = partInputs[partIdx] || []
    
    if (!part || !currentQuestion) return

    // Get answers from inputs array
    const answerArray = part.inputs.map(input => input.answer)
    
    // Log parsed LaTeX for debugging
    console.group(`[${currentQuestion.id}] Part ${partIdx + 1} - Answer Check`)
    console.log('User Inputs (raw):', userInputs)
    console.log('Expected Answers (raw):', answerArray)
    userInputs.forEach((input, i) => {
      console.log(`  Input ${i + 1}: "${input}" → Expected: "${answerArray[i] || 'N/A'}"`)
    })
    console.groupEnd()
    
    // Check using the same isCorrect function from useMaths
    const correct = isCorrect(userInputs, answerArray, part.orderMatters ?? false)
    
    const key = `${currentQuestion.id}-${partIdx}`
    setTestResults(prev => ({ ...prev, [key]: correct }))
  }

  // Get setInputs function for a specific part
  const getSetInputsForPart = (partIdx: number) => {
    return (updater: React.SetStateAction<string[]>) => {
      setPartInputs(prev => {
        const current = prev[partIdx] || []
        const newInputs = typeof updater === 'function' ? updater(current) : updater
        return { ...prev, [partIdx]: newInputs }
      })
    }
  }

  // Compute column widths based on visibility
  const getColumnWidths = () => {
    const showPdf = pdfPosition !== 'hidden' && pdfUrl
    const visibleCount = (showJsonColumn ? 1 : 0) + (showPreviewColumn ? 1 : 0) + (showPdf ? 1 : 0)
    
    if (visibleCount === 0) return { json: 'w-full', preview: 'hidden', pdf: 'hidden' } // fallback
    if (visibleCount === 1) {
      return {
        json: showJsonColumn ? 'w-full' : 'hidden',
        preview: showPreviewColumn ? 'w-full' : 'hidden',
        pdf: showPdf ? 'w-full' : 'hidden'
      }
    }
    if (visibleCount === 2) {
      return {
        json: showJsonColumn ? 'w-1/2' : 'hidden',
        preview: showPreviewColumn ? 'w-1/2' : 'hidden',
        pdf: showPdf ? 'w-1/2' : 'hidden'
      }
    }
    // All 3 visible
    return {
      json: showJsonColumn ? 'w-1/3' : 'hidden',
      preview: showPreviewColumn ? 'w-1/3' : 'hidden',
      pdf: showPdf ? 'w-1/3' : 'hidden'
    }
  }
  
  const columnWidths = getColumnWidths()
  const showPdf = pdfPosition !== 'hidden' && pdfUrl

  return (
    <div className="settings-page w-full relative">
      {/* Floating Layout Controls */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-1 py-1 rounded-full color-bg">
        <button
          onClick={toggleJsonColumn}
          className={`p-1.5 rounded-full transition-all ${showJsonColumn ? 'color-bg-accent' : 'opacity-40 hover:opacity-100'}`}
          title={showJsonColumn ? 'Hide JSON' : 'Show JSON'}
        >
          <LuCode size={14} className="color-txt-main" />
        </button>
        <button
          onClick={togglePreviewColumn}
          className={`p-1.5 rounded-full transition-all ${showPreviewColumn ? 'color-bg-accent' : 'opacity-40 hover:opacity-100'}`}
          title={showPreviewColumn ? 'Hide Preview' : 'Show Preview'}
        >
          <LuEye size={14} className="color-txt-main" />
        </button>
        {pdfUrl && (
          <>
            <button
              onClick={togglePdfColumn}
              className={`p-1.5 rounded-full transition-all ${pdfPosition !== 'hidden' ? 'color-bg-accent' : 'opacity-40 hover:opacity-100'}`}
              title={pdfPosition !== 'hidden' ? 'Hide PDF' : 'Show PDF'}
            >
              <LuFileText size={14} className="color-txt-main" />
            </button>
            {pdfPosition !== 'hidden' && (
              <button
                onClick={() => setPdfPosition(pdfPosition === 'left' ? 'right' : 'left')}
                className="p-1.5 rounded-full opacity-40 hover:opacity-100 transition-all"
                title={pdfPosition === 'left' ? 'Move PDF Right' : 'Move PDF Left'}
              >
                {pdfPosition === 'left' ? <LuPanelRight size={14} className="color-txt-main" /> : <LuPanelLeft size={14} className="color-txt-main" />}
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex h-full w-full">
        
        {/* PDF Viewer - Left Position */}
        {pdfPosition === 'left' && showPdf && (
          <div className={`${columnWidths.pdf} h-full p-2 order-first transition-all duration-300 ease-in-out flex flex-col`}>
            {/* PDF Navigation */}
            {pdfFiles.length > 1 && (
              <div className="flex items-center justify-between gap-2 mb-2 px-2">
                <button
                  onClick={() => setCurrentPdfIndex(i => Math.max(0, i - 1))}
                  disabled={currentPdfIndex === 0}
                  className={`p-1 rounded-lg transition-all ${currentPdfIndex === 0 ? 'opacity-30' : 'hover:color-bg-grey-10'}`}
                >
                  <LuChevronLeft size={16} className="color-txt-main" />
                </button>
                <span className="color-txt-sub text-xs truncate flex-1 text-center" title={pdfFiles[currentPdfIndex]?.name}>
                  {currentPdfIndex + 1}/{pdfFiles.length}
                </span>
                <button
                  onClick={() => setCurrentPdfIndex(i => Math.min(pdfFiles.length - 1, i + 1))}
                  disabled={currentPdfIndex === pdfFiles.length - 1}
                  className={`p-1 rounded-lg transition-all ${currentPdfIndex === pdfFiles.length - 1 ? 'opacity-30' : 'hover:color-bg-grey-10'}`}
                >
                  <LuChevronRight size={16} className="color-txt-main" />
                </button>
                <button
                  onClick={removeCurrentPdf}
                  className="p-1 rounded-lg hover:bg-red-500/50 transition-all"
                  title="Remove this PDF"
                >
                  <LuX size={14} className="color-txt-sub" />
                </button>
              </div>
            )}
            <iframe
              src={pdfUrl}
              className="w-full flex-1 border-0 rounded-xl"
              title="PDF Preview"
            />
          </div>
        )}
        
        {/* LEFT SIDE - JSON Input */}
        {showJsonColumn && (
        <div className={`${columnWidths.json} h-full flex flex-col p-6 gap-4 transition-all duration-300 ease-in-out`}>
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate(-1)}
                className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all"
              >
                <LuArrowLeft size={22} className="color-txt-accent" />
              </button>
              <div>
                <h1 className="color-txt-main text-2xl font-bold">Add Questions</h1>
                <p className="color-txt-sub text-sm">Upload JSON file to preview and test questions</p>
              </div>
            </div>
            
            {/* Theme Selector */}
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value as ThemeKey)}
              className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50 cursor-pointer hover:color-bg-grey-10 transition-all"
            >
              <optgroup label="Dark Themes">
                <option value="dracula">Dracula</option>
                <option value="nightOwl">Night Owl</option>
                <option value="vsDark">VS Dark</option>
                <option value="oneDark">One Dark</option>
                <option value="oceanicNext">Oceanic Next</option>
                <option value="synthwave84">Synthwave 84</option>
                <option value="shadesOfPurple">Shades of Purple</option>
                <option value="duotoneDark">Duotone Dark</option>
                <option value="okaidia">Okaidia</option>
                <option value="palenight">Palenight</option>
              </optgroup>
              <optgroup label="Light Themes">
                <option value="github">GitHub Light</option>
                <option value="vsLight">VS Light</option>
                <option value="oneLight">One Light</option>
                <option value="duotoneLight">Duotone Light</option>
              </optgroup>
            </select>
          </div>

          {/* File Upload Area */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json"
            className="hidden"
          />
          
          {!fileName ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed border-[var(--accent)]/50 color-bg-grey-5 hover:border-[var(--accent)] hover:color-bg-grey-10 transition-all cursor-pointer"
            >
              <LuUpload size={40} className="color-txt-accent" />
              <div className="text-center">
                <p className="color-txt-main font-medium">Click to upload JSON file</p>
                <p className="color-txt-sub text-sm">or drag and drop</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-2xl color-bg-grey-5">
              <LuUpload size={20} className="color-txt-accent" />
              <span className="color-txt-main font-medium flex-1">{fileName}</span>
              <span className="color-txt-sub text-sm">{parsedQuestions.length} questions</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg color-bg-grey-10 color-txt-main text-sm hover:color-bg-accent transition-all"
              >
                Change
              </button>
            </div>
          )}

          {/* PDF Upload Section */}
          <div className="flex items-center gap-3 p-3 rounded-2xl color-bg-grey-5">
            <input
              type="file"
              ref={pdfInputRef}
              onChange={handlePdfSelect}
              accept=".pdf"
              multiple
              className="hidden"
            />
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-10 color-txt-main text-sm hover:color-bg-accent transition-all"
            >
              <LuFileText size={18} />
              Add PDF{pdfFiles.length > 0 ? 's' : ''}
            </button>
            
            {pdfFiles.length > 0 && (
              <>
                <span className="color-txt-sub text-sm">
                  {pdfFiles.length} PDF{pdfFiles.length !== 1 ? 's' : ''}
                </span>
                
                <button
                  onClick={removeAllPdfs}
                  className="p-2 rounded-lg color-bg-grey-10 hover:bg-red-500/50 transition-all"
                  title="Remove all PDFs"
                >
                  <LuX size={16} className="color-txt-sub" />
                </button>
              </>
            )}
          </div>

          {/* Question Selector */}
          {/* {parsedQuestions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap p-3 rounded-2xl color-bg-grey-5">
              <span className="color-txt-sub text-sm font-medium">Question:</span>
              {parsedQuestions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setSelectedQuestion(idx)
                    setSelectedPart(0)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedQuestion === idx
                      ? 'color-bg-accent color-txt-main'
                      : 'color-bg-grey-10 color-txt-sub hover:color-bg-accent/50'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          )} */}

          {/* Current Question JSON Editor */}
          {currentQuestion && (
            <div 
              className="flex-1 rounded-2xl overflow-auto transition-colors duration-200"
              style={{ backgroundColor: currentTheme.bg }}
            >
              <Editor
                value={editorText}
                onValueChange={handleQuestionJsonChange}
                highlight={highlightCode}
                padding={16}
                insertSpaces={true}
                ignoreTabKey={false}
                style={{
                  fontFamily: '"Fira Code", "Fira Mono", monospace',
                  fontSize: 13,
                  minHeight: '100%',
                  color: currentTheme.bg === '#ffffff' || currentTheme.bg === '#fafafa' || currentTheme.bg === '#faf8f5' ? '#24292e' : '#f8f8f2',
                }}
                className="focus:outline-none"
                textareaClassName="focus:outline-none"
              />
            </div>
          )}
          
          {/* Error Display */}
          {parseError && (
            <div className="flex items-center gap-2 p-4 rounded-2xl bg-red-500/20 text-red-400">
              <LuX size={18} />
              <span className="text-sm">{parseError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 flex-col">
            {uploadProgress && (
              <div className="flex items-center gap-2 p-3 rounded-xl color-bg-grey-10">
                <LuLoader size={16} className="color-txt-accent animate-spin" />
                <span className="color-txt-sub text-sm">{uploadProgress}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={parsedQuestions.length === 0 || isUploading}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl color-bg-accent color-txt-main font-medium transition-all ${
                  parsedQuestions.length === 0 || isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110'
                }`}
              >
                {isUploading ? (
                  <LuLoader size={18} className="animate-spin" />
                ) : (
                  <LuPlus size={18} />
                )}
                {isUploading ? 'Uploading...' : `Add ${parsedQuestions.length || 0} Question${parsedQuestions.length !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={handleClear}
                disabled={isUploading}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl color-bg-grey-5 color-txt-sub transition-all ${
                  isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:color-bg-grey-10'
                }`}
              >
                <LuTrash2 size={18} />
                Clear
              </button>
              <button
                onClick={handleDownloadJson}
                disabled={parsedQuestions.length === 0}
                className={`flex items-center gap-2 px-6 py-3 rounded-2xl color-bg-grey-10 color-txt-main transition-all ${
                  parsedQuestions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110'
                }`}
                title="Download all questions as JSON"
              >
                <LuFileText size={18} />
                Download JSON
              </button>
            </div>
          </div>
        </div>
        )}

        {/* MIDDLE/RIGHT SIDE - Preview Panel */}
        {showPreviewColumn && (
        <div className={`${columnWidths.preview} h-full overflow-hidden p-6 pl-0 transition-all duration-300 ease-in-out`}>
          <div className="w-full h-full rounded-2xl color-bg-grey-5 p-6 flex flex-col overflow-hidden">
            
            {parsedQuestions.length > 0 && currentQuestion ? (
              <div key={currentQuestion.id} className="flex-1 flex flex-col overflow-hidden">
                {/* Question Selector */}
                {parsedQuestions.length > 1 && (
                  <div className="flex flex-wrap gap-2 mb-4 max-h-24 overflow-y-auto p-3 rounded-xl color-bg-grey-10">
                    {parsedQuestions.map((q, qIdx) => (
                      <button
                        key={qIdx}
                        onClick={() => { setSelectedQuestion(qIdx); setSelectedPart(0); }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedQuestion === qIdx 
                            ? 'color-bg-accent color-txt-main' 
                            : 'color-bg-grey-5 color-txt-sub hover:color-bg-accent/50'
                        }`}
                        title={q.name}
                      >
                        {q.id.replace('CCQ', 'Q').replace(/^Q0+/, 'Q')}
                      </button>
                    ))}
                  </div>
                )}

                {/* Question Header Info - Compact horizontal layout */}
                <div className="mb-3 p-3 rounded-xl color-bg-grey-10 flex items-center gap-4 flex-wrap">
                  {/* Name & ID */}
                  <div className="flex items-center gap-2">
                    <span className="color-txt-main font-bold text-sm">{currentQuestion.name}</span>
                    <span className="color-bg-accent/30 color-txt-accent px-2 py-0.5 rounded-lg text-xs font-medium">
                      {currentQuestion.id}
                    </span>
                  </div>
                  
                  {/* Tags */}
                  <div className="flex gap-1.5">
                    {currentQuestion.tags?.map((tag, idx) => (
                      <span key={idx} className="color-bg-grey-5 px-2 py-0.5 rounded-full text-xs color-txt-sub">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Metadata */}
                  <div className="flex gap-3 text-xs color-txt-sub ml-auto">
                    <span>Diff: <span className="color-txt-main font-medium">{currentQuestion.difficulty}</span></span>
                    <span>Parts: <span className="color-txt-main font-medium">{currentQuestion.parts.length}</span></span>
                    <span className={`font-medium ${currentQuestion.isExamQ ? 'text-green-400' : 'text-red-400'}`}>
                      {currentQuestion.isExamQ ? 'Exam Q' : 'Practice'}
                    </span>
                  </div>
                </div>

                {/* Parts List */}
                <div className="flex-1 overflow-y-auto scrollbar-minimal pr-2">
                  {currentQuestion.parts.map((part, idx) => {
                    const partLetter = currentQuestion.parts.length > 1 ? PART_LETTERS[idx] : null
                    const imageKey = `${selectedQuestion}-${idx}`
                    const imageUpload = imageUploads[imageKey]

                    return (
                      <div 
                        key={idx}
                        ref={(el) => { partRefs.current[idx] = el }}
                        className={`mb-3 p-4 rounded-xl cursor-pointer transition-all duration-200 ${
                          selectedPart === idx 
                            ? 'color-bg-grey-10' 
                            : 'hover:color-bg-grey-10/50'
                        }`}
                        onClick={() => setSelectedPart(idx)}
                      >
                        {/* Part Label */}
                        {partLetter && (
                          <p className={`font-bold mb-2 text-sm ${selectedPart === idx ? 'color-txt-accent' : 'color-txt-sub'}`}>
                            Part {partLetter})
                          </p>
                        )}

                        {/* Image Upload Section */}
                        <div className="mb-4">
                          {imageUpload?.preview ? (
                            <div className="relative">
                              <img 
                                src={imageUpload.preview} 
                                alt={`Question ${currentQuestion.id} Part ${partLetter || '1'}`}
                                className="w-full max-h-48 object-contain rounded-lg color-bg-grey-5"
                              />
                              <div className="absolute top-2 right-2 flex gap-2">
                                {/* Ready indicator - image selected but not yet uploaded */}
                                {!imageUpload.storagePath && (
                                  <span className="px-2 py-1 rounded-lg bg-blue-500/80 text-white text-xs flex items-center gap-1">
                                    <LuCheck size={14} /> Ready
                                  </span>
                                )}
                                {/* Uploaded indicator */}
                                {imageUpload.storagePath && (
                                  <span className="px-2 py-1 rounded-lg bg-green-500/80 text-white text-xs flex items-center gap-1">
                                    <LuCheck size={14} /> Uploaded
                                  </span>
                                )}
                                {/* Remove button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removeImage(selectedQuestion, idx)
                                  }}
                                  className="p-2 rounded-lg bg-red-500/80 hover:bg-red-600 transition-all"
                                  title="Remove image"
                                >
                                  <LuX size={16} className="text-white" />
                                </button>
                              </div>
                              {/* Error message */}
                              {imageUpload.error && (
                                <p className="text-red-400 text-xs mt-2">{imageUpload.error}</p>
                              )}
                              {/* Storage path display */}
                              {imageUpload.storagePath && (
                                <p className="color-txt-sub text-xs mt-2 font-mono truncate" title={imageUpload.storagePath}>
                                  📁 {imageUpload.storagePath}
                                </p>
                              )}
                            </div>
                          ) : (
                            <label 
                              className="flex items-center justify-center gap-2 p-4 rounded-lg border-2 color-shadow border-dashed color-bg-grey-5 hover:color-bg-grey-10 transition-all cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleImageSelect(selectedQuestion, idx, file)
                                  e.target.value = '' // Reset so same file can be selected again
                                }}
                              />
                              <LuImage size={20} className="color-txt-accent" />
                              <span className="color-txt-sub text-sm">Click to add image</span>
                            </label>
                          )}
                        </div>

                        {/* Question Text */}
                        <div className="color-txt-sub mb-0">
                          <RenderMath text={part.question ?? ''} className="txt leading-relaxed" />
                        </div>

                        {/* Answer Testing Section */}
                        {part.inputs.length > 0 && (
                          <div className="mt-0 pt-2 ">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="color-txt-sub text-xs font-medium uppercase tracking-wide">Test Answer</span>
                              <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${part.orderMatters ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                Order {part.orderMatters ? 'Matters' : 'Flexible'}
                              </span>
                              {/* Result indicator */}
                              {testResults[`${currentQuestion.id}-${idx}`] !== undefined && (
                                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                                  testResults[`${currentQuestion.id}-${idx}`] 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {testResults[`${currentQuestion.id}-${idx}`] ? '✓ Correct' : '✗ Incorrect'}
                                </span>
                              )}
                            </div>

                            {/* Math Input Fields */}
                            <div className="flex items-center flex-wrap gap-2">
                              {part.inputs.map((input, inputIdx) => (
                                <MathInput
                                  key={inputIdx}
                                  index={inputIdx}
                                  prefix={[input.before, input.after]}
                                  setInputs={getSetInputsForPart(idx)}
                                  onEnter={() => handleCheckPart(idx)}
                                />
                              ))}
                              
                              {/* Check Button */}
                              <div
                                className="h-10 w-10 rounded-full color-bg-accent flex items-center justify-center cursor-pointer hover:brightness-110 transition-all"
                                onClick={() => handleCheckPart(idx)}
                                title="Check Answer"
                              >
                                <LuCheck strokeWidth={3} size={24} className="color-txt-accent" />
                              </div>
                            </div>

                            {/* Show Expected Answer */}
                            <div className="mt-3 text-xs color-txt-sub">
                              <span className="uppercase tracking-wide">Expected: </span>
                              <span className="color-txt-main font-mono bg-[var(--bg-grey-5)] px-2 py-0.5 rounded">{formatAnswers(part.inputs)}</span>
                            </div>
                          </div>
                        )}

                        {/* Divider */}
                        {idx < currentQuestion.parts.length - 1 && (
                          <div className="h-0 border-t border-white/10 mt-4"></div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Navigation Arrows */}
                <div className="flex justify-between items-center mt-4 pt-4 border-t border-[var(--bg-grey-10)]">
                  <button
                    onClick={goToPrevPart}
                    disabled={selectedQuestion === 0 && selectedPart === 0}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                      selectedQuestion === 0 && selectedPart === 0
                        ? 'opacity-30 cursor-not-allowed'
                        : 'color-bg-grey-10 hover:color-bg-accent color-txt-sub hover:color-txt-main'
                    }`}
                  >
                    <LuChevronLeft size={18} />
                    <span className="text-sm font-medium">Prev</span>
                  </button>
                  <span className="color-txt-sub text-sm font-medium">
                    Part {selectedPart + 1} of {currentQuestion.parts.length}
                  </span>
                  <button
                    onClick={goToNextPart}
                    disabled={
                      selectedQuestion === parsedQuestions.length - 1 && 
                      selectedPart === (currentQuestion?.parts?.length || 1) - 1
                    }
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                      selectedQuestion === parsedQuestions.length - 1 && 
                      selectedPart === (currentQuestion?.parts?.length || 1) - 1
                        ? 'opacity-30 cursor-not-allowed'
                        : 'color-bg-grey-10 hover:color-bg-accent color-txt-sub hover:color-txt-main'
                    }`}
                  >
                    <span className="text-sm font-medium">Next</span>
                    <LuChevronRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="text-center p-8 rounded-2xl color-bg-grey-10">
                  <p className="color-txt-sub text-lg mb-2">No questions to preview</p>
                  <p className="color-txt-sub/60 text-sm">Upload a JSON file to see a preview</p>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
        
        {/* PDF Viewer - Right or Third Column Position */}
        {(pdfPosition === 'right' || pdfPosition === 'third-column') && showPdf && (
          <div className={`${columnWidths.pdf} h-full p-2 transition-all duration-300 ease-in-out flex flex-col`}>
            {/* PDF Navigation */}
            {pdfFiles.length > 1 && (
              <div className="flex items-center justify-between gap-2 mb-2 px-2">
                <button
                  onClick={() => setCurrentPdfIndex(i => Math.max(0, i - 1))}
                  disabled={currentPdfIndex === 0}
                  className={`p-1 rounded-lg transition-all ${currentPdfIndex === 0 ? 'opacity-30' : 'hover:color-bg-grey-10'}`}
                >
                  <LuChevronLeft size={16} className="color-txt-main" />
                </button>
                <span className="color-txt-sub text-xs truncate flex-1 text-center" title={pdfFiles[currentPdfIndex]?.name}>
                  {currentPdfIndex + 1}/{pdfFiles.length}
                </span>
                <button
                  onClick={() => setCurrentPdfIndex(i => Math.min(pdfFiles.length - 1, i + 1))}
                  disabled={currentPdfIndex === pdfFiles.length - 1}
                  className={`p-1 rounded-lg transition-all ${currentPdfIndex === pdfFiles.length - 1 ? 'opacity-30' : 'hover:color-bg-grey-10'}`}
                >
                  <LuChevronRight size={16} className="color-txt-main" />
                </button>
                <button
                  onClick={removeCurrentPdf}
                  className="p-1 rounded-lg hover:bg-red-500/50 transition-all"
                  title="Remove this PDF"
                >
                  <LuX size={14} className="color-txt-sub" />
                </button>
              </div>
            )}
            <iframe
              src={pdfUrl}
              className="w-full flex-1 border-0 rounded-xl"
              title="PDF Preview"
            />
          </div>
        )}
      </div>
    </div>
  )
}

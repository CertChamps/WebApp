import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { LuX, LuCheck, LuOctagon } from 'react-icons/lu'
import { CirclePicker } from 'react-color'
import useQuestions from '../../hooks/useQuestions'
import RenderMath from '../math/mathdisplay'

// Add inline styles for animation
const styleSheet = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes slideUp {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-10px);
    }
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.8);
    }
  }
`

export type CreateDeckModalProps = {
  setShowCreateModal: Dispatch<SetStateAction<boolean>>
  isVisible: boolean
  setIsVisible: Dispatch<SetStateAction<boolean>>
  createDeck: (name: string, description: string, questionIds: string[], visibility: boolean, color: string) => Promise<void>
}

type Question = {
  id: string
  properties: any
  content: any[]
}

export default function CreateDeckModal(props: CreateDeckModalProps) {
  const modalRef = useRef<any>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [color, setColor] = useState('#FFFFFF')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Question[]>([])
  const [selectedQuestions, setSelectedQuestions] = useState<Question[]>([])
  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [errors, setErrors] = useState<{ name?: string; description?: string; questions?: string }>({})
  const [feedbackState, setFeedbackState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [feedbackExiting, setFeedbackExiting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { fetchAllQuestions } = useQuestions()

  useEffect(() => {
    // Trigger fade in animation
    props.setIsVisible(true)

    // Focus on name input when modal opens
    nameInputRef.current?.focus()

    // Handle click outside the modal
    function handleClickOutside(event: any) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose()
      }
    }

    // Add event listener when component mounts
    document.addEventListener('mousedown', handleClickOutside)

    // Clean up event listener when component unmounts
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Load all questions once for searching
  useEffect(() => {
    const init = async () => {
      const qs = await fetchAllQuestions()
      setAllQuestions(qs as Question[])
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Filter questions based on search term
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) {
      setSearchResults([])
      return
    }

    const filtered = allQuestions.filter((q) => {
      const nameMatch = q.properties?.name?.toLowerCase().includes(term)
      const tagMatch = (q.properties?.tags || []).some((t: string) => t.toLowerCase().includes(term))
      const contentMatch = q.content?.some((c: any) => (c.question || '').toLowerCase().includes(term))
      return nameMatch || tagMatch || contentMatch
    })

    setSearchResults(filtered.slice(0, 30))
  }, [searchTerm, allQuestions])

  const handleClose = () => {
    // Trigger fade out animation
    props.setIsVisible(false)

    // Wait for animation to complete before closing
    setTimeout(() => {
    setName('')
    setDesc('')
    setColor('#FFFFFF')
      setSearchTerm('')
      setSearchResults([])
      setSelectedQuestions([])
      setIsPublic(false)
      setErrors({})
      // Don't reset feedbackState and errorMessage here - they're handled separately
    }, 300) // Match this duration with the CSS transition duration

    setTimeout(() => {
      props.setShowCreateModal(false)
      // Don't reset feedbackState and errorMessage here - they're handled separately
    }, 1500) // Match this duration with the CSS transition duration
  }

  const handleCreate = async () => {
    const newErrors: { name?: string; description?: string; questions?: string } = {}

    // Validate deck name
    if (name.trim().length === 0) {
      newErrors.name = 'Deck name is required'
    } else if (name.trim().length > 20) {
      newErrors.name = 'Max 20 characters'
    }

    // Validate description
    if (desc.length > 50) {
      newErrors.description = 'Max 50 characters'
    }

    // Validate at least one question is selected
    if (selectedQuestions.length === 0) {
      newErrors.questions = 'At least one question must be selected'
    }

    setErrors(newErrors)

    // If no errors, create deck
    if (Object.keys(newErrors).length === 0) {
      try {
        setFeedbackState('loading')
        const questionIds = selectedQuestions.map((q) => q.id)
        await props.createDeck(name, desc, questionIds, isPublic, color)
        setFeedbackState('success')
        
        // Close modal immediately
        handleClose()
        
        // Keep feedback visible for 2.5 seconds, then fade out over 0.5 seconds
        setTimeout(() => {
          setFeedbackExiting(true)
          setTimeout(() => {
            setFeedbackState('idle')
            setErrorMessage('')
            setFeedbackExiting(false)
          }, 500)
        }, 1000)
      } catch (err) {
        setFeedbackState('error')
        setErrorMessage(err instanceof Error ? err.message : 'Failed to create deck')
        
        // Reset error state after 3 seconds
        setTimeout(() => {
          setFeedbackState('idle')
          setErrorMessage('')
        }, 3000)
      }
    }
  }

  const toggleQuestion = (question: Question) => {
    setSelectedQuestions((prev) => {
      const exists = prev.some((q) => q.id === question.id)
      if (exists) {
        return prev.filter((q) => q.id !== question.id)
      }
      return [...prev, question]
    })
  }

  // Helper function to get the first error by priority
  const getFirstError = (): { field?: string; message?: string } => {
    if (errors.name) return { field: 'name', message: errors.name }
    if (errors.description) return { field: 'description', message: errors.description }
    if (errors.questions) return { field: 'questions', message: errors.questions }
    return {}
  }

  return (
    <>
      <style>{styleSheet}</style>
      <div
        className={`absolute left-0 top-0 w-[100vw] h-[100vh] color-bg-grey-10 z-50
          flex items-center justify-center transition-opacity duration-300
          ${props.isVisible ? 'opacity-100' : 'opacity-0'}`}
      >
      <div
        ref={modalRef}
        className={`w-[50%] h-[80%] color-bg border-2 color-shadow rounded-out p-6
          transition-transform duration-300 flex flex-col
          ${props.isVisible ? 'scale-100' : 'scale-95'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="txt-heading-colour text-xl font-bold">Create New Deck</h2>
          <LuX
            className="color-txt-sub cursor-pointer hover:color-txt-main"
            strokeWidth={2}
            size={24}
            onClick={handleClose}
          />
        </div>
        <div className="overflow-y-auto scrollbar-minimal flex-1 pr-2">
        
        {/* Name, Description and Color Picker Row */}
        <div className="flex gap-6 mb-6">
          <div className="flex-1">
            {/* Name Input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="color-txt-main font-semibold">Deck Name</label>
                {getFirstError().field === 'name' && (
                  <span className="txt-sub text-red-400 font-semibold text-sm">{getFirstError().message}</span>
                )}
              </div>
              <input
                ref={nameInputRef}
                type="text"
                className="txtbox w-full p-2"
                placeholder="Enter deck name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Description Input */}
            <div className="">
              <div className="flex items-center justify-between mb-2">
                <label className="color-txt-main font-semibold">Description</label>
                {getFirstError().field === 'description' && (
                  <span className="txt-sub text-red-400 font-semibold text-sm">{getFirstError().message}</span>
                )}
              </div>
              <input
                type="text"
                className="txtbox w-full p-2"
                placeholder="Enter deck description"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div className='w-1/3'>
            <label className="color-txt-main block mb-2 font-semibold">Deck Color</label>
            <CirclePicker
              color={color}
              onChangeComplete={(picked: any) => setColor(picked.hex)}
            />
          </div>
        </div>

        {/* Public/Private Toggle */}
        <div className="mb-6">
          <label className="color-txt-main block mb-2 font-semibold">Visibility</label>
          <div className="flex items-center gap-3">
            <span className={`txt-sub transition-colors ${!isPublic ? 'color-txt-accent font-semibold' : 'color-txt-sub font-semibold'}`}>
              Private
            </span>
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={`relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-offset-2 ${
                isPublic ? 'color-bg-accent' : 'color-bg-grey-5'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ease-in-out ${
                  isPublic ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`txt-sub transition-colors ${isPublic ? 'color-txt-accent font-semibold' : 'color-txt-sub font-semibold'}`}>
              Public
            </span>
          </div>
        </div>

        {/* Add Questions */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="color-txt-main font-semibold">Add Questions</label>
            {getFirstError().field === 'questions' && (
              <span className="txt-sub text-red-400 font-semibold text-sm">{getFirstError().message}</span>
            )}
          </div>
          <input
            type="text"
            className="txtbox w-full p-2"
            placeholder="Search questions by name, tag, or text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => {
              setShowDropdown(true)
              setIsClosing(false)
            }}
            onBlur={() => {
              setIsClosing(true)
              setTimeout(() => {
                setShowDropdown(false)
                setIsClosing(false)
              }, 200)
            }}
          />

          {showDropdown && (
            <div 
              className="mt-2 max-h-48 overflow-y-auto scrollbar-minimal border color-shadow rounded-out p-2 color-bg-grey-5"
              style={{
                animation: isClosing ? 'slideUp 0.2s ease-out' : 'slideDown 0.2s ease-out',
                transformOrigin: 'top'
              }}
            >
              {searchResults.length > 0 ? (
                searchResults.map((q) => {
                  const isSelected = selectedQuestions.some((s) => s.id === q.id)
                  return (
                    <div
                      key={q.id}
                      className={`p-2 mb-2 rounded cursor-pointer transition-colors ${isSelected ? 'color-bg-grey-10' : 'hover:color-bg-grey-10'}`}
                      onClick={() => toggleQuestion(q)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="txt-bold color-txt-main">{q.properties?.name || 'Untitled question'}</span>
                        <span className="txt-sub color-txt-sub text-xs">{q.properties?.tags?.join(', ')}</span>
                      </div>
                      {q.content?.[0]?.question ? (
                        <RenderMath
                          className="txt-sub color-txt-sub line-clamp-2 mt-1"
                          text={q.content[0].question}
                        />
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="p-4 text-center color-txt-sub italic">
                  {searchTerm.trim() ? 'No questions found' : 'Start typing to search...'}
                </div>
              )}
            </div>
          )}

          {selectedQuestions.length > 0 && (
            <div className="mt-3">
              <p className="color-txt-main mb-2 font-semibold">Selected Questions</p>
              <div className="flex flex-col gap-2">
                {selectedQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-2 rounded color-bg-grey-5 color-txt-main"
                  >
                    <span className="flex-1">{q.properties?.name || 'Untitled question'}</span>
                    <LuX
                      className="ml-2 cursor-pointer color-txt-sub hover:color-txt-main transition-colors"
                      strokeWidth={2}
                      size={18}
                      onClick={() => toggleQuestion(q)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Create Button */}
        <div className="flex justify-end gap-3 pt-4 border-t color-shadow mt-4">
          <button
            className="color-txt-sub px-4 py-2 rounded cursor-pointer hover:color-txt-main"
            onClick={handleClose}
            disabled={feedbackState === 'loading'}
          >
            Cancel
          </button>
          <button
            className="blue-btn cursor-pointer px-4 py-2"
            onClick={handleCreate}
            disabled={!name.trim() || feedbackState === 'loading'}
          >
            {feedbackState === 'loading' ? 'Creating...' : 'Create Deck'}
          </button>
        </div>
      </div>
    </div>

    {/* Feedback Display - Outside modal so it persists independently */}
    {feedbackState !== 'idle' && (
      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 p-4 rounded-out flex items-center justify-center gap-3 z-[9999]"
        style={{
          animation: feedbackExiting ? 'fadeOut 0.5s ease-out forwards' : 'scaleIn 0.3s ease-out',
          backgroundColor: feedbackState === 'loading' ? 'rgba(59, 130, 246, 0.1)' :
            feedbackState === 'success' ? 'rgba(34, 197, 94, 0.1)' :
            'rgba(239, 68, 68, 0.1)',
          borderLeft: `4px solid ${feedbackState === 'loading' ? '#3b82f6' :
            feedbackState === 'success' ? '#22c55e' :
            '#ef4444'}`
        }}>
        {feedbackState === 'loading' && (
          <>
            <div style={{ animation: 'spin 1s linear infinite' }} className="color-txt-accent">
              <div className="w-5 h-5 border-2 border-transparent border-t-current border-r-current rounded-full" />
            </div>
            <span className="color-txt-main font-semibold">Creating deck...</span>
          </>
        )}
        {feedbackState === 'success' && (
          <>
            <LuCheck className="color-txt-main" size={24} strokeWidth={3} />
            <span className="color-txt-main font-semibold">Deck created successfully!</span>
          </>
        )}
        {feedbackState === 'error' && (
          <>
            <LuOctagon className="text-red-500" size={24} strokeWidth={2} />
            <div className="flex flex-col">
              <span className="text-red-600 font-semibold">Failed to create deck</span>
              <span className="text-red-500 text-sm">{errorMessage}</span>
            </div>
          </>
        )}
      </div>
    )}
    </>
  )
}

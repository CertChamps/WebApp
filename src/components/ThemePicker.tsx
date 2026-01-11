import { useContext, useState, useRef, useEffect, useMemo } from 'react'
import { OptionsContext } from '../context/OptionsContext'
import { LuPalette, LuCheck, LuSearch } from 'react-icons/lu'

// Theme definitions with their Tailwind classes
// (Keeping your original themes list mostly intact, mapped to the visual style)
const THEMES = [
  { id: 'light', name: 'Light', bg: 'bg-white', accent: 'bg-blue', primary: 'bg-black', sub: 'bg-grey' },
  { id: 'dark', name: 'Dark', bg: 'bg-black', accent: 'bg-blue-light', primary: 'bg-white', sub: 'bg-light-grey' },
  { id: 'icebergLight', name: 'Iceberg Light', bg: 'bg-icebergLightBG', accent: 'bg-icebergLightAccent', primary: 'bg-icebergLightPrimary', sub: 'bg-icebergLightSub' },
  { id: 'icebergDark', name: 'Iceberg Dark', bg: 'bg-icebergDarkBG', accent: 'bg-icebergDarkAccent', primary: 'bg-icebergDarkPrimary', sub: 'bg-icebergDarkSub' },
  { id: 'nordLight', name: 'Nord Light', bg: 'bg-nordLightBG', accent: 'bg-nordLightAccent', primary: 'bg-nordLightPrimary', sub: 'bg-nordLightSub' },
  { id: 'nordDark', name: 'Nord Dark', bg: 'bg-nordDarkBG', accent: 'bg-nordDarkAccent', primary: 'bg-nordDarkPrimary', sub: 'bg-nordDarkSub' },
  { id: 'modernInk', name: 'Modern Ink', bg: 'bg-modernInkBG', accent: 'bg-modernInkAccent', primary: 'bg-modernInkPrimary', sub: 'bg-modernInkSub' },
  { id: 'magicGirl', name: 'Magic Girl', bg: 'bg-magicGirlBG', accent: 'bg-magicGirlAccent', primary: 'bg-magicGirlPrimary', sub: 'bg-magicGirlSub' },
  { id: 'lavendar', name: 'Lavender', bg: 'bg-lavendarBG', accent: 'bg-lavendarAccent', primary: 'bg-lavendarPrimary', sub: 'bg-lavendarSub' },
  { id: 'airplane', name: 'Airplane', bg: 'bg-airplaneBG', accent: 'bg-airplaneAccent', primary: 'bg-airplanePrimary', sub: 'bg-airplaneSub' },
  { id: 'sewingTinLight', name: 'Sewing Tin', bg: 'bg-sewingTinLightBG', accent: 'bg-sewingTinLightAccent', primary: 'bg-sewingTinLightPrimary', sub: 'bg-sewingTinLightSub' },
  { id: 'camping', name: 'Camping', bg: 'bg-campingBG', accent: 'bg-campingAccent', primary: 'bg-campingPrimary', sub: 'bg-campingSub' },
  { id: 'paper', name: 'Paper', bg: 'bg-paperBG', accent: 'bg-paperAccent', primary: 'bg-paperPrimary', sub: 'bg-paperSub' },
  { id: 'tangerine', name: 'Tangerine', bg: 'bg-tangerineBG', accent: 'bg-tangerineAccent', primary: 'bg-tangerinePrimary', sub: 'bg-tangerineSub' },
  { id: 'menthol', name: 'Menthol', bg: 'bg-mentholBG', accent: 'bg-mentholAccent', primary: 'bg-mentholPrimary', sub: 'bg-mentholSub' },
  { id: 'markoblank', name: 'Markoblank', bg: 'bg-markoteal', accent: 'bg-markored', primary: 'bg-markobrown', sub: 'bg-markogrey' },
  { id: 'aurora', name: 'Aurora', bg: 'bg-auroraBG', accent: 'bg-auroraAccent1', primary: 'bg-auroraPrimary', sub: 'bg-auroraSub1' },
  { id: 'gruvbox', name: 'Gruvbox', bg: 'bg-gruvboxBG', accent: 'bg-gruvboxAccent', primary: 'bg-gruvboxPrimary', sub: 'bg-gruvboxSub' },
  { id: 'husqy', name: 'Husqy', bg: 'bg-husqyBG', accent: 'bg-husqyAccent', primary: 'bg-husqyPrimary', sub: 'bg-husqySub' },
  { id: 'shadow', name: 'Shadow', bg: 'bg-shadowBG', accent: 'bg-shadowAccent', primary: 'bg-shadowPrimary', sub: 'bg-shadowSub' },
  { id: 'blueberryLight', name: 'Blueberry Light', bg: 'bg-blueberryLightBG', accent: 'bg-blueberryLightAccent', primary: 'bg-blueberryLightPrimary', sub: 'bg-blueberryLightSub' },
  { id: 'blueberryDark', name: 'Blueberry Dark', bg: 'bg-blueberryDarkBG', accent: 'bg-blueberryDarkAccent', primary: 'bg-blueberryDarkPrimary', sub: 'bg-blueberryDarkSub' },
]

type ThemePickerProps = {
  show: boolean
  setShow: React.Dispatch<React.SetStateAction<boolean>>
}

export default function ThemePicker({ show, setShow }: ThemePickerProps) {
  const { options, setOptions } = useContext(OptionsContext)
  const [previewTheme, setPreviewTheme] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const originalTheme = useRef<string>(options.theme)

  const filteredThemes = useMemo(() => {
    return THEMES.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  }, [searchQuery])

  // Handle opening animation and focus
  useEffect(() => {
    if (show) {
      originalTheme.current = options.theme
      setIsVisible(true)
      setSearchQuery('')
      // Small delay to allow render before focusing input
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [show]) // Only run when show changes, not when theme changes

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    if (show) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [show, previewTheme])

  const handleClose = () => {
    // Restore original theme if we were previewing
    if (previewTheme) {
      setOptions((opts: any) => ({ ...opts, theme: originalTheme.current }))
    }
    setPreviewTheme(null)
    setIsVisible(false)
    setTimeout(() => setShow(false), 200)
  }

  // Preview theme on hover
  const handleMouseEnter = (themeId: string) => {
    if (previewTheme === themeId) return // Already previewing this theme
    setPreviewTheme(themeId)
    setOptions((opts: any) => ({ ...opts, theme: themeId }))
  }

  // Restore original on mouse leave (if not selected)
  const handleMouseLeave = () => {
    if (previewTheme) {
      setOptions((opts: any) => ({ ...opts, theme: originalTheme.current }))
      setPreviewTheme(null)
    }
  }

  // Select theme permanently
  const handleSelect = (themeId: string) => {
    originalTheme.current = themeId
    setOptions((opts: any) => ({ ...opts, theme: themeId }))
    setPreviewTheme(null)
    handleClose()
  }

  if (!show) return null

  return (
    <div 
      className={`absolute left-0 top-0 w-[100vw] h-[100vh] color-bg-grey-10 z-50
        flex items-center justify-center transition-opacity duration-300
        ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div 
        ref={containerRef}
        className="w-full max-w-xl max-h-[70vh] rounded-lg color-bg overflow-hidden flex flex-col border border-transparent"
      >
        {/* Search Bar Input area */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <LuSearch className="color-txt-sub text-sm opacity-50" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Theme..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none color-txt-sub placeholder:opacity-50 text-sm"
            autoFocus
          />
        </div>

        {/* Theme List */}
        <div 
          className="flex-1 overflow-y-auto scrollbar-minimal px-1.5 pb-1.5"
        >
          <div 
            className="flex flex-col"
            onMouseLeave={handleMouseLeave}
          >
            {filteredThemes.map((theme) => {
              const isActive = originalTheme.current === theme.id;
              
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelect(theme.id)}
                  onMouseEnter={() => handleMouseEnter(theme.id)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded transition-colors duration-75 group w-full
                    ${isActive 
                      ? 'color-bg-main color-txt-bg'
                      : 'hover:color-bg-sub/10 color-txt-sub'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Checkmark (only visible if active) */}
                    <div className="w-3 h-3 flex items-center justify-center">
                       {isActive && <LuCheck size={12} className="opacity-100" />}
                    </div>
                    
                    {/* Theme name */}
                    <span className={`text-left text-sm ${isActive ? '' : 'opacity-70 group-hover:opacity-100'}`}>
                      {theme.name}
                    </span>
                  </div>

                  {/* Color Circles on the Right - with background color box */}
                  <div className={`flex items-center gap-1 px-1.5 py-1 rounded-full ${theme.bg}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${theme.accent}`} />
                    <div className={`w-2.5 h-2.5 rounded-full ${theme.primary}`} />
                    <div className={`w-2.5 h-2.5 rounded-full ${theme.sub}`} />
                  </div>
                </button>
              )
            })}
            
            {filteredThemes.length === 0 && (
              <div className="p-4 text-center color-txt-sub opacity-50 text-xs">
                No themes found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Floating button component for bottom right corner
export function ThemePickerButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 p-3 rounded-full color-bg-accent
        hover:scale-110 hover:brightness-110 transition-all duration-200 z-40 group"
      title="Change theme"
    >
      <LuPalette size={24} className="color-txt-accent" />
    </button>
  )
}
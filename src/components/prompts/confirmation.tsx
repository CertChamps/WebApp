import { useEffect, useState } from 'react'

export type ConfirmationPromptProps = {
	open: boolean
	title: string
	message: string
	onConfirm: () => void | Promise<void>
	onCancel?: () => void
	confirmText?: string
	cancelText?: string
}

export default function ConfirmationPrompt({
	open,
	title,
	message,
	onConfirm,
	onCancel,
	confirmText = 'Confirm',
	cancelText = 'Cancel'
}: ConfirmationPromptProps) {
	const [isVisible, setIsVisible] = useState(false)
	const [isLoading, setIsLoading] = useState(false)

	useEffect(() => {
		// small delay to allow CSS transition
		if (open) {
			const t = setTimeout(() => setIsVisible(true), 10)
			return () => clearTimeout(t)
		}
		setIsVisible(false)
	}, [open])

	const handleConfirm = async () => {
		try {
			setIsLoading(true)
			await onConfirm()
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<div
			className={`absolute inset-0 flex items-center justify-center color-bg-grey-10 transition-opacity duration-300 z-50 ${
				open ? 'opacity-100' : 'opacity-0 pointer-events-none'
			}`}
		>
			<div
				className={`w-[30%] max-w-xl color-bg border-2 color-shadow rounded-out p-6 transition-transform duration-300 ${
					isVisible ? 'scale-100' : 'scale-95'
				}`}
			>
				<p className="txt-heading-colour text-lg font-bold mb-2 text-center">{title}</p>
				<p className="color-txt-main text-center mb-6">{message}</p>

				<div className="flex justify-center gap-3">
					<button
						className="txtbox border-0 px-4 py-2 color-bg-grey-5 hover:opacity-80 transition disabled:opacity-50"
						onClick={onCancel}
						disabled={isLoading}
					>
						{cancelText}
					</button>
					<button
						className="blue-btn px-4 py-2 min-w-[110px] text-center disabled:opacity-70"
						onClick={handleConfirm}
						disabled={isLoading}
					>
						{isLoading ? 'Working...' : confirmText}
					</button>
				</div>
			</div>
		</div>
	)
}

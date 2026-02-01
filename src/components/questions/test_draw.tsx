import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

export default function TestDraw() {
	return (
		<div style={{ inset: 0, width: '98%', height: '100%', zIndex: 1000, backgroundColor: 'white', marginLeft: '3%', borderRadius: '8px' }}>
			<Tldraw />
		</div>
	)
}
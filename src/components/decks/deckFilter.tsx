import { LuSearch } from 'react-icons/lu'

type DeckFilterProps = {
	search: string
	setSearch: (value: string) => void
	selectedCategory: 'all' | 'certchamps' | 'textsAndTests' | 'userCreated'
	setSelectedCategory: (value: 'all' | 'certchamps' | 'textsAndTests' | 'userCreated') => void
	sortBy: 'dateCreated' | 'name' | 'questions'
	setSortBy: (value: 'dateCreated' | 'name' | 'questions') => void
	selectedTopics: string[]
	setSelectedTopics: (value: string[]) => void
	availableTopics: string[]
}

export default function DeckFilter({
	search,
	setSearch,
	selectedCategory,
	setSelectedCategory,
	sortBy,
	setSortBy,
	selectedTopics,
	setSelectedTopics,
	availableTopics
}: DeckFilterProps) {
	return (
		<div className="w-64 flex-shrink-0 color-bg rounded-2xl p-1 space-y-2">
			{/* Search Input */}
			<div className="flex items-center txtbox w-full color-bg">
				<input
					type="text"
					placeholder="Search Decks"
					className="w-full p-1 outline-none border-none text-sm"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<LuSearch className="color-txt-sub" size={18} />
			</div>

			{/* Category Filters */}
			<div className="space-y-2 pb-1">
				<p className="txt-bold">Deck Types:</p>
				<label className="flex items-center gap-2 mx-2 cursor-pointer group">
					<input
						type="checkbox"
						checked={selectedCategory === 'certchamps'}
						onChange={() => setSelectedCategory(selectedCategory === 'certchamps' ? 'all' : 'certchamps')}
						className="w-4 h-4 cursor-pointer"
					/>
					<span className="txt-sub font-semibold group-hover:opacity-70 transition-opacity">Certchamps Officals</span>
				</label>
				<label className="flex items-center gap-2 mx-2 cursor-pointer group">
					<input
						type="checkbox"
						checked={selectedCategory === 'userCreated'}
						onChange={() => setSelectedCategory(selectedCategory === 'userCreated' ? 'all' : 'userCreated')}
						className="w-4 h-4 cursor-pointer"
					/>
					<span className="txt-sub font-semibold group-hover:opacity-70 transition-opacity">User Created</span>
				</label>
			</div>

			{/* Dividers */}
			<div className="line"></div>

			{/* Sort By */}
			<div className="space-y-2 py-1">
				<label className="txt-bold flex items-center gap-2">
					Sort By:
					<select
						value={sortBy}
						onChange={(e) => setSortBy(e.target.value as 'dateCreated' | 'name' | 'questions')}
						className="color-bg txtbox px-2 py-1 rounded cursor-pointer text-sm outline-none"
					>
						<option value="dateCreated">Date Created</option>
						<option value="name">Name</option>
                        <option value="questions">Number of Questions</option>
					</select>
				</label>
			</div>

			{/* Dividers */}
			<div className="line"></div>

			{/* Topics */}
			<div className="space-y-2">
				<p className="txt-bold">Topics:</p>
				<div className="space-y-1.5 max-h-64 pb-6 mx-2 overflow-y-auto scrollbar-minimal">
					{availableTopics.map((topic) => (
						<label key={topic} className="flex items-center gap-2 cursor-pointer group">
							<input
								type="checkbox"
								checked={selectedTopics.includes(topic)}
								onChange={(e) => {
									if (e.target.checked) {
										setSelectedTopics([...selectedTopics, topic])
									} else {
										setSelectedTopics(selectedTopics.filter(t => t !== topic))
									}
								}}
								className="w-4 h-4 cursor-pointer rounded-in border-3"
							/>
							<span className="txt-sub font-semibold group-hover:opacity-70 transition-opacity">{topic}</span>
						</label>
					))}
				</div>
			</div>
		</div>
	)
}

import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    private enum Destination: String {
        case question
        case discover

        var label: String {
            self == .question ? "Add to question" : "Upload to Discover"
        }
    }

    /// What the host app handed us — decided up front so unavailable destinations
    /// can be disabled before the user taps Send.
    private enum SharedKind {
        case pdf
        case image
        case link
        case unknown
    }

    private struct PendingShare: Codable {
        let id: String
        let destination: String
        let kind: String
        let fileName: String?
        let mimeType: String?
        let url: String?
        let title: String?
        let description: String?
        let createdAt: Double
    }

    private let appGroupIdentifier = "group.com.certchamps.app"
    private let maximumFileBytes: Int64 = 25 * 1024 * 1024
    private var destination: Destination = .question
    private var isSaving = false
    private var didPrefill = false
    private lazy var sharedKind: SharedKind = detectSharedKind()

    private let titleField: UITextField = {
        let field = UITextField()
        field.translatesAutoresizingMaskIntoConstraints = false
        field.placeholder = "Resource or question name"
        field.borderStyle = .roundedRect
        field.clearButtonMode = .whileEditing
        field.returnKeyType = .done
        return field
    }()

    private let descriptionTextView: UITextView = {
        let textView = UITextView()
        textView.translatesAutoresizingMaskIntoConstraints = false
        textView.font = .preferredFont(forTextStyle: .body)
        textView.layer.cornerRadius = 8
        textView.layer.borderWidth = 1
        textView.layer.borderColor = UIColor.separator.cgColor
        textView.textContainerInset = UIEdgeInsets(top: 10, left: 8, bottom: 10, right: 8)
        return textView
    }()

    private let destinationControl: UISegmentedControl = {
        let control = UISegmentedControl(items: ["Add to question", "Upload to Discover"])
        control.translatesAutoresizingMaskIntoConstraints = false
        control.selectedSegmentIndex = 0
        control.apportionsSegmentWidthsByContent = false
        return control
    }()

    private let sendButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("Send", for: .normal)
        button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        return button
    }()

    private let activityIndicator: UIActivityIndicatorView = {
        let indicator = UIActivityIndicatorView(style: .medium)
        indicator.translatesAutoresizingMaskIntoConstraints = false
        indicator.hidesWhenStopped = true
        return indicator
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        setupInterface()
        applyDestinationAvailability()
        prefillFromSharedItem()
    }

    private func setupInterface() {
        view.backgroundColor = .systemBackground
        preferredContentSize = CGSize(width: 0, height: 360)

        let cancelButton = UIButton(type: .system)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        sendButton.addTarget(self, action: #selector(sendTapped), for: .touchUpInside)
        titleField.addTarget(self, action: #selector(titleDidEndOnReturn), for: .editingDidEndOnExit)

        let heading = UILabel()
        heading.translatesAutoresizingMaskIntoConstraints = false
        heading.text = "Share to CertChamps"
        heading.font = .preferredFont(forTextStyle: .headline)
        heading.textAlignment = .center

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(cancelButton)
        header.addSubview(heading)
        header.addSubview(sendButton)
        header.addSubview(activityIndicator)

        let divider = UIView()
        divider.translatesAutoresizingMaskIntoConstraints = false
        divider.backgroundColor = .separator
        header.addSubview(divider)

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.keyboardDismissMode = .interactive
        scrollView.alwaysBounceVertical = false

        let content = UIStackView()
        content.translatesAutoresizingMaskIntoConstraints = false
        content.axis = .vertical
        content.spacing = 9

        let destinationLabel = makeLabel("Send to")
        let titleLabel = makeLabel("Title")
        let descriptionLabel = makeLabel("Description (optional)")

        content.addArrangedSubview(destinationLabel)
        content.addArrangedSubview(destinationControl)
        content.setCustomSpacing(18, after: destinationControl)
        content.addArrangedSubview(titleLabel)
        content.addArrangedSubview(titleField)
        content.setCustomSpacing(18, after: titleField)
        content.addArrangedSubview(descriptionLabel)
        content.addArrangedSubview(descriptionTextView)
        scrollView.addSubview(content)
        view.addSubview(header)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 54),
            cancelButton.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            cancelButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            heading.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            heading.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            sendButton.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
            sendButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            activityIndicator.trailingAnchor.constraint(equalTo: sendButton.leadingAnchor, constant: -7),
            activityIndicator.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            divider.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            divider.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            divider.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            divider.heightAnchor.constraint(equalToConstant: 0.5),
            scrollView.topAnchor.constraint(equalTo: header.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            content.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 18),
            content.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 18),
            content.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -18),
            content.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -18),
            destinationControl.heightAnchor.constraint(equalToConstant: 36),
            titleField.heightAnchor.constraint(equalToConstant: 40),
            descriptionTextView.heightAnchor.constraint(equalToConstant: 110),
        ])
    }

    private func makeLabel(_ text: String) -> UILabel {
        let label = UILabel()
        label.text = text
        label.font = .preferredFont(forTextStyle: .subheadline)
        label.textColor = .label
        return label
    }

    private func itemProviders() -> [NSItemProvider] {
        extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []
    }

    private func detectSharedKind() -> SharedKind {
        let providers = itemProviders()
        if providers.contains(where: { $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) }) {
            return .pdf
        }
        if providers.contains(where: isImageProvider)
            || providers.contains(where: { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }) {
            return .image
        }
        if providers.contains(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
                || $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }) {
            return .link
        }
        return .unknown
    }

    /// Grey out the destination the shared content can't reach, so an unsupported
    /// combination is refused here instead of inside the app.
    private func applyDestinationAvailability() {
        switch sharedKind {
        case .image:
            destinationControl.selectedSegmentIndex = 0
            destinationControl.setEnabled(false, forSegmentAt: 1)
        case .link:
            destinationControl.selectedSegmentIndex = 1
        case .pdf, .unknown:
            break
        }
    }

    private func prefillFromSharedItem() {
        guard !didPrefill else { return }
        didPrefill = true
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        let sharedText = items.first?.attributedContentText?.string
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !sharedText.isEmpty && firstWebURL(in: sharedText) == nil {
            descriptionTextView.text = String(sharedText.prefix(240))
        }

        // Do not consume file representations just to prefill a title. Some host apps
        // only vend the attachment once; Send is the point at which we load the file.
        if let name = providers.compactMap(\.suggestedName).first,
           !name.isEmpty,
           !looksLikeOpaqueId(name) {
            titleField.text = displayName(from: name)
            return
        }
        guard let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
        }) else { return }
        Task {
            guard let item = try? await loadItem(from: provider, typeIdentifier: UTType.url.identifier) else {
                return
            }
            let url = self.sharedURL(item)
            await MainActor.run {
                if !(self.titleField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return
                }
                self.titleField.text = url?.host?.replacingOccurrences(of: "www.", with: "")
            }
        }
    }

    @objc private func cancelTapped() {
        extensionContext?.cancelRequest(withError: ShareError.cancelled)
    }

    @objc private func titleDidEndOnReturn() {
        titleField.resignFirstResponder()
    }

    @objc private func sendTapped() {
        guard !isSaving else { return }
        destination = destinationControl.selectedSegmentIndex == 0 ? .question : .discover
        if sharedKind == .image && destination == .discover {
            presentError(ShareError.discoverImageUnsupported.localizedDescription)
            return
        }
        isSaving = true
        sendButton.isEnabled = false
        destinationControl.isEnabled = false
        titleField.isEnabled = false
        descriptionTextView.isEditable = false
        activityIndicator.startAnimating()

        Task {
            do {
                try await saveFirstSupportedItem()
                await MainActor.run { self.openContainingApp() }
            } catch {
                await MainActor.run {
                    self.isSaving = false
                    self.sendButton.isEnabled = true
                    self.destinationControl.isEnabled = true
                    self.titleField.isEnabled = true
                    self.descriptionTextView.isEditable = true
                    self.activityIndicator.stopAnimating()
                    self.presentError(error.localizedDescription)
                }
            }
        }
    }

    private func saveFirstSupportedItem() async throws {
        let providers = itemProviders()

        if let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier)
        }) {
            try await saveFile(from: provider, type: .pdf)
            return
        }
        if let imageURL = try? await extractAnySharedImage() {
            if destination == .discover { throw ShareError.discoverImageUnsupported }
            defer { try? FileManager.default.removeItem(at: imageURL.deletingLastPathComponent()) }
            let webSafe = try makeWebSafeImage(imageURL)
            defer {
                if webSafe != imageURL {
                    try? FileManager.default.removeItem(at: webSafe.deletingLastPathComponent())
                }
            }
            try writeQueuedFile(webSafe, provider: providers.first ?? NSItemProvider(), kind: "image", type: .jpeg)
            return
        }
        if let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
        }) {
            let item = try await loadItem(from: provider, typeIdentifier: UTType.url.identifier)
            if let url = self.sharedURL(item) {
                if destination == .question {
                    try await saveRemoteImage(from: url, provider: provider)
                    return
                }
                try saveURL(url)
                return
            }
        }
        if let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
        }) {
            let item = try await loadItem(from: provider, typeIdentifier: UTType.plainText.identifier)
            if let text = item as? String, let url = firstWebURL(in: text) {
                if destination == .question {
                    try await saveRemoteImage(from: url, provider: provider)
                    return
                }
                try saveURL(url)
                return
            }
        }
        if let url = firstWebURL(in: sharedInputText()) ?? firstWebURL(in: descriptionTextView.text) {
            if destination == .question, let provider = providers.first {
                try await saveRemoteImage(from: url, provider: provider)
                return
            }
            try saveURL(url)
            return
        }
        throw ShareError.unsupported
    }

    private func saveFile(from provider: NSItemProvider, type: UTType) async throws {
        let sourceURL = try await loadFile(from: provider, typeIdentifier: type.identifier)
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }
        try writeQueuedFile(sourceURL, provider: provider, kind: type == .pdf ? "pdf" : "image", type: type)
    }

    private func saveImage(from provider: NSItemProvider) async throws {
        let sourceURL = try await loadSharedImage(from: provider)
        if destination == .discover { throw ShareError.discoverImageUnsupported }
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }
        let webSafe = try makeWebSafeImage(sourceURL)
        defer {
            if webSafe != sourceURL {
                try? FileManager.default.removeItem(at: webSafe.deletingLastPathComponent())
            }
        }
        try writeQueuedFile(webSafe, provider: provider, kind: "image", type: .jpeg)
    }

    private func writeQueuedFile(
        _ sourceURL: URL,
        provider: NSItemProvider,
        kind: String,
        type: UTType
    ) throws {
        let attributes = try FileManager.default.attributesOfItem(atPath: sourceURL.path)
        let size = (attributes[.size] as? NSNumber)?.int64Value ?? 0
        guard size <= maximumFileBytes else { throw ShareError.fileTooLarge }
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else {
            throw ShareError.appGroupUnavailable
        }

        let queue = container.appendingPathComponent("IncomingShares", isDirectory: true)
        try FileManager.default.createDirectory(at: queue, withIntermediateDirectories: true)
        let id = UUID().uuidString
        var fileName = preferredFileName(provider: provider, sourceURL: sourceURL)
        if kind == "image" {
            fileName = URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent + ".jpg"
        }
        let originalExtension = sourceURL.pathExtension
        if URL(fileURLWithPath: fileName).pathExtension.isEmpty && !originalExtension.isEmpty {
            fileName += ".\(originalExtension)"
        }
        let safeName = fileName.replacingOccurrences(
            of: "[^A-Za-z0-9._-]",
            with: "_",
            options: .regularExpression
        )
        let payloadURL = queue.appendingPathComponent("\(id)-\(safeName)")
        try? FileManager.default.removeItem(at: payloadURL)
        try FileManager.default.copyItem(at: sourceURL, to: payloadURL)

        let detectedType = kind == "image" ? UTType.jpeg : (UTType(filenameExtension: payloadURL.pathExtension) ?? type)
        let metadata = PendingShare(
            id: id,
            destination: destination.rawValue,
            kind: kind,
            fileName: fileName,
            mimeType: detectedType.preferredMIMEType ?? (kind == "pdf" ? "application/pdf" : "image/jpeg"),
            url: nil,
            title: enteredTitle(fallback: displayName(from: fileName)),
            description: enteredDescription(),
            createdAt: Date().timeIntervalSince1970
        )
        try JSONEncoder().encode(metadata).write(
            to: queue.appendingPathComponent("\(id).json"),
            options: .atomic
        )
    }

    private func saveURL(_ url: URL) throws {
        guard destination == .discover else {
            throw ShareError.questionRequiresFile
        }
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            throw ShareError.unsupported
        }
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else {
            throw ShareError.appGroupUnavailable
        }
        let queue = container.appendingPathComponent("IncomingShares", isDirectory: true)
        try FileManager.default.createDirectory(at: queue, withIntermediateDirectories: true)
        let id = UUID().uuidString
        let metadata = PendingShare(
            id: id,
            destination: destination.rawValue,
            kind: "url",
            fileName: nil,
            mimeType: "text/uri-list",
            url: url.absoluteString,
            title: enteredTitle(fallback: url.host?.replacingOccurrences(of: "www.", with: "") ?? "Shared link"),
            description: enteredDescription(excluding: url.absoluteString),
            createdAt: Date().timeIntervalSince1970
        )
        try JSONEncoder().encode(metadata).write(
            to: queue.appendingPathComponent("\(id).json"),
            options: .atomic
        )
    }

    private var imageTypeIdentifiers: [String] {
        [
            UTType.image.identifier,
            UTType.jpeg.identifier,
            UTType.png.identifier,
            UTType.gif.identifier,
            UTType.tiff.identifier,
            UTType.bmp.identifier,
            UTType.heic.identifier,
            UTType.heif.identifier,
            "public.jpeg",
            "public.png",
            "public.heic",
            "public.heif",
            "com.apple.uikit.image",
        ]
    }

    private func isImageProvider(_ provider: NSItemProvider) -> Bool {
        imageTypeIdentifiers.contains { provider.hasItemConformingToTypeIdentifier($0) }
            || provider.canLoadObject(ofClass: UIImage.self)
    }

    private func extractAnySharedImage() async throws -> URL {
        for provider in itemProviders() {
            if let url = try? await loadSharedImage(from: provider) {
                return url
            }
        }
        if let image = imagesFromAttributedText().first {
            return try writeJpeg(image, name: "shared-image")
        }
        throw ShareError.couldNotLoad
    }

    private func imagesFromAttributedText() -> [UIImage] {
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        var images: [UIImage] = []
        for item in items {
            guard let text = item.attributedContentText else { continue }
            let range = NSRange(location: 0, length: text.length)
            text.enumerateAttribute(.attachment, in: range) { value, _, _ in
                guard let attachment = value as? NSTextAttachment else { return }
                if let image = attachment.image {
                    images.append(image)
                } else if let data = attachment.fileWrapper?.regularFileContents, let image = UIImage(data: data) {
                    images.append(image)
                }
            }
        }
        return images
    }

    private func loadSharedImage(from provider: NSItemProvider) async throws -> URL {
        // Request the representations the sender actually advertises first. Generic
        // public.image requests can fail even when a concrete Teams attachment exists.
        let registered = provider.registeredTypeIdentifiers.filter { identifier in
            guard !isNonImageIdentifier(identifier) else { return false }
            guard let type = UTType(identifier) else { return true }
            return !type.conforms(to: .movie) && !type.conforms(to: .audio) && type != .pdf
        }
        let fallback = imageTypeIdentifiers.filter { provider.hasItemConformingToTypeIdentifier($0) }
        let identifiers = uniqueIdentifiers(registered + fallback)
        for identifier in identifiers {
            if let url = try? await loadFile(from: provider, typeIdentifier: identifier) {
                if SharedImageDecoder.isImage(url) { return url }
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            }
            if let data = try? await loadData(from: provider, typeIdentifier: identifier), imageDataLooksValid(data) {
                return try writeTempData(data, suggestedName: provider.suggestedName, identifier: identifier)
            }
            if let item = try? await loadItem(from: provider, typeIdentifier: identifier) {
                if let image = item as? UIImage, image.size.width >= 2 {
                    return try writeJpeg(image, name: provider.suggestedName)
                }
                if let data = item as? Data, imageDataLooksValid(data) {
                    return try writeTempData(data, suggestedName: provider.suggestedName, identifier: identifier)
                }
                if let url = sharedURL(item), url.isFileURL, let copied = try? copyToTemp(url) {
                    if SharedImageDecoder.isImage(copied) { return copied }
                    try? FileManager.default.removeItem(at: copied.deletingLastPathComponent())
                }
            }
        }
        if provider.canLoadObject(ofClass: UIImage.self), let image = try? await loadUIImage(from: provider) {
            return try writeJpeg(image, name: provider.suggestedName)
        }
        for identifier in [UTType.fileURL.identifier, UTType.url.identifier]
            where provider.hasItemConformingToTypeIdentifier(identifier) {
            if let item = try? await loadItem(from: provider, typeIdentifier: identifier),
               let url = sharedURL(item), url.isFileURL, let copied = try? copyToTemp(url) {
                if SharedImageDecoder.isImage(copied) { return copied }
                try? FileManager.default.removeItem(at: copied.deletingLastPathComponent())
            }
        }
        // A preview may be an app icon or thumbnail, so never substitute it for the file.
        throw ShareError.couldNotLoad
    }

    private func sharedURL(_ item: NSSecureCoding) -> URL? {
        if let url = item as? URL { return url }
        if let string = item as? String { return URL(string: string) }
        if let data = item as? Data, let string = String(data: data, encoding: .utf8) {
            return URL(string: string.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return nil
    }

    private func uniqueIdentifiers(_ identifiers: [String]) -> [String] {
        var seen = Set<String>()
        return identifiers.filter { seen.insert($0).inserted }
    }

    private func isNonImageIdentifier(_ identifier: String) -> Bool {
        identifier == UTType.url.identifier
            || identifier == UTType.plainText.identifier
            || identifier == UTType.utf8PlainText.identifier
            || identifier == "public.html"
            || identifier == "public.rtf"
    }

    private func imageDataLooksValid(_ data: Data) -> Bool {
        SharedImageDecoder.isImage(data)
    }

    private func saveRemoteImage(from url: URL, provider: NSItemProvider) async throws {
        if destination == .discover { throw ShareError.discoverImageUnsupported }
        let sourceURL = try await downloadRemoteImage(from: url)
        defer { try? FileManager.default.removeItem(at: sourceURL.deletingLastPathComponent()) }
        let webSafe = try makeWebSafeImage(sourceURL)
        defer {
            if webSafe != sourceURL {
                try? FileManager.default.removeItem(at: webSafe.deletingLastPathComponent())
            }
        }
        try writeQueuedFile(webSafe, provider: provider, kind: "image", type: .jpeg)
    }

    private func downloadRemoteImage(from url: URL) async throws -> URL {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            throw ShareError.couldNotLoad
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.setValue("image/*,*/*;q=0.8", forHTTPHeaderField: "Accept")
        let (downloaded, response) = try await URLSession.shared.download(for: request)
        defer { try? FileManager.default.removeItem(at: downloaded) }
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw ShareError.couldNotLoad
        }
        let mime = http.value(forHTTPHeaderField: "Content-Type") ?? ""
        if mime.lowercased().contains("text/html") || !SharedImageDecoder.isImage(downloaded) {
            throw ShareError.couldNotLoad
        }
        return try copyToTemp(downloaded, name: url.lastPathComponent.isEmpty ? "shared-image" : url.lastPathComponent)
    }

    private func makeWebSafeImage(_ url: URL) throws -> URL {
        do {
            let data = try SharedImageDecoder.jpeg(from: url)
            return try writeJpegData(data, name: displayName(from: url.lastPathComponent))
        } catch SharedImageDecoder.DecodeError.tooLarge {
            throw ShareError.fileTooLarge
        } catch {
            throw ShareError.couldNotLoad
        }
    }

    private func copyToTemp(_ url: URL, name: String? = nil) throws -> URL {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let stagingDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        let temporaryURL = stagingDirectory.appendingPathComponent(name.map { URL(fileURLWithPath: $0).lastPathComponent } ?? url.lastPathComponent)
        try FileManager.default.copyItem(at: url, to: temporaryURL)
        return temporaryURL
    }

    private func writeTempData(_ data: Data, suggestedName: String?, identifier: String) throws -> URL {
        let ext = extensionForImageIdentifier(identifier, data: data)
        let stem = displayName(from: suggestedName ?? "shared-image")
        let stagingDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        let url = stagingDirectory.appendingPathComponent("\(stem).\(ext)")
        try data.write(to: url)
        return url
    }

    private func writeJpeg(_ image: UIImage, name: String?) throws -> URL {
        guard let data = image.jpegData(compressionQuality: 0.92) else { throw ShareError.couldNotLoad }
        return try writeJpegData(data, name: displayName(from: name ?? "shared-image"))
    }

    private func writeJpegData(_ data: Data, name: String) throws -> URL {
        let stagingDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: stagingDirectory, withIntermediateDirectories: true)
        let url = stagingDirectory.appendingPathComponent("\(name).jpg")
        try data.write(to: url)
        return url
    }

    private func extensionForImageIdentifier(_ identifier: String, data: Data) -> String {
        if data.count >= 3, data[0] == 0xFF, data[1] == 0xD8, data[2] == 0xFF { return "jpg" }
        if data.count >= 4, data[0] == 0x89, data[1] == 0x50, data[2] == 0x4E, data[3] == 0x47 { return "png" }
        if data.count >= 3, data[0] == 0x47, data[1] == 0x49, data[2] == 0x46 { return "gif" }
        if identifier.contains("jpeg") || identifier.contains("jpg") { return "jpg" }
        if identifier.contains("png") { return "png" }
        if identifier.contains("gif") { return "gif" }
        if identifier.contains("heic") || identifier.contains("heif") { return "heic" }
        if identifier.contains("tiff") { return "tiff" }
        if identifier.contains("bmp") { return "bmp" }
        return "jpg"
    }

    private func loadData(from provider: NSItemProvider, typeIdentifier: String) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let data {
                    continuation.resume(returning: data)
                } else {
                    continuation.resume(throwing: ShareError.couldNotLoad)
                }
            }
        }
    }

    private func loadUIImage(from provider: NSItemProvider) async throws -> UIImage {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<UIImage, Error>) in
            DispatchQueue.main.async {
                // Prefer the NSItemProviderReading overload (not the _ObjectiveCBridgeable one).
                let type: NSItemProviderReading.Type = UIImage.self
                _ = provider.loadObject(ofClass: type) { object, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else if let image = object as? UIImage {
                        continuation.resume(returning: image)
                    } else {
                        continuation.resume(throwing: ShareError.couldNotLoad)
                    }
                }
            }
        }
    }

    private func loadFile(from provider: NSItemProvider, typeIdentifier: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    do {
                        // Provider URLs expire when this callback returns.
                        let temporaryURL = try self.copyToTemp(url)
                        continuation.resume(returning: temporaryURL)
                    } catch {
                        continuation.resume(throwing: error)
                    }
                } else {
                    continuation.resume(throwing: ShareError.couldNotLoad)
                }
            }
        }
    }

    private func loadItem(from provider: NSItemProvider, typeIdentifier: String) async throws -> NSSecureCoding {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let item {
                    continuation.resume(returning: item)
                } else {
                    continuation.resume(throwing: ShareError.couldNotLoad)
                }
            }
        }
    }

    private func firstWebURL(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        return detector.firstMatch(
            in: text,
            options: [],
            range: NSRange(text.startIndex..., in: text)
        )?.url
    }

    private func sharedInputText() -> String {
        extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .compactMap { $0.attributedContentText?.string }
            .joined(separator: "\n") ?? ""
    }

    private func enteredDescription(excluding url: String? = nil) -> String? {
        var text = descriptionTextView.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url {
            text = text.replacingOccurrences(of: url, with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return text.isEmpty ? nil : String(text.prefix(240))
    }

    /// File name minus its extension, kept verbatim so "IMG_0587.HEIC" reads as "IMG_0587".
    private func displayName(from fileName: String) -> String {
        URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent
    }

    /// Photos often supplies a UUID / PHAsset id as `suggestedName`. Prefer the copied
    /// file's last path component (IMG_0587.HEIC) whenever that looks human.
    private func preferredFileName(provider: NSItemProvider, sourceURL: URL) -> String {
        let fromFile = sourceURL.lastPathComponent
        let suggested = provider.suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let suggestedName = (suggested?.isEmpty == false) ? suggested : nil

        if looksLikeCameraRollName(fromFile) || !looksLikeOpaqueId(fromFile) {
            return fromFile
        }
        if let suggestedName, looksLikeCameraRollName(suggestedName) || !looksLikeOpaqueId(suggestedName) {
            return suggestedName
        }
        return fromFile
    }

    private func looksLikeCameraRollName(_ name: String) -> Bool {
        let stem = displayName(from: name)
        return stem.range(
            of: #"^(IMG|DSC|DCIM|PXL|VID|Screenshot|Photo)[-_]?\d+"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private func looksLikeOpaqueId(_ name: String) -> Bool {
        let stem = displayName(from: name)
        if stem.isEmpty { return true }
        if stem.range(
            of: #"^[0-9A-Fa-f]{8}-([0-9A-Fa-f]{4}-){3}[0-9A-Fa-f]{12}$"#,
            options: .regularExpression
        ) != nil {
            return true
        }
        if stem.count >= 20,
           stem.range(of: #"^[0-9A-Fa-f-]+$"#, options: .regularExpression) != nil {
            return true
        }
        return false
    }

    private func enteredTitle(fallback: String) -> String {
        let value = titleField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if value.isEmpty || (looksLikeOpaqueId(value) && !looksLikeOpaqueId(fallback)) {
            return String(fallback.prefix(80))
        }
        return String(value.prefix(80))
    }

    private func openContainingApp() {
        guard let url = URL(string: "com.certchamps.app://share") else {
            finish()
            return
        }
        extensionContext?.open(url) { [weak self] opened in
            guard let self else { return }
            if opened {
                self.finish()
                return
            }
            DispatchQueue.main.async {
                var responder: UIResponder? = self
                while let current = responder {
                    if let application = current as? UIApplication {
                        application.open(url, options: [:]) { _ in self.finish() }
                        return
                    }
                    responder = current.next
                }
                self.finish()
            }
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func presentError(_ message: String) {
        let alert = UIAlertController(
            title: "Couldn’t share to CertChamps",
            message: message,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private enum ShareError: LocalizedError {
        case cancelled
        case unsupported
        case questionRequiresFile
        case discoverImageUnsupported
        case fileTooLarge
        case appGroupUnavailable
        case couldNotLoad

        var errorDescription: String? {
            switch self {
            case .cancelled:
                return "Sharing was cancelled."
            case .unsupported:
                return "Share a PDF, image, YouTube video, or web link."
            case .questionRequiresFile:
                return "Add to question accepts images and PDFs. Choose Upload to Discover for links."
            case .discoverImageUnsupported:
                return "Discover doesn’t accept image uploads yet. Choose Add to question, or share a PDF or link instead."
            case .fileTooLarge:
                return "Files must be under 25 MB."
            case .appGroupUnavailable:
                return "The CertChamps shared container is unavailable. Check App Groups for both targets."
            case .couldNotLoad:
                return "The sending app didn’t provide a readable image file. If it shared a sign-in link, save the image to Photos or Files and share the saved image."
            }
        }
    }
}

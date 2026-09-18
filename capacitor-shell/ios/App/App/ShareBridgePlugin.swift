import Foundation
import Capacitor
import UIKit

@objc(ShareBridgePlugin)
public class ShareBridgePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "ShareBridgePlugin"
    public let jsName = "ShareBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "completeShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise),
    ]

    private let appGroupIdentifier = "group.com.certchamps.app"
    private let queueDirectoryName = "IncomingShares"

    @objc func getPendingShare(_ call: CAPPluginCall) {
        do {
            guard let queue = queueDirectory() else {
                call.reject("CertChamps App Group is unavailable")
                return
            }
            let metadataFiles = try FileManager.default.contentsOfDirectory(
                at: queue,
                includingPropertiesForKeys: [.contentModificationDateKey],
                options: [.skipsHiddenFiles]
            )
            .filter { $0.pathExtension.lowercased() == "json" }
            .sorted {
                let left = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                let right = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
                return left < right
            }

            guard let metadataURL = metadataFiles.first else {
                call.resolve(["share": NSNull()])
                return
            }

            let data = try Data(contentsOf: metadataURL)
            guard var metadata = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let id = metadata["id"] as? String else {
                try? FileManager.default.removeItem(at: metadataURL)
                call.reject("Incoming share metadata is invalid")
                return
            }

            if metadata["kind"] as? String != "url" {
                let payload = try FileManager.default.contentsOfDirectory(
                    at: queue,
                    includingPropertiesForKeys: nil,
                    options: [.skipsHiddenFiles]
                ).first {
                    $0.lastPathComponent.hasPrefix("\(id)-") && $0.pathExtension.lowercased() != "json"
                }
                guard let payload else {
                    try? FileManager.default.removeItem(at: metadataURL)
                    call.reject("Incoming shared file is missing")
                    return
                }
                metadata["fileUrl"] = payload.absoluteString
            }

            call.resolve(["share": metadata])
        } catch {
            call.reject("Could not read incoming share", nil, error)
        }
    }

    @objc func completeShare(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("A share id is required")
            return
        }
        do {
            guard let queue = queueDirectory(createIfNeeded: false) else {
                call.resolve()
                return
            }
            let files = try FileManager.default.contentsOfDirectory(
                at: queue,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
            for file in files where file.lastPathComponent == "\(id).json"
                || file.lastPathComponent.hasPrefix("\(id)-") {
                try? FileManager.default.removeItem(at: file)
            }
            call.resolve()
        } catch {
            call.reject("Could not finish incoming share", nil, error)
        }
    }

    private var exportCall: CAPPluginCall?
    private var exportDirectory: URL?

    @objc func exportFile(_ call: CAPPluginCall) {
        guard let base64 = call.getString("base64"),
              let data = Data(base64Encoded: base64),
              let filename = call.getString("filename"),
              ["png", "pdf"].contains(URL(fileURLWithPath: filename).pathExtension.lowercased()),
              let mode = call.getString("mode"), ["save", "share"].contains(mode) else {
            call.reject("A valid PNG or PDF file is required")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.reject("Export is unavailable")
                return
            }
            guard self.exportCall == nil, presenter.presentedViewController == nil else {
                call.reject("Another native dialog is already open")
                return
            }
            do {
                let directory = FileManager.default.temporaryDirectory
                    .appendingPathComponent("Export-\(UUID().uuidString)", isDirectory: true)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                self.exportDirectory = directory
                let file = directory.appendingPathComponent(URL(fileURLWithPath: filename).lastPathComponent)
                try data.write(to: file, options: .atomic)
                self.exportCall = call
                if mode == "save" {
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                    picker.delegate = self
                    picker.modalPresentationStyle = .formSheet
                    presenter.present(picker, animated: true)
                } else {
                    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    sheet.completionWithItemsHandler = { [weak self] _, completed, _, error in
                        if let error { self?.exportCall?.reject("Sharing failed", nil, error) }
                        else { self?.exportCall?.resolve(["cancelled": !completed]) }
                        self?.clearExport()
                    }
                    // iPad requires an explicit popover anchor.
                    sheet.popoverPresentationController?.sourceView = presenter.view
                    sheet.popoverPresentationController?.sourceRect = CGRect(
                        x: presenter.view.bounds.maxX - 40,
                        y: presenter.view.safeAreaInsets.top + 40, width: 1, height: 1
                    )
                    sheet.popoverPresentationController?.permittedArrowDirections = []
                    presenter.present(sheet, animated: true)
                }
            } catch {
                call.reject("Could not prepare export", nil, error)
                self.clearExport()
            }
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        exportCall?.resolve(["cancelled": false])
        clearExport()
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        exportCall?.resolve(["cancelled": true])
        clearExport()
    }

    private func clearExport() {
        exportCall = nil
        if let directory = exportDirectory { try? FileManager.default.removeItem(at: directory) }
        exportDirectory = nil
    }

    private func queueDirectory(createIfNeeded: Bool = true) -> URL? {
        guard let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: appGroupIdentifier
        ) else {
            return nil
        }
        let queue = container.appendingPathComponent(queueDirectoryName, isDirectory: true)
        if createIfNeeded {
            try? FileManager.default.createDirectory(at: queue, withIntermediateDirectories: true)
        }
        return queue
    }
}

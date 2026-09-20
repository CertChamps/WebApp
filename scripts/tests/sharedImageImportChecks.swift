// Run with the native decoder: xcrun swiftc capacitor-shell/ios/App/CertChamps/SharedImageDecoder.swift scripts/tests/sharedImageImportChecks.swift -o /tmp/shared-image-check && /tmp/shared-image-check
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func require(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}

@main
struct SharedImageDecoderChecks {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("shared-image-check-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let context = CGContext(data: nil, width: 60, height: 40, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 10, y: 10, width: 40, height: 20))
        let image = context.makeImage()!
        let supported = CGImageDestinationCopyTypeIdentifiers() as! [String]
        var checked: [String] = []
        for type in [UTType.png, .jpeg, .tiff, .bmp, .gif, .heic] where supported.contains(type.identifier) {
            let data = NSMutableData()
            let writer = CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil)!
            CGImageDestinationAddImage(writer, image, nil)
            require(CGImageDestinationFinalize(writer), "Could not create fixture \(type.identifier)")
            let bytes = data as Data
            require(SharedImageDecoder.isImage(bytes), "Image not recognised: \(type.identifier)")
            // Reproduce a generic Teams file with no truthful extension.
            let url = directory.appendingPathComponent("\(type.identifier).unknown")
            try bytes.write(to: url)
            require(SharedImageDecoder.isImage(url), "Generic file URL rejected")
            let jpeg = try SharedImageDecoder.jpeg(from: url)
            require(jpeg.prefix(3) == Data([0xff,0xd8,0xff]), "Wrong output format")
            let source = CGImageSourceCreateWithData(jpeg as CFData, nil)!
            let output = CGImageSourceCreateImageAtIndex(source, 0, nil)!
            require(output.width == 60 && output.height == 40, "Dimensions changed")
            checked.append(type.identifier)
        }
        let rotated = NSMutableData()
        let writer = CGImageDestinationCreateWithData(rotated, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(writer, image, [kCGImagePropertyOrientation: 6] as CFDictionary)
        require(CGImageDestinationFinalize(writer), "Orientation fixture failed")
        let rotationURL = directory.appendingPathComponent("rotated.bin")
        try (rotated as Data).write(to: rotationURL)
        let rotation = try SharedImageDecoder.jpeg(from: rotationURL)
        let rotationSource = CGImageSourceCreateWithData(rotation as CFData, nil)!
        let rotationImage = CGImageSourceCreateImageAtIndex(rotationSource, 0, nil)!
        require(rotationImage.width == 40 && rotationImage.height == 60, "EXIF orientation ignored")
        require(!SharedImageDecoder.isImage(Data("<html>Microsoft sign-in</html>".utf8)), "Sign-in page accepted as image")
        require(!SharedImageDecoder.isImage(Data()), "Empty input accepted")
        require(!SharedImageDecoder.isImage(Data([0xff,0xd8,0xff,0x00])), "Truncated image accepted")
        let webp = Data(base64Encoded: "UklGRj4CAABXRUJQVlA4WAoAAAAwAAAAOwAAJwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZBTFBIHgAAAAEPMP8REUJR2zZQD/6Mu41AtXdE/ycAfXN358/UBVZQOCAqAAAAMAMAnQEqPAAoAD4pFIlDIaEhEVQAGAKEtIAACfjHD4QiwAD+/tAcAAAA")!
        require(SharedImageDecoder.isImage(webp), "WebP not recognised")
        let webpURL = directory.appendingPathComponent("webp.bin")
        try webp.write(to: webpURL)
        let webpJpeg = try SharedImageDecoder.jpeg(from: webpURL)
        require(SharedImageDecoder.isImage(webpJpeg), "WebP conversion failed")
        let largeContext = CGContext(data: nil, width: 5000, height: 60, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let largeData = NSMutableData()
        let largeWriter = CGImageDestinationCreateWithData(largeData, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(largeWriter, largeContext.makeImage()!, nil)
        require(CGImageDestinationFinalize(largeWriter), "Large fixture failed")
        let largeURL = directory.appendingPathComponent("large.bin")
        try (largeData as Data).write(to: largeURL)
        let reduced = try SharedImageDecoder.jpeg(from: largeURL)
        let reducedSource = CGImageSourceCreateWithData(reduced as CFData, nil)!
        let reducedImage = CGImageSourceCreateImageAtIndex(reducedSource, 0, nil)!
        require(reducedImage.width == 4096, "Large image not bounded")
        print("PASS: \(checked.joined(separator: ", ")), WebP, unknown extensions, JPEG conversion, EXIF rotation, large-image limits, invalid payload rejection")
    }
}

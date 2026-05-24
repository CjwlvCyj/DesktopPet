import Foundation
import CoreGraphics
import ImageIO

public enum PetPackValidationError: Error, LocalizedError, Equatable {
    case manifestMissing
    case manifestDecodingFailed(String)
    case schemaVersionUnsupported(Int)
    case previewMissing
    case bubblesMissing
    case bubblesDecodingFailed(String)
    case missingIdleBubble
    case missingIdleAction
    case invalidFPS(action: String, fps: Int)
    case invalidFallback(action: String, fallback: String)
    case actionDirectoryMissing(String, String)
    case noFramesInAction(String, String)
    case invalidFrameName(action: String, file: String)
    case frameSequenceGap(action: String, expected: String, got: String)
    case frameSizeMismatch(action: String, file: String, width: Double, height: Double, expectedWidth: Double, expectedHeight: Double)
    case imageMissingAlpha(file: String)
    case licenseMissing
    
    public var errorDescription: String? {
        switch self {
        case .manifestMissing:
            return "manifest.json file is missing."
        case .manifestDecodingFailed(let details):
            return "Failed to decode manifest.json: \(details)"
        case .schemaVersionUnsupported(let version):
            return "Unsupported schema version: \(version). Expected version 1."
        case .previewMissing:
            return "preview.png file is missing."
        case .bubblesMissing:
            return "bubbles.json file is missing."
        case .bubblesDecodingFailed(let details):
            return "Failed to decode bubbles.json: \(details)"
        case .missingIdleBubble:
            return "bubbles.json must contain an 'idle' text array."
        case .missingIdleAction:
            return "Required 'idle' action is missing or not marked as required in manifest."
        case .invalidFPS(let action, let fps):
            return "Action '\(action)' has invalid fps \(fps). Expected a value from 1 to 60."
        case .invalidFallback(let action, let fallback):
            return "Action '\(action)' references missing fallback action '\(fallback)'."
        case .actionDirectoryMissing(let name, let path):
            return "Directory for action '\(name)' is missing at '\(path)'."
        case .noFramesInAction(let name, let path):
            return "No png frames found for action '\(name)' at '\(path)'."
        case .invalidFrameName(let action, let file):
            return "Invalid frame name '\(file)' in action '\(action)'. Expected frame_000.png style names."
        case .frameSequenceGap(let action, let expected, let got):
            return "Frame sequence gap in action '\(action)'. Expected '\(expected)', got '\(got)'."
        case .frameSizeMismatch(let action, let file, let width, let height, let expectedWidth, let expectedHeight):
            return "Frame size mismatch in action '\(action)' for file '\(file)'. Got \(Int(width))x\(Int(height)), expected \(Int(expectedWidth))x\(Int(expectedHeight))."
        case .imageMissingAlpha(let file):
            return "PNG file '\(file)' does not contain an alpha channel."
        case .licenseMissing:
            return "license.txt file is missing."
        }
    }
}

public struct PetPackValidator {
    public static func validate(at url: URL) throws -> PetPack {
        let fileManager = FileManager.default
        
        // 1. Check manifest.json exists
        let manifestURL = url.appendingPathComponent("manifest.json")
        guard fileManager.fileExists(atPath: manifestURL.path) else {
            throw PetPackValidationError.manifestMissing
        }
        
        // 2. Decode manifest.json
        let manifestData: Data
        do {
            manifestData = try Data(contentsOf: manifestURL)
        } catch {
            throw PetPackValidationError.manifestDecodingFailed(error.localizedDescription)
        }
        
        let manifest: PetManifest
        do {
            let decoder = JSONDecoder()
            manifest = try decoder.decode(PetManifest.self, from: manifestData)
        } catch {
            throw PetPackValidationError.manifestDecodingFailed(error.localizedDescription)
        }
        
        // 3. Check schema version
        guard manifest.schemaVersion == 1 else {
            throw PetPackValidationError.schemaVersionUnsupported(manifest.schemaVersion)
        }
        
        // 4. Check required top-level files
        let previewURL = url.appendingPathComponent("preview.png")
        guard fileManager.fileExists(atPath: previewURL.path) else {
            throw PetPackValidationError.previewMissing
        }
        
        let bubblesURL = url.appendingPathComponent("bubbles.json")
        guard fileManager.fileExists(atPath: bubblesURL.path) else {
            throw PetPackValidationError.bubblesMissing
        }
        
        do {
            let bubblesData = try Data(contentsOf: bubblesURL)
            let bubbles = try JSONDecoder().decode([String: [String]].self, from: bubblesData)
            guard bubbles["idle"] != nil else {
                throw PetPackValidationError.missingIdleBubble
            }
        } catch let validationError as PetPackValidationError {
            throw validationError
        } catch {
            throw PetPackValidationError.bubblesDecodingFailed(error.localizedDescription)
        }
        
        // 5. Check idle action exists and is required
        guard let idleAction = manifest.actions["idle"], idleAction.required else {
            throw PetPackValidationError.missingIdleAction
        }
        
        // 6. Check license.txt exists
        let licenseURL = url.appendingPathComponent("license.txt")
        guard fileManager.fileExists(atPath: licenseURL.path) else {
            throw PetPackValidationError.licenseMissing
        }
        
        let expectedWidth = manifest.canvas.width
        let expectedHeight = manifest.canvas.height
        
        try validatePNG(at: previewURL, actionName: "preview", expectedWidth: expectedWidth, expectedHeight: expectedHeight)
        
        // 7. Validate action metadata
        for (actionName, action) in manifest.actions {
            guard (1...60).contains(action.fps) else {
                throw PetPackValidationError.invalidFPS(action: actionName, fps: action.fps)
            }
            
            if let fallback = action.fallback, manifest.actions[fallback] == nil {
                throw PetPackValidationError.invalidFallback(action: actionName, fallback: fallback)
            }
        }
        
        // 8. Validate all action directories and frames
        for (actionName, action) in manifest.actions {
            let actionDirURL = url.appendingPathComponent(action.path)
            
            var isDir: ObjCBool = false
            guard fileManager.fileExists(atPath: actionDirURL.path, isDirectory: &isDir), isDir.boolValue else {
                throw PetPackValidationError.actionDirectoryMissing(actionName, action.path)
            }
            
            let contents: [URL]
            do {
                contents = try fileManager.contentsOfDirectory(at: actionDirURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
            } catch {
                throw PetPackValidationError.actionDirectoryMissing(actionName, action.path)
            }
            
            let pngFiles = contents.filter { $0.pathExtension.lowercased() == "png" }.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
            
            guard !pngFiles.isEmpty else {
                throw PetPackValidationError.noFramesInAction(actionName, action.path)
            }
            
            try validateFrameSequence(pngFiles, actionName: actionName)
            
            // Validate sizes for each PNG file
            for fileURL in pngFiles {
                try validatePNG(at: fileURL, actionName: actionName, expectedWidth: expectedWidth, expectedHeight: expectedHeight)
            }
        }
        
        return PetPack(manifest: manifest, baseURL: url)
    }
    
    private static func validatePNG(at url: URL, actionName: String, expectedWidth: Double, expectedHeight: Double) throws {
        guard let info = getImageInfo(at: url) else {
            throw PetPackValidationError.frameSizeMismatch(
                action: actionName,
                file: url.lastPathComponent,
                width: 0,
                height: 0,
                expectedWidth: expectedWidth,
                expectedHeight: expectedHeight
            )
        }
        
        if abs(info.width - expectedWidth) > 0.01 || abs(info.height - expectedHeight) > 0.01 {
            throw PetPackValidationError.frameSizeMismatch(
                action: actionName,
                file: url.lastPathComponent,
                width: info.width,
                height: info.height,
                expectedWidth: expectedWidth,
                expectedHeight: expectedHeight
            )
        }
        
        guard info.hasAlpha else {
            throw PetPackValidationError.imageMissingAlpha(file: url.lastPathComponent)
        }
    }
    
    private static func validateFrameSequence(_ files: [URL], actionName: String) throws {
        let indexedFiles = try files.map { fileURL -> (Int, URL) in
            guard let index = frameIndex(from: fileURL.lastPathComponent) else {
                throw PetPackValidationError.invalidFrameName(action: actionName, file: fileURL.lastPathComponent)
            }
            return (index, fileURL)
        }.sorted { $0.0 < $1.0 }
        
        for (expectedIndex, item) in indexedFiles.enumerated() {
            let expectedName = String(format: "frame_%03d.png", expectedIndex)
            if item.0 != expectedIndex {
                throw PetPackValidationError.frameSequenceGap(action: actionName, expected: expectedName, got: item.1.lastPathComponent)
            }
        }
    }
    
    private static func frameIndex(from fileName: String) -> Int? {
        guard fileName.hasPrefix("frame_"), fileName.hasSuffix(".png") else {
            return nil
        }
        
        let start = fileName.index(fileName.startIndex, offsetBy: 6)
        let end = fileName.index(fileName.endIndex, offsetBy: -4)
        let digits = fileName[start..<end]
        guard digits.count >= 3, digits.allSatisfy({ $0.isNumber }) else {
            return nil
        }
        return Int(digits)
    }
    
    private static func getImageInfo(at url: URL) -> (width: Double, height: Double, hasAlpha: Bool)? {
        guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let propertiesOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, propertiesOptions) as? [CFString: Any] else { return nil }
        guard let width = numericDouble(properties[kCGImagePropertyPixelWidth]),
              let height = numericDouble(properties[kCGImagePropertyPixelHeight]),
              let image = CGImageSourceCreateImageAtIndex(imageSource, 0, propertiesOptions) else {
            return nil
        }
        
        let alphaInfo = image.alphaInfo
        let hasAlpha: Bool
        switch alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast:
            hasAlpha = false
        default:
            hasAlpha = true
        }
        
        return (width, height, hasAlpha)
    }
    
    private static func numericDouble(_ value: Any?) -> Double? {
        if let number = value as? NSNumber {
            return number.doubleValue
        }
        if let double = value as? Double {
            return double
        }
        if let int = value as? Int {
            return Double(int)
        }
        return nil
    }
}

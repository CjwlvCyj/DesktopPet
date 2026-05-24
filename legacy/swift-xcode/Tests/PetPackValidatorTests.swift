#if canImport(XCTest)
import XCTest
#endif
import AppKit
import ImageIO
import UniformTypeIdentifiers
@testable import DesktopPet

class PetPackValidatorTests: XCTestCase {
    var tempDir: URL!
    
    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true, attributes: nil)
    }
    
    override func tearDown() {
        if let dir = tempDir {
            try? FileManager.default.removeItem(at: dir)
        }
        super.tearDown()
    }
    
    private func makeValidManifestDict() -> [String: Any] {
        [
            "schemaVersion": 1,
            "id": "test-pet",
            "displayName": "Test Pet",
            "species": "cat",
            "style": "soft_storybook",
            "version": "1.0.0",
            "canvas": ["width": 768.0, "height": 768.0, "anchorX": 0.5, "anchorY": 0.0],
            "defaultScale": 1.0,
            "actions": [
                "idle": [
                    "path": "actions/idle",
                    "fps": 8,
                    "loop": true,
                    "required": true,
                    "fallback": NSNull()
                ]
            ]
        ]
    }
    
    private func writeManifest(_ manifestDict: [String: Any]) throws {
        let manifestData = try JSONSerialization.data(withJSONObject: manifestDict, options: [.prettyPrinted])
        try manifestData.write(to: tempDir.appendingPathComponent("manifest.json"))
    }
    
    private func writeLicense() throws {
        try "Mock license".write(to: tempDir.appendingPathComponent("license.txt"), atomically: true, encoding: .utf8)
    }
    
    private func writeBubbles() throws {
        let data = try JSONSerialization.data(withJSONObject: ["idle": ["Hello"]], options: [.prettyPrinted])
        try data.write(to: tempDir.appendingPathComponent("bubbles.json"))
    }
    
    private func createMockPNG(at url: URL, width: Int = 768, height: Int = 768, hasAlpha: Bool = true) {
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
            return
        }
        
        let alphaInfo: CGImageAlphaInfo = hasAlpha ? .premultipliedLast : .noneSkipLast
        guard let context = CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: alphaInfo.rawValue
        ) else {
            return
        }
        
        context.setFillColor(NSColor.red.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
        
        guard let image = context.makeImage(),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            return
        }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }
    
    private func writePreview(hasAlpha: Bool = true) {
        createMockPNG(at: tempDir.appendingPathComponent("preview.png"), hasAlpha: hasAlpha)
    }
    
    private func writeIdleFrames(
        fileNames: [String] = ["frame_000.png"],
        width: Int = 768,
        height: Int = 768,
        hasAlpha: Bool = true
    ) throws {
        let idleDir = tempDir.appendingPathComponent("actions/idle")
        try FileManager.default.createDirectory(at: idleDir, withIntermediateDirectories: true, attributes: nil)
        for fileName in fileNames {
            createMockPNG(at: idleDir.appendingPathComponent(fileName), width: width, height: height, hasAlpha: hasAlpha)
        }
    }
    
    private func writeValidPack() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames()
    }
    
    func testValidPack() throws {
        try writeValidPack()
        XCTAssertNoThrow(try PetPackValidator.validate(at: tempDir))
    }
    
    func testMissingManifest() throws {
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .manifestMissing)
        }
    }
    
    func testMissingPreview() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        try writeBubbles()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .previewMissing)
        }
    }
    
    func testMissingBubbles() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        writePreview()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .bubblesMissing)
        }
    }
    
    func testMissingLicense() throws {
        try writeManifest(makeValidManifestDict())
        try writeBubbles()
        writePreview()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .licenseMissing)
        }
    }
    
    func testMissingIdle() throws {
        var manifestDict = makeValidManifestDict()
        manifestDict["actions"] = [
            "walk": [
                "path": "actions/walk",
                "fps": 8,
                "loop": true,
                "required": false,
                "fallback": "idle"
            ]
        ]
        try writeManifest(manifestDict)
        try writeLicense()
        try writeBubbles()
        writePreview()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .missingIdleAction)
        }
    }
    
    func testInvalidFPS() throws {
        var manifestDict = makeValidManifestDict()
        var actions = manifestDict["actions"] as! [String: [String: Any]]
        actions["idle"]?["fps"] = 0
        manifestDict["actions"] = actions
        
        try writeManifest(manifestDict)
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .invalidFPS(action: "idle", fps: 0))
        }
    }
    
    func testInvalidFallback() throws {
        var manifestDict = makeValidManifestDict()
        var actions = manifestDict["actions"] as! [String: [String: Any]]
        actions["tap_happy"] = [
            "path": "actions/tap_happy",
            "fps": 8,
            "loop": false,
            "required": false,
            "fallback": "missing_action"
        ]
        manifestDict["actions"] = actions
        
        try writeManifest(manifestDict)
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames()
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .invalidFallback(action: "tap_happy", fallback: "missing_action"))
        }
    }
    
    func testFrameSizeMismatch() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames(width: 100, height: 100)
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            if case let .frameSizeMismatch(action, file, width, height, expectedWidth, expectedHeight) = error as? PetPackValidationError {
                XCTAssertEqual(action, "idle")
                XCTAssertEqual(file, "frame_000.png")
                XCTAssertEqual(width, 100.0)
                XCTAssertEqual(height, 100.0)
                XCTAssertEqual(expectedWidth, 768.0)
                XCTAssertEqual(expectedHeight, 768.0)
            } else {
                XCTFail("Expected frameSizeMismatch error, got \(error)")
            }
        }
    }
    
    func testNonSequentialFrames() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames(fileNames: ["frame_000.png", "frame_002.png"])
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(
                error as? PetPackValidationError,
                .frameSequenceGap(action: "idle", expected: "frame_001.png", got: "frame_002.png")
            )
        }
    }
    
    func testPNGWithoutAlphaChannel() throws {
        try writeManifest(makeValidManifestDict())
        try writeLicense()
        try writeBubbles()
        writePreview()
        try writeIdleFrames(hasAlpha: false)
        
        XCTAssertThrowsError(try PetPackValidator.validate(at: tempDir)) { error in
            XCTAssertEqual(error as? PetPackValidationError, .imageMissingAlpha(file: "frame_000.png"))
        }
    }
}

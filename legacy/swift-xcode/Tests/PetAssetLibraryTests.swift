#if canImport(XCTest)
import XCTest
#endif
import AppKit
import ImageIO
import UniformTypeIdentifiers
@testable import DesktopPet

final class PetAssetLibraryTests: XCTestCase {
    private var tempDir: URL!
    private var appSupportURL: URL!
    private var defaultsSuite: String!
    private var defaults: UserDefaults!
    private var preferences: PetPreferencesStore!
    
    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        appSupportURL = tempDir.appendingPathComponent("AppSupport")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true, attributes: nil)
        
        defaultsSuite = "DesktopPetTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuite)!
        preferences = PetPreferencesStore(defaults: defaults)
    }
    
    override func tearDown() {
        if let tempDir {
            try? FileManager.default.removeItem(at: tempDir)
        }
        if let defaults {
            defaults.removePersistentDomain(forName: defaultsSuite)
        }
        super.tearDown()
    }
    
    func testImportValidPack() throws {
        let defaultPackURL = try makePack(id: "default-pet", displayName: "Default", at: tempDir.appendingPathComponent("Default.petpack"))
        let sourceURL = try makePack(id: "mimi-cat", displayName: "Mimi", at: tempDir.appendingPathComponent("Mimi.petpack"))
        let library = PetAssetLibrary(appSupportURL: appSupportURL, defaultPackURL: defaultPackURL, preferences: preferences)
        
        let imported = try library.importPack(from: sourceURL)
        XCTAssertEqual(imported.id, "mimi-cat")
        
        let packs = library.refreshAvailablePacks()
        XCTAssertTrue(packs.contains(where: { $0.id == "default-pet" }))
        XCTAssertTrue(packs.contains(where: { $0.id == "mimi-cat" }))
    }
    
    func testRepeatedImportReplacesExistingPack() throws {
        let defaultPackURL = try makePack(id: "default-pet", displayName: "Default", at: tempDir.appendingPathComponent("Default.petpack"))
        let oldURL = try makePack(id: "mimi-cat", displayName: "Mimi Old", version: "0.1.0", at: tempDir.appendingPathComponent("MimiOld.petpack"))
        let newURL = try makePack(id: "mimi-cat", displayName: "Mimi New", version: "0.2.0", at: tempDir.appendingPathComponent("MimiNew.petpack"))
        let library = PetAssetLibrary(appSupportURL: appSupportURL, defaultPackURL: defaultPackURL, preferences: preferences)
        
        _ = try library.importPack(from: oldURL)
        let importedNew = try library.importPack(from: newURL)
        
        XCTAssertEqual(importedNew.displayName, "Mimi New")
        XCTAssertEqual(importedNew.manifest.version, "0.2.0")
        XCTAssertEqual(try PetPackValidator.validate(at: importedNew.baseURL).manifest.version, "0.2.0")
    }
    
    func testDeletingCurrentPackFallsBackToDefault() throws {
        let defaultPackURL = try makePack(id: "default-pet", displayName: "Default", at: tempDir.appendingPathComponent("Default.petpack"))
        let sourceURL = try makePack(id: "mimi-cat", displayName: "Mimi", at: tempDir.appendingPathComponent("Mimi.petpack"))
        let library = PetAssetLibrary(appSupportURL: appSupportURL, defaultPackURL: defaultPackURL, preferences: preferences)
        
        _ = try library.importPack(from: sourceURL)
        XCTAssertNotNil(library.setActivePack("mimi-cat"))
        let fallback = try library.deletePack(id: "mimi-cat")
        
        XCTAssertEqual(fallback?.id, "default-pet")
        XCTAssertEqual(preferences.activePetID, "default-pet")
    }
    
    func testActivePetRestoresAfterLibraryRecreation() throws {
        let defaultPackURL = try makePack(id: "default-pet", displayName: "Default", at: tempDir.appendingPathComponent("Default.petpack"))
        let sourceURL = try makePack(id: "mimi-cat", displayName: "Mimi", at: tempDir.appendingPathComponent("Mimi.petpack"))
        let library = PetAssetLibrary(appSupportURL: appSupportURL, defaultPackURL: defaultPackURL, preferences: preferences)
        
        _ = try library.importPack(from: sourceURL)
        XCTAssertNotNil(library.setActivePack("mimi-cat"))
        
        let recreated = PetAssetLibrary(appSupportURL: appSupportURL, defaultPackURL: defaultPackURL, preferences: preferences)
        XCTAssertEqual(recreated.activePackID, "mimi-cat")
        XCTAssertNotNil(recreated.pack(withID: "mimi-cat"))
    }
    
    private func makePack(
        id: String,
        displayName: String,
        version: String = "1.0.0",
        at url: URL
    ) throws -> URL {
        try FileManager.default.createDirectory(at: url.appendingPathComponent("actions/idle"), withIntermediateDirectories: true, attributes: nil)
        
        createMockPNG(at: url.appendingPathComponent("preview.png"))
        createMockPNG(at: url.appendingPathComponent("actions/idle/frame_000.png"))
        
        let manifest: [String: Any] = [
            "schemaVersion": 1,
            "id": id,
            "displayName": displayName,
            "species": "cat",
            "style": "soft_storybook",
            "version": version,
            "canvas": ["width": 768.0, "height": 768.0, "anchorX": 0.5, "anchorY": 0.0],
            "defaultScale": 0.67,
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
        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted])
        try manifestData.write(to: url.appendingPathComponent("manifest.json"))
        
        let bubblesData = try JSONSerialization.data(withJSONObject: ["idle": ["Hello"]], options: [.prettyPrinted])
        try bubblesData.write(to: url.appendingPathComponent("bubbles.json"))
        
        try "Test license".write(to: url.appendingPathComponent("license.txt"), atomically: true, encoding: .utf8)
        return url
    }
    
    private func createMockPNG(at url: URL) {
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                data: nil,
                width: 768,
                height: 768,
                bitsPerComponent: 8,
                bytesPerRow: 768 * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else {
            return
        }
        
        context.setFillColor(NSColor.red.cgColor)
        context.fill(CGRect(x: 200, y: 200, width: 200, height: 200))
        
        guard let image = context.makeImage(),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            return
        }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }
}

import Foundation

public struct PetCanvas: Codable, Equatable {
    public let width: Double
    public let height: Double
    public let anchorX: Double
    public let anchorY: Double
    
    public init(width: Double, height: Double, anchorX: Double, anchorY: Double) {
        self.width = width
        self.height = height
        self.anchorX = anchorX
        self.anchorY = anchorY
    }
}

public struct PetAction: Codable, Equatable {
    public let path: String
    public let fps: Int
    public let loop: Bool
    public let required: Bool
    public let fallback: String?
    
    public init(path: String, fps: Int, loop: Bool, required: Bool, fallback: String?) {
        self.path = path
        self.fps = fps
        self.loop = loop
        self.required = required
        self.fallback = fallback
    }
}

public struct PetManifest: Codable, Equatable {
    public let schemaVersion: Int
    public let id: String
    public let displayName: String
    public let species: String
    public let style: String
    public let version: String
    public let canvas: PetCanvas
    public let defaultScale: Double
    public let actions: [String: PetAction]
    
    public init(schemaVersion: Int, id: String, displayName: String, species: String, style: String, version: String, canvas: PetCanvas, defaultScale: Double, actions: [String: PetAction]) {
        self.schemaVersion = schemaVersion
        self.id = id
        self.displayName = displayName
        self.species = species
        self.style = style
        self.version = version
        self.canvas = canvas
        self.defaultScale = defaultScale
        self.actions = actions
    }
}

public struct PetPack: Equatable {
    public let manifest: PetManifest
    public let baseURL: URL
    
    public var id: String { manifest.id }
    public var displayName: String { manifest.displayName }
    
    public var previewURL: URL {
        baseURL.appendingPathComponent("preview.png")
    }
    
    public var licenseURL: URL {
        baseURL.appendingPathComponent("license.txt")
    }
    
    public var bubblesURL: URL {
        baseURL.appendingPathComponent("bubbles.json")
    }
    
    public init(manifest: PetManifest, baseURL: URL) {
        self.manifest = manifest
        self.baseURL = baseURL
    }
    
    public func actionURL(for actionName: String) -> URL? {
        guard let action = manifest.actions[actionName] else { return nil }
        return baseURL.appendingPathComponent(action.path)
    }
}

import Foundation
import Combine

public class PetAssetLibrary: ObservableObject {
    public static let shared = PetAssetLibrary()
    
    @Published public var availablePacks = [PetPack]()
    @Published public var activePackID: String
    
    private let fileManager = FileManager.default
    private let appSupportURL: URL
    private let packsURL: URL
    private let stagingURL: URL
    private let backupsURL: URL
    private let preferences: PetPreferencesStore
    private let defaultPackURLOverride: URL?
    private let importer: PetPackImporter
    private var defaultPack: PetPack?
    
    public convenience init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        self.init(appSupportURL: appSupport.appendingPathComponent("DesktopPet"))
    }
    
    public init(
        appSupportURL: URL,
        defaultPackURL: URL? = nil,
        preferences: PetPreferencesStore = .shared
    ) {
        self.appSupportURL = appSupportURL
        self.packsURL = appSupportURL.appendingPathComponent("PetPacks")
        self.stagingURL = appSupportURL.appendingPathComponent("TempStaging")
        self.backupsURL = appSupportURL.appendingPathComponent("Backups")
        self.preferences = preferences
        self.defaultPackURLOverride = defaultPackURL
        self.activePackID = preferences.activePetID
        self.importer = PetPackImporter(packsURL: packsURL, stagingURL: stagingURL, backupsURL: backupsURL)
        
        try? fileManager.createDirectory(at: packsURL, withIntermediateDirectories: true, attributes: nil)
        try? fileManager.createDirectory(at: stagingURL, withIntermediateDirectories: true, attributes: nil)
        try? fileManager.createDirectory(at: backupsURL, withIntermediateDirectories: true, attributes: nil)
        
        loadDefaultPack()
        refreshAvailablePacks()
    }
    
    private func loadDefaultPack() {
        if let defaultURL = getDefaultPetPackURL() {
            do {
                let pack = try PetPackValidator.validate(at: defaultURL)
                self.defaultPack = pack
            } catch {
                PetLog.error("Failed to load default pack in library: \(error)")
            }
        }
    }
    
    private func getDefaultPetPackURL() -> URL? {
        if let defaultPackURLOverride {
            return defaultPackURLOverride
        }
        if let bundleURL = Bundle.main.url(forResource: "DefaultPetPack", withExtension: nil) {
            return bundleURL
        }
        if let resourceURL = Bundle.main.resourceURL?.appendingPathComponent("DefaultPetPack"),
           fileManager.fileExists(atPath: resourceURL.path) {
            return resourceURL
        }
        let currentDir = URL(fileURLWithPath: fileManager.currentDirectoryPath)
        let localPath = currentDir.appendingPathComponent("Resources/DefaultPetPack")
        if fileManager.fileExists(atPath: localPath.path) {
            return localPath
        }
        return nil
    }
    
    public func scanInstalledPacks() -> [PetPack] {
        var packs = [PetPack]()
        
        if let def = defaultPack {
            packs.append(def)
        }
        
        if let contents = try? fileManager.contentsOfDirectory(at: packsURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
            for folderURL in contents {
                var isDir: ObjCBool = false
                if fileManager.fileExists(atPath: folderURL.path, isDirectory: &isDir), isDir.boolValue {
                    do {
                        let pack = try PetPackValidator.validate(at: folderURL)
                        if pack.id != "default-pet" {
                            packs.append(pack)
                        }
                    } catch {
                        PetLog.debug("Failed to validate installed pack: \(error)")
                    }
                }
            }
        }
        
        return packs
    }
    
    @discardableResult
    public func refreshAvailablePacks() -> [PetPack] {
        let packs = scanInstalledPacks()
        publish(packs)
        
        if !packs.contains(where: { $0.id == activePackID }) {
            _ = setActivePack("default-pet", from: packs)
        }
        
        return packs
    }
    
    public func pack(withID id: String) -> PetPack? {
        scanInstalledPacks().first(where: { $0.id == id })
    }
    
    private func publish(_ packs: [PetPack]) {
        if Thread.isMainThread {
            self.availablePacks = packs
        } else {
            DispatchQueue.main.async {
                self.availablePacks = packs
            }
        }
    }
    
    public func importPack(from sourceURL: URL) throws -> PetPack {
        let finalPack = try importer.importPack(from: sourceURL)
        refreshAvailablePacks()
        return finalPack
    }
    
    @discardableResult
    public func deletePack(id: String) throws -> PetPack? {
        if id == "default-pet" {
            throw NSError(domain: "PetAssetLibrary", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot delete the default pet."])
        }
        
        let wasActive = id == activePackID
        if id == activePackID {
            _ = setActivePack("default-pet")
        }
        
        let destPackURL = packsURL.appendingPathComponent(id)
        if fileManager.fileExists(atPath: destPackURL.path) {
            try fileManager.removeItem(at: destPackURL)
        }
        
        refreshAvailablePacks()
        return wasActive ? pack(withID: activePackID) : nil
    }
    
    @discardableResult
    public func setActivePack(_ id: String) -> PetPack? {
        setActivePack(id, from: scanInstalledPacks())
    }
    
    @discardableResult
    private func setActivePack(_ id: String, from packs: [PetPack]) -> PetPack? {
        guard let pack = packs.first(where: { $0.id == id }) else {
            return nil
        }
        
        preferences.activePetID = pack.id
        if Thread.isMainThread {
            self.activePackID = pack.id
        } else {
            DispatchQueue.main.async {
                self.activePackID = pack.id
            }
        }
        return pack
    }
}

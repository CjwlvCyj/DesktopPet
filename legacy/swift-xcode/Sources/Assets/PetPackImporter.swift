import Foundation

public enum PetPackImportError: LocalizedError, Equatable {
    case reservedID(String)
    case sourceMissing(URL)
    case failedToRestoreBackup(String)
    
    public var errorDescription: String? {
        switch self {
        case .reservedID(let id):
            return "The ID '\(id)' is reserved and cannot be imported."
        case .sourceMissing(let url):
            return "Source pet pack folder does not exist: \(url.path)"
        case .failedToRestoreBackup(let id):
            return "Failed to restore the previous pet pack after replacing '\(id)'."
        }
    }
}

public final class PetPackImporter {
    private let fileManager: FileManager
    private let packsURL: URL
    private let stagingURL: URL
    private let backupsURL: URL
    
    public init(
        packsURL: URL,
        stagingURL: URL,
        backupsURL: URL,
        fileManager: FileManager = .default
    ) {
        self.packsURL = packsURL
        self.stagingURL = stagingURL
        self.backupsURL = backupsURL
        self.fileManager = fileManager
    }
    
    public func importPack(from sourceURL: URL) throws -> PetPack {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: sourceURL.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            throw PetPackImportError.sourceMissing(sourceURL)
        }
        
        try fileManager.createDirectory(at: packsURL, withIntermediateDirectories: true, attributes: nil)
        try fileManager.createDirectory(at: stagingURL, withIntermediateDirectories: true, attributes: nil)
        try fileManager.createDirectory(at: backupsURL, withIntermediateDirectories: true, attributes: nil)
        
        let stageFolderURL = stagingURL.appendingPathComponent(UUID().uuidString)
        let backupFolderURL = backupsURL.appendingPathComponent(UUID().uuidString)
        var didMoveStageToDestination = false
        var didMoveExistingToBackup = false
        
        defer {
            if !didMoveStageToDestination {
                try? fileManager.removeItem(at: stageFolderURL)
            }
            try? fileManager.removeItem(at: backupFolderURL)
        }
        
        try copyDirectoryContents(from: sourceURL, to: stageFolderURL)
        let stagedPack = try PetPackValidator.validate(at: stageFolderURL)
        
        if stagedPack.id == "default-pet" {
            throw PetPackImportError.reservedID(stagedPack.id)
        }
        
        let destinationURL = packsURL.appendingPathComponent(stagedPack.id)
        
        if fileManager.fileExists(atPath: destinationURL.path) {
            try fileManager.moveItem(at: destinationURL, to: backupFolderURL)
            didMoveExistingToBackup = true
        }
        
        do {
            try fileManager.moveItem(at: stageFolderURL, to: destinationURL)
            didMoveStageToDestination = true
            return try PetPackValidator.validate(at: destinationURL)
        } catch {
            try? fileManager.removeItem(at: destinationURL)
            if didMoveExistingToBackup {
                do {
                    try fileManager.moveItem(at: backupFolderURL, to: destinationURL)
                    didMoveExistingToBackup = false
                } catch {
                    throw PetPackImportError.failedToRestoreBackup(stagedPack.id)
                }
            }
            throw error
        }
    }
    
    private func copyDirectoryContents(from sourceURL: URL, to destinationURL: URL) throws {
        try fileManager.createDirectory(at: destinationURL, withIntermediateDirectories: true, attributes: nil)
        
        let contents = try fileManager.contentsOfDirectory(
            at: sourceURL,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )
        
        for itemURL in contents {
            try fileManager.copyItem(at: itemURL, to: destinationURL.appendingPathComponent(itemURL.lastPathComponent))
        }
    }
}

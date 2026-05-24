import Foundation
import ServiceManagement

public class PetPreferencesStore {
    public static let shared = PetPreferencesStore()
    
    private let defaults: UserDefaults
    
    private let keyActivePet = "com.desktoppet.activePetID"
    private let keyScale = "com.desktoppet.scale"
    private let keyAlwaysOnTop = "com.desktoppet.alwaysOnTop"
    private let keyClickThrough = "com.desktoppet.clickThrough"
    
    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }
    
    public var activePetID: String {
        get { defaults.string(forKey: keyActivePet) ?? "default-pet" }
        set { defaults.set(newValue, forKey: keyActivePet) }
    }
    
    public var scale: Double {
        get {
            let val = defaults.double(forKey: keyScale)
            return val == 0 ? 0.67 : val
        }
        set { defaults.set(newValue, forKey: keyScale) }
    }
    
    public var isAlwaysOnTop: Bool {
        get { defaults.object(forKey: keyAlwaysOnTop) == nil ? true : defaults.bool(forKey: keyAlwaysOnTop) }
        set { defaults.set(newValue, forKey: keyAlwaysOnTop) }
    }
    
    public var isClickThrough: Bool {
        get { defaults.bool(forKey: keyClickThrough) }
        set { defaults.set(newValue, forKey: keyClickThrough) }
    }
    
    public var isLoginItemEnabled: Bool {
        loginItemStatus() == .enabled
    }
    
    public func loginItemStatus() -> SMAppService.Status {
        SMAppService.mainApp.status
    }
    
    public func loginItemStatusDescription() -> String {
        switch loginItemStatus() {
        case .enabled:
            return "已开启"
        case .requiresApproval:
            return "需要在系统设置中批准"
        case .notRegistered:
            return "未开启"
        case .notFound:
            return "登录项不可用"
        @unknown default:
            return "未知状态"
        }
    }
    
    public func enableLoginItem() throws {
        switch loginItemStatus() {
        case .enabled:
            return
        case .requiresApproval:
            openLoginItemsSettings()
        default:
            try SMAppService.mainApp.register()
        }
    }
    
    public func disableLoginItem() throws {
        if loginItemStatus() == .enabled {
            try SMAppService.mainApp.unregister()
        }
    }
    
    public func openLoginItemsSettings() {
        SMAppService.openSystemSettingsLoginItems()
    }
}

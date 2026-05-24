import AppKit

public class MenuBarManager: NSObject, NSMenuDelegate {
    private var statusItem: NSStatusItem?
    private weak var windowManager: PetWindowManager?
    
    // Menu items to update dynamically
    private var showHideItem: NSMenuItem?
    private var clickThroughItem: NSMenuItem?
    private var alwaysOnTopItem: NSMenuItem?
    private var restItem: NSMenuItem?
    private var petManagerItem: NSMenuItem?
    private var loginItem: NSMenuItem?
    
    public init(windowManager: PetWindowManager) {
        self.windowManager = windowManager
        super.init()
        setupMenuBar()
    }
    
    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "pawprint.fill", accessibilityDescription: "Desktop Pet")
        }
        
        let menu = NSMenu()
        menu.delegate = self
        
        // Show/Hide
        let showHide = NSMenuItem(title: "隐藏宠物", action: #selector(toggleVisibility), keyEquivalent: "")
        showHide.target = self
        menu.addItem(showHide)
        self.showHideItem = showHide
        
        menu.addItem(NSMenuItem.separator())
        
        // Click-through (Enabled in A6)
        let clickThrough = NSMenuItem(title: "鼠标穿透", action: #selector(toggleClickThrough), keyEquivalent: "")
        clickThrough.target = self
        clickThrough.isEnabled = true
        menu.addItem(clickThrough)
        self.clickThroughItem = clickThrough
        
        // Always on top (Enabled in A6)
        let alwaysOnTop = NSMenuItem(title: "始终置顶", action: #selector(toggleAlwaysOnTop), keyEquivalent: "")
        alwaysOnTop.target = self
        alwaysOnTop.isEnabled = true
        menu.addItem(alwaysOnTop)
        self.alwaysOnTopItem = alwaysOnTop
        
        // Reset Position
        let resetPos = NSMenuItem(title: "重置位置", action: #selector(resetPosition), keyEquivalent: "")
        resetPos.target = self
        menu.addItem(resetPos)
        
        menu.addItem(NSMenuItem.separator())
        
        // Rest (Enabled in A6)
        let restMenu = NSMenuItem(title: "休息", action: #selector(requestRest), keyEquivalent: "")
        restMenu.target = self
        restMenu.isEnabled = true
        menu.addItem(restMenu)
        self.restItem = restMenu
        
        // Pet Manager (Enabled in A7)
        let petManager = NSMenuItem(title: "宠物管理...", action: #selector(openPetManager), keyEquivalent: "")
        petManager.target = self
        petManager.isEnabled = true
        menu.addItem(petManager)
        self.petManagerItem = petManager
        
        menu.addItem(NSMenuItem.separator())
        
        // Launch at login (Enabled in A8)
        let login = NSMenuItem(title: "开机启动", action: #selector(toggleLoginItem), keyEquivalent: "")
        login.target = self
        login.isEnabled = true
        menu.addItem(login)
        self.loginItem = login
        
        menu.addItem(NSMenuItem.separator())
        
        // Exit
        let exitItem = NSMenuItem(title: "退出", action: #selector(terminateApp), keyEquivalent: "")
        exitItem.target = self
        menu.addItem(exitItem)
        
        statusItem?.menu = menu
    }
    
    @objc private func toggleVisibility() {
        windowManager?.toggleVisibility()
    }
    
    @objc private func toggleClickThrough() {
        guard let wm = windowManager else { return }
        wm.isClickThrough.toggle()
        clickThroughItem?.state = wm.isClickThrough ? .on : .off
    }
    
    @objc private func toggleAlwaysOnTop() {
        guard let wm = windowManager else { return }
        wm.isAlwaysOnTop.toggle()
        alwaysOnTopItem?.state = wm.isAlwaysOnTop ? .on : .off
    }
    
    @objc private func resetPosition() {
        windowManager?.resetPosition()
    }
    
    @objc private func requestRest() {
        windowManager?.toggleRest()
    }
    
    @objc private func openPetManager() {
        SettingsWindowManager.shared.showSettings()
    }
    
    @objc private func toggleLoginItem() {
        let store = PetPreferencesStore.shared
        do {
            if store.isLoginItemEnabled {
                try store.disableLoginItem()
            } else {
                try store.enableLoginItem()
            }
        } catch {
            PetLog.error("Failed to update login item: \(error)")
        }
        loginItem?.state = store.isLoginItemEnabled ? .on : .off
    }
    
    @objc private func terminateApp() {
        NSApp.terminate(nil)
    }
    
    // NSMenuDelegate
    public func menuNeedsUpdate(_ menu: NSMenu) {
        guard let panel = windowManager?.petPanel, let wm = windowManager else { return }
        
        // Update show/hide title
        if panel.isVisible {
            showHideItem?.title = "隐藏宠物"
        } else {
            showHideItem?.title = "显示宠物"
        }
        
        // Update toggle states
        clickThroughItem?.state = wm.isClickThrough ? .on : .off
        alwaysOnTopItem?.state = wm.isAlwaysOnTop ? .on : .off
        restItem?.state = wm.isResting ? .on : .off
        loginItem?.state = PetPreferencesStore.shared.isLoginItemEnabled ? .on : .off
    }
}

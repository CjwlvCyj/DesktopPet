import SwiftUI

@main
struct DesktopPetApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    var windowManager: PetWindowManager?
    var menuBarManager: MenuBarManager?
    
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Set activation policy to accessory to make sure it runs as a menu bar app
        NSApp.setActivationPolicy(.accessory)
        
        // Initialize window manager
        let winManager = PetWindowManager.shared
        self.windowManager = winManager
        
        // Initialize menu bar manager
        let menuManager = MenuBarManager(windowManager: winManager)
        self.menuBarManager = menuManager
        
        // Show the pet window
        winManager.showPet()
    }
}

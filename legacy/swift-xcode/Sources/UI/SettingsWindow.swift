import SwiftUI
import AppKit

struct PetRowView: View {
    let pack: PetPack
    let isActive: Bool
    let onSelect: () -> Void
    let onDelete: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            // Load preview image
            if let nsImage = NSImage(contentsOf: pack.previewURL) {
                Image(nsImage: nsImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 54, height: 54)
                    .cornerRadius(8)
                    .background(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.2)))
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.1))
                    .frame(width: 54, height: 54)
                    .overlay(Image(systemName: "pawprint").foregroundColor(.secondary))
            }
            
            VStack(alignment: .leading, spacing: 3) {
                Text(pack.displayName)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                Text("种类: \(pack.manifest.species) (v\(pack.manifest.version))")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Text("动作: \(pack.manifest.actions.keys.sorted().joined(separator: ", "))")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            
            Spacer()
            
            if isActive {
                Text("正在使用")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(.accentColor)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.accentColor.opacity(0.12))
                    .cornerRadius(12)
            } else {
                Button("使用") {
                    onSelect()
                }
                .buttonStyle(.bordered)
            }
            
            if pack.id != "default-pet" {
                Button(action: onDelete) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                }
                .buttonStyle(.plain)
                .padding(.leading, 6)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(nsColor: .windowBackgroundColor).opacity(0.5))
        )
    }
}

public struct SettingsView: View {
    @StateObject private var library = PetAssetLibrary.shared
    @State private var scale = PetPreferencesStore.shared.scale
    @State private var loginStatus = PetPreferencesStore.shared.loginItemStatusDescription()
    @State private var errorMessage: String?
    
    public init() {}
    
    public var body: some View {
        VStack(spacing: 0) {
            Text("我的桌面宠物")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .padding(.top, 16)
                .padding(.bottom, 8)
            
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("缩放")
                        .font(.system(size: 13, weight: .medium))
                    Slider(value: $scale, in: 0.25...1.2)
                    Text("\(Int(scale * 100))%")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.secondary)
                        .frame(width: 48, alignment: .trailing)
                }
                .onChange(of: scale) { newValue in
                    PetWindowManager.shared.setScale(newValue)
                }
                
                HStack {
                    Text("开机启动")
                        .font(.system(size: 13, weight: .medium))
                    Text(loginStatus)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Spacer()
                    Button("刷新状态") {
                        loginStatus = PetPreferencesStore.shared.loginItemStatusDescription()
                    }
                    Button("打开系统设置") {
                        PetPreferencesStore.shared.openLoginItemsSettings()
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
            
            ScrollView {
                VStack(spacing: 10) {
                    ForEach(library.availablePacks, id: \.id) { pack in
                        PetRowView(
                            pack: pack,
                            isActive: library.activePackID == pack.id,
                            onSelect: {
                                if let selectedPack = library.setActivePack(pack.id) {
                                    PetWindowManager.shared.loadPetPack(at: selectedPack.baseURL)
                                }
                            },
                            onDelete: {
                                do {
                                    if let fallbackPack = try library.deletePack(id: pack.id) {
                                        PetWindowManager.shared.loadPetPack(at: fallbackPack.baseURL)
                                    }
                                } catch {
                                    self.errorMessage = error.localizedDescription
                                }
                            }
                        )
                    }
                }
                .padding(16)
            }
            
            Divider()
            
            if let errorMessage {
                HStack(alignment: .top, spacing: 8) {
                    Text("导入错误：\(errorMessage)")
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                        .textSelection(.enabled)
                        .lineLimit(3)
                    Spacer()
                    Button("复制") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(errorMessage, forType: .string)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 10)
            }
            
            HStack {
                Button("导入宠物包 (.petpack)...") {
                    importPetPack()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                
                Spacer()
                
                Button("关闭") {
                    NSApp.keyWindow?.close()
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
            .padding(16)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .frame(width: 520, height: 540)
    }
    
    private func importPetPack() {
        let panel = NSOpenPanel()
        panel.title = "选择宠物资源包目录"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        
        if let targetWindow = SettingsWindowManager.shared.currentWindow {
            panel.beginSheetModal(for: targetWindow) { response in
                if response == .OK, let folderURL = panel.url {
                    self.performImport(from: folderURL)
                }
            }
        } else {
            panel.begin { response in
                if response == .OK, let folderURL = panel.url {
                    self.performImport(from: folderURL)
                }
            }
        }
    }
    
    private func performImport(from folderURL: URL) {
        do {
            let importedPack = try library.importPack(from: folderURL)
            if importedPack.id == library.activePackID {
                PetWindowManager.shared.loadPetPack(at: importedPack.baseURL)
            }
            errorMessage = nil
        } catch {
            DispatchQueue.main.async {
                self.errorMessage = error.localizedDescription
            }
        }
    }
}

class SettingsWindowDelegate: NSObject, NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        // Revert activation policy to accessory so the Dock icon disappears
        NSApp.setActivationPolicy(.accessory)
    }
}

public class SettingsWindowManager {
    public static let shared = SettingsWindowManager()
    
    private var window: NSWindow?
    private let delegate = SettingsWindowDelegate()
    public var currentWindow: NSWindow? { window }
    
    private init() {}
    
    public func showSettings() {
        if window == nil {
            let view = SettingsView()
            let hosting = NSHostingView(rootView: view)
            
            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 520, height: 540),
                styleMask: [.titled, .closable, .miniaturizable],
                backing: .buffered,
                defer: false
            )
            win.isReleasedWhenClosed = false
            win.title = "宠物管理"
            win.contentView = hosting
            win.delegate = delegate
            win.center()
            self.window = win
        }
        
        // Temporarily activate regular policy so settings window shows in Dock and foreground
        NSApp.setActivationPolicy(.regular)
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

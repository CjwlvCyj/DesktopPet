import AppKit

public class PetWindowManager {
    public static let shared = PetWindowManager()
    
    public var petPanel: PetPanel?
    
    private let engine = PetBehaviorEngine()
    private var walkTimer: Timer?
    private var bubblePanel: BubblePanel?
    private var bubbleTimer: Timer?
    private var bubblesData = [String: [String]]()
    private var currentPack: PetPack?
    
    // Configurable state with persistent storage
    public var isClickThrough: Bool = false {
        didSet {
            petPanel?.ignoresMouseEvents = isClickThrough
            PetPreferencesStore.shared.isClickThrough = isClickThrough
        }
    }
    
    public var isAlwaysOnTop: Bool = true {
        didSet {
            petPanel?.level = isAlwaysOnTop ? .floating : .normal
            PetPreferencesStore.shared.isAlwaysOnTop = isAlwaysOnTop
        }
    }
    
    public var isResting: Bool {
        engine.state == .resting
    }
    
    private init() {
        // Load preferences
        let prefs = PetPreferencesStore.shared
        self.isClickThrough = prefs.isClickThrough
        self.isAlwaysOnTop = prefs.isAlwaysOnTop
        
        // Observer for speech bubble alignment during drags/walks
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleWindowDidMove(_:)),
            name: NSWindow.didMoveNotification,
            object: nil
        )
        
        // Observer for external display connect/disconnect
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleScreenParametersChanged(_:)),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
    }
    
    public func getDefaultPetPackURL() -> URL? {
        if let bundleURL = Bundle.main.url(forResource: "DefaultPetPack", withExtension: nil) {
            return bundleURL
        }
        if let resourceURL = Bundle.main.resourceURL?.appendingPathComponent("DefaultPetPack"),
           FileManager.default.fileExists(atPath: resourceURL.path) {
            return resourceURL
        }
        let currentDir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let localPath = currentDir.appendingPathComponent("Resources/DefaultPetPack")
        if FileManager.default.fileExists(atPath: localPath.path) {
            return localPath
        }
        return nil
    }
    
    public func showPet() {
        if petPanel == nil {
            let width: CGFloat = 768
            let height: CGFloat = 768
            
            // Initial center bottom placement
            let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1024, height: 768)
            let x = screenFrame.origin.x + (screenFrame.width - width) / 2
            let y = screenFrame.origin.y
            
            let panel = PetPanel(contentRect: NSRect(x: x, y: y, width: width, height: height))
            
            panel.onDragStarted = { [weak self] in
                self?.processEvent(.dragStarted)
            }
            panel.onDragEnded = { [weak self] in
                self?.processEvent(.dragEnded)
            }
            panel.onClicked = { [weak self] in
                self?.processEvent(.petClicked)
            }
            
            panel.renderer?.onActionComplete = { [weak self] in
                self?.processEvent(.actionCompleted)
            }
            
            _ = panel.setFrameAutosaveName("PetWindowPosition")
            
            panel.ignoresMouseEvents = isClickThrough
            panel.level = isAlwaysOnTop ? .floating : .normal
            
            self.petPanel = panel
            
            let requestedID = PetPreferencesStore.shared.activePetID
            let pack = PetAssetLibrary.shared.setActivePack(requestedID) ?? PetAssetLibrary.shared.setActivePack("default-pet")
            if let pack {
                loadPetPack(at: pack.baseURL)
            } else if let url = getDefaultPetPackURL() {
                loadPetPack(at: url)
            }
            
            resetWalkTimer()
        }
        
        petPanel?.orderFront(nil)
        petPanel?.renderer?.isPaused = false
        resetWalkTimer()
    }
    
    public func loadPetPack(at url: URL) {
        guard let panel = petPanel else { return }
        do {
            let pack = try PetPackValidator.validate(at: url)
            self.currentPack = pack
            
            let bubblesURL = pack.bubblesURL
            if FileManager.default.fileExists(atPath: bubblesURL.path) {
                let data = try Data(contentsOf: bubblesURL)
                self.bubblesData = try JSONDecoder().decode([String: [String]].self, from: data)
            } else {
                self.bubblesData = [:]
            }
            
            try panel.renderer?.load(pack: pack)
            // Sync current scale
            panel.renderer?.setScale(PetPreferencesStore.shared.scale)
            // Invalidate cursor rects to update the pointing hand region
            if let renderer = panel.renderer {
                panel.invalidateCursorRects(for: renderer)
            }
            
            processEvent(.packChanged)
        } catch {
            PetLog.error("Error loading pet pack: \(error)")
            processEvent(.errorOccurred)
        }
    }
    
    public func hidePet() {
        petPanel?.orderOut(nil)
        bubblePanel?.orderOut(nil)
        petPanel?.renderer?.isPaused = true
        stopWalkTimer()
    }
    
    public func toggleVisibility() {
        guard let panel = petPanel else {
            showPet()
            return
        }
        if panel.isVisible {
            processEvent(.hideRequested)
        } else {
            processEvent(.showRequested)
        }
    }
    
    public func resetPosition() {
        guard let panel = petPanel else { return }
        guard let screen = NSScreen.main else { return }
        let screenFrame = screen.visibleFrame
        let width = panel.frame.width
        let height = panel.frame.height
        
        let x = screenFrame.origin.x + (screenFrame.width - width) / 2
        let y = screenFrame.origin.y
        
        panel.setFrame(NSRect(x: x, y: y, width: width, height: height), display: true, animate: true)
    }
    
    public func toggleRest() {
        processEvent(.restRequested)
    }
    
    public func setScale(_ scale: Double) {
        PetPreferencesStore.shared.scale = scale
        petPanel?.renderer?.setScale(scale)
    }
    
    private func processEvent(_ event: PetEvent) {
        let commands = engine.handle(event: event)
        for command in commands {
            executeCommand(command)
        }
    }
    
    private func executeCommand(_ command: PetCommand) {
        switch command {
        case .playAction(let name):
            petPanel?.renderer?.play(action: name)
            
        case .showBubble:
            showDialogueBubble()
            
        case .moveWindow(let dx, let dy):
            movePetWindow(dx: dx, dy: dy)
            
        case .savePosition:
            clampPetWindowToVisibleFrame(animated: false)
            
        case .showWindow:
            petPanel?.orderFront(nil)
            petPanel?.renderer?.isPaused = false
            resetWalkTimer()
            
        case .hideWindow:
            petPanel?.orderOut(nil)
            bubblePanel?.orderOut(nil)
            petPanel?.renderer?.isPaused = true
            stopWalkTimer()
            
        case .setError:
            PetLog.error("Engine entered error state")
        }
    }
    
    private func showDialogueBubble() {
        guard let panel = petPanel, panel.isVisible else { return }
        
        let actionName: String
        switch engine.state {
        case .walking: actionName = "walk"
        case .tapped: actionName = "tap_happy"
        case .dragging: actionName = "dragged"
        case .resting: actionName = "rest"
        default: actionName = "idle"
        }
        
        let textList = bubblesData[actionName] ?? bubblesData["idle"] ?? ["..."]
        guard !textList.isEmpty else { return }
        let randomText = textList.randomElement() ?? "..."
        
        bubbleTimer?.invalidate()
        bubblePanel?.orderOut(nil)
        
        let bubble = BubblePanel(text: randomText, anchorPoint: bubbleAnchorPoint(for: panel))
        bubble.orderFront(nil)
        self.bubblePanel = bubble
        
        let duration = Double.random(in: 2.5...3.5)
        bubbleTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { [weak self] _ in
            self?.bubblePanel?.orderOut(nil)
            self?.bubblePanel = nil
        }
    }
    
    private func movePetWindow(dx: Double, dy: Double) {
        guard let panel = petPanel else { return }
        let screenFrame = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? NSRect.zero
        
        var newFrame = panel.frame
        newFrame.origin.x += CGFloat(dx)
        newFrame.origin.y += CGFloat(dy)
        
        let petWidth = panel.frame.width
        let petHeight = panel.frame.height
        
        let minX = screenFrame.origin.x - petWidth / 2 + 100
        let maxX = screenFrame.origin.x + screenFrame.width - petWidth / 2 - 100
        let minY = screenFrame.origin.y
        let maxY = screenFrame.origin.y + screenFrame.height - petHeight
        
        newFrame.origin.x = max(minX, min(newFrame.origin.x, maxX))
        newFrame.origin.y = max(minY, min(newFrame.origin.y, maxY))
        
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = Double.random(in: 1.5...2.5)
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            panel.animator().setFrame(newFrame, display: true)
        }, completionHandler: { [weak self] in
            self?.processEvent(.actionCompleted)
        })
    }
    
    private func resetWalkTimer() {
        walkTimer?.invalidate()
        guard petPanel?.isVisible == true else { return }
        let interval = Double.random(in: 20.0...45.0)
        walkTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            self?.processEvent(.idleTimerFired)
            self?.resetWalkTimer()
        }
    }
    
    private func stopWalkTimer() {
        walkTimer?.invalidate()
        walkTimer = nil
    }
    
    @objc private func handleWindowDidMove(_ notification: Notification) {
        guard let movedWindow = notification.object as? NSWindow, movedWindow == petPanel else { return }
        guard let panel = petPanel, let bubble = bubblePanel else { return }
        bubble.updatePosition(anchorPoint: bubbleAnchorPoint(for: panel))
    }
    
    @objc private func handleScreenParametersChanged(_ notification: Notification) {
        checkScreenBounds()
    }
    
    public func checkScreenBounds() {
        guard let panel = petPanel, panel.isVisible else { return }
        
        let windowFrame = panel.frame
        var isVisibleOnAnyScreen = false
        
        for screen in NSScreen.screens {
            if screen.visibleFrame.intersects(windowFrame) {
                isVisibleOnAnyScreen = true
                break
            }
        }
        
        if !isVisibleOnAnyScreen {
            resetPosition()
        }
    }
    
    private func clampPetWindowToVisibleFrame(animated: Bool) {
        guard let panel = petPanel else { return }
        let screenFrame = panel.screen?.visibleFrame ?? NSScreen.main?.visibleFrame ?? .zero
        var frame = panel.frame
        
        frame.origin.x = max(screenFrame.minX, min(frame.origin.x, screenFrame.maxX - frame.width))
        frame.origin.y = max(screenFrame.minY, min(frame.origin.y, screenFrame.maxY - frame.height))
        
        if frame != panel.frame {
            panel.setFrame(frame, display: true, animate: animated)
        }
    }
    
    private func bubbleAnchorPoint(for panel: PetPanel) -> CGPoint {
        if let petBounds = panel.renderer?.visiblePetBounds {
            return CGPoint(
                x: panel.frame.minX + petBounds.midX,
                y: panel.frame.minY + petBounds.maxY
            )
        }
        
        return CGPoint(x: panel.frame.midX, y: panel.frame.maxY)
    }
}

import AppKit

public class PetPanel: NSPanel {
    public var renderer: SpriteKitRenderer?
    
    // Callbacks to notify manager about drag state
    var onDragStarted: (() -> Void)?
    var onDragEnded: (() -> Void)?
    var onClicked: (() -> Void)?
    
    private var initialScreenLocation: NSPoint?
    private var initialWindowOrigin: NSPoint?
    private var hasDragged = false
    private let clickThreshold: CGFloat = 3.0
    
    public init(contentRect: NSRect) {
        super.init(
            contentRect: contentRect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        self.isOpaque = false
        self.backgroundColor = .clear
        self.hasShadow = false
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.isReleasedWhenClosed = false
        self.acceptsMouseMovedEvents = true
        
        // SpriteKit renderer view
        let skRenderer = SpriteKitRenderer(frame: NSRect(x: 0, y: 0, width: contentRect.width, height: contentRect.height))
        self.contentView = skRenderer
        self.renderer = skRenderer
    }
    
    public override var canBecomeKey: Bool {
        return false // Don't steal focus from other apps
    }
    
    public override var canBecomeMain: Bool {
        return false
    }
    
    public override func mouseDown(with event: NSEvent) {
        self.initialScreenLocation = NSEvent.mouseLocation
        self.initialWindowOrigin = self.frame.origin
        self.hasDragged = false
    }
    
    public override func mouseDragged(with event: NSEvent) {
        guard let initialScreenLocation = self.initialScreenLocation,
              let initialWindowOrigin = self.initialWindowOrigin else { return }
        
        let currentScreenLocation = NSEvent.mouseLocation
        let dx = currentScreenLocation.x - initialScreenLocation.x
        let dy = currentScreenLocation.y - initialScreenLocation.y
        let distance = sqrt(dx*dx + dy*dy)
        
        if !hasDragged && distance > clickThreshold {
            hasDragged = true
            onDragStarted?()
        }
        
        let newOrigin = CGPoint(x: initialWindowOrigin.x + dx, y: initialWindowOrigin.y + dy)
        self.setFrameOrigin(newOrigin)
    }
    
    public override func mouseUp(with event: NSEvent) {
        if hasDragged {
            onDragEnded?()
        } else {
            onClicked?()
        }
        initialScreenLocation = nil
        initialWindowOrigin = nil
        hasDragged = false
    }
}

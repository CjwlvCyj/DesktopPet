import AppKit
import SpriteKit

public class SpriteKitRenderer: SKView, PetRendererAdapter {
    public var onActionComplete: (() -> Void)?
    
    private var petScene: SKScene?
    private var petNode: SKSpriteNode?
    private var textureCache = [String: [SKTexture]]()
    private var alphaBoundsByAction = [String: NSRect]()
    private var currentActionName = "idle"
    private var currentPack: PetPack?
    public private(set) var visiblePetBounds: NSRect?
    
    public override init(frame: NSRect) {
        super.init(frame: frame)
        setupView()
    }
    
    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }
    
    private func setupView() {
        // Enable transparency in SKView
        self.allowsTransparency = true
        self.showsFPS = false
        self.showsNodeCount = false
        
        let scene = SKScene(size: frame.size)
        scene.backgroundColor = .clear
        scene.scaleMode = .resizeFill
        
        let node = SKSpriteNode()
        scene.addChild(node)
        self.petNode = node
        
        self.presentScene(scene)
        self.petScene = scene
    }
    
    public func load(pack: PetPack) throws {
        self.currentPack = pack
        textureCache.removeAll()
        alphaBoundsByAction.removeAll()
        visiblePetBounds = nil
        
        let canvasWidth = pack.manifest.canvas.width
        let canvasHeight = pack.manifest.canvas.height
        
        // Update scene size to match pack canvas size
        petScene?.size = CGSize(width: canvasWidth, height: canvasHeight)
        
        // Position node at the bottom-center of the scene
        petNode?.anchorPoint = CGPoint(x: pack.manifest.canvas.anchorX, y: pack.manifest.canvas.anchorY)
        petNode?.position = CGPoint(
            x: canvasWidth * pack.manifest.canvas.anchorX,
            y: canvasHeight * pack.manifest.canvas.anchorY
        )
        petNode?.size = CGSize(width: canvasWidth, height: canvasHeight)
        
        let fileManager = FileManager.default
        
        for (actionName, action) in pack.manifest.actions {
            let actionURL = pack.baseURL.appendingPathComponent(action.path)
            
            let contents = try fileManager.contentsOfDirectory(at: actionURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
            let pngFiles = contents.filter { $0.pathExtension.lowercased() == "png" }.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
            
            var textures = [SKTexture]()
            var actionBounds: NSRect?
            for fileURL in pngFiles {
                if let image = NSImage(contentsOf: fileURL) {
                    textures.append(SKTexture(image: image))
                    if let bounds = alphaBoundingBox(for: image) {
                        actionBounds = actionBounds.map { $0.union(bounds) } ?? bounds
                    }
                }
            }
            textureCache[actionName] = textures
            if let actionBounds {
                alphaBoundsByAction[actionName] = actionBounds
            }
        }
        
        // Set scale
        setScale(pack.manifest.defaultScale)
        updateVisibleBounds(for: "idle")
    }
    
    public func play(action name: String) {
        guard let pack = currentPack else { return }
        
        var actionName = name
        var actionOpt = pack.manifest.actions[actionName]
        
        // Fallback to designated fallback
        if actionOpt == nil {
            if let fallback = pack.manifest.actions[name]?.fallback {
                actionName = fallback
                actionOpt = pack.manifest.actions[actionName]
            }
        }
        
        // Final fallback to idle
        if actionOpt == nil {
            actionName = "idle"
            actionOpt = pack.manifest.actions[actionName]
        }
        
        guard let action = actionOpt, let textures = textureCache[actionName], !textures.isEmpty else {
            PetLog.debug("Action '\(actionName)' or its textures not found.")
            return
        }
        
        currentActionName = actionName
        updateVisibleBounds(for: actionName)
        petNode?.removeAllActions()
        
        let durationPerFrame = 1.0 / Double(action.fps)
        let animateAction = SKAction.animate(with: textures, timePerFrame: durationPerFrame)
        
        if action.loop {
            let repeatAction = SKAction.repeatForever(animateAction)
            petNode?.run(repeatAction, withKey: "petAnimation")
        } else {
            let seq = SKAction.sequence([
                animateAction,
                SKAction.run { [weak self] in
                    self?.onActionComplete?()
                }
            ])
            petNode?.run(seq, withKey: "petAnimation")
        }
    }
    
    public func stop() {
        petNode?.removeAllActions()
    }
    
    public func setScale(_ scale: Double) {
        petNode?.xScale = CGFloat(scale)
        petNode?.yScale = CGFloat(scale)
        updateVisibleBounds(for: currentActionName)
        self.window?.invalidateCursorRects(for: self)
    }
    
    public override func resetCursorRects() {
        super.resetCursorRects()
        
        if PetPreferencesStore.shared.isClickThrough {
            return
        }
        
        if let visiblePetBounds {
            self.addCursorRect(visiblePetBounds, cursor: .pointingHand)
        }
    }
    
    public override func hitTest(_ point: NSPoint) -> NSView? {
        // If the point is not even in our view's bounds, return nil
        if !self.bounds.contains(point) {
            return nil
        }
        
        // If click-through is enabled in preferences, ignore all clicks
        if PetPreferencesStore.shared.isClickThrough {
            return nil
        }
        
        guard let petRect = visiblePetBounds else {
            // If no pack loaded, use a default 128x128 center bottom box
            let defaultRect = NSRect(x: bounds.width/2 - 64, y: 0, width: 128, height: 128)
            return defaultRect.contains(point) ? self : nil
        }
        
        if petRect.contains(point) {
            return self
        }
        
        return nil
    }
    
    public override func mouseDown(with event: NSEvent) {
        self.nextResponder?.mouseDown(with: event)
    }
    
    public override func mouseDragged(with event: NSEvent) {
        self.nextResponder?.mouseDragged(with: event)
    }
    
    public override func mouseUp(with event: NSEvent) {
        self.nextResponder?.mouseUp(with: event)
    }
    
    private func updateVisibleBounds(for actionName: String) {
        guard let pack = currentPack else {
            visiblePetBounds = nil
            return
        }
        
        let sourceBounds = alphaBoundsByAction[actionName] ?? alphaBoundsByAction["idle"]
        guard let sourceBounds else {
            visiblePetBounds = nil
            return
        }
        
        let canvasWidth = CGFloat(pack.manifest.canvas.width)
        let canvasHeight = CGFloat(pack.manifest.canvas.height)
        let anchorX = CGFloat(pack.manifest.canvas.anchorX)
        let anchorY = CGFloat(pack.manifest.canvas.anchorY)
        let scaleX = petNode?.xScale ?? 1.0
        let scaleY = petNode?.yScale ?? 1.0
        
        let nodeOriginX = (canvasWidth * anchorX) - (canvasWidth * anchorX * scaleX)
        let nodeOriginY = (canvasHeight * anchorY) - (canvasHeight * anchorY * scaleY)
        
        visiblePetBounds = NSRect(
            x: nodeOriginX + sourceBounds.origin.x * scaleX,
            y: nodeOriginY + sourceBounds.origin.y * scaleY,
            width: sourceBounds.width * scaleX,
            height: sourceBounds.height * scaleY
        )
    }
    
    private func alphaBoundingBox(for image: NSImage) -> NSRect? {
        guard let tiffData = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiffData) else {
            return nil
        }
        
        var minX = bitmap.pixelsWide
        var minY = bitmap.pixelsHigh
        var maxX = -1
        var maxY = -1
        
        for y in 0..<bitmap.pixelsHigh {
            for x in 0..<bitmap.pixelsWide {
                let alpha = bitmap.colorAt(x: x, y: y)?.alphaComponent ?? 0
                if alpha > 0.05 {
                    minX = min(minX, x)
                    minY = min(minY, y)
                    maxX = max(maxX, x)
                    maxY = max(maxY, y)
                }
            }
        }
        
        guard maxX >= minX, maxY >= minY else {
            return nil
        }
        
        let width = maxX - minX + 1
        let height = maxY - minY + 1
        let bottomLeftY = bitmap.pixelsHigh - maxY - 1
        
        return NSRect(x: minX, y: bottomLeftY, width: width, height: height)
    }
}

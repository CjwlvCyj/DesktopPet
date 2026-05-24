import Foundation
import AppKit

public protocol PetRendererAdapter: AnyObject {
    /// Callback triggered when a non-looping action finishes playback
    var onActionComplete: (() -> Void)? { get set }
    
    /// Load assets from a PetPack and prepare the textures
    func load(pack: PetPack) throws
    
    /// Play a specific action by name. Fallbacks should be handled internally.
    func play(action name: String)
    
    /// Stop current animation and clear current action
    func stop()
    
    /// Set scaling factor for the rendering view
    func setScale(_ scale: Double)
    
    /// Pause/resume rendering cycles
    var isPaused: Bool { get set }
    
    /// Current visible pet bounds in renderer-local coordinates, derived from non-transparent pixels.
    var visiblePetBounds: NSRect? { get }
}

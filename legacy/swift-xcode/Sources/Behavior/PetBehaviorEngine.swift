import Foundation

public enum PetState: String, Codable {
    case idle
    case walking
    case tapped
    case dragging
    case resting
    case hidden
    case error
}

public enum PetEvent: Equatable {
    case appStarted
    case petClicked
    case dragStarted
    case dragEnded
    case idleTimerFired
    case restRequested
    case hideRequested
    case showRequested
    case actionCompleted
    case packChanged
    case errorOccurred
}

public enum PetCommand: Equatable {
    case playAction(String)
    case showBubble
    case moveWindow(dx: Double, dy: Double)
    case savePosition
    case showWindow
    case hideWindow
    case setError
}

public class PetBehaviorEngine {
    public typealias WalkStepProvider = () -> (dx: Double, dy: Double)
    
    public private(set) var state: PetState = .idle
    private let walkStepProvider: WalkStepProvider
    
    public init(
        initialState: PetState = .idle,
        walkStepProvider: @escaping WalkStepProvider = PetBehaviorEngine.randomWalkStep
    ) {
        self.state = initialState
        self.walkStepProvider = walkStepProvider
    }
    
    public static func randomWalkStep() -> (dx: Double, dy: Double) {
        let direction = Double.random(in: -1.0...1.0) >= 0 ? 1.0 : -1.0
        let dx = direction * Double.random(in: 80.0...220.0)
        let dy = Double.random(in: -20.0...20.0)
        return (dx, dy)
    }
    
    public func handle(event: PetEvent) -> [PetCommand] {
        switch state {
        case .idle:
            switch event {
            case .appStarted:
                return [.playAction("idle")]
                
            case .petClicked:
                state = .tapped
                return [.playAction("tap_happy"), .showBubble]
                
            case .dragStarted:
                state = .dragging
                return [.playAction("dragged")]
                
            case .idleTimerFired:
                state = .walking
                let step = walkStepProvider()
                let dx = step.dx
                let dy = step.dy
                return [.playAction("walk"), .moveWindow(dx: dx, dy: dy)]
                
            case .restRequested:
                state = .resting
                return [.playAction("rest")]
                
            case .hideRequested:
                state = .hidden
                return [.hideWindow]
                
            case .packChanged:
                return [.playAction("idle")]
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .walking:
            switch event {
            case .actionCompleted:
                state = .idle
                return [.playAction("idle")]
                
            case .dragStarted:
                state = .dragging
                return [.playAction("dragged")]
                
            case .petClicked:
                state = .tapped
                return [.playAction("tap_happy"), .showBubble]
                
            case .hideRequested:
                state = .hidden
                return [.hideWindow]
                
            case .packChanged:
                state = .idle
                return [.playAction("idle")]
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .tapped:
            switch event {
            case .actionCompleted:
                state = .idle
                return [.playAction("idle")]
                
            case .dragStarted:
                state = .dragging
                return [.playAction("dragged")]
                
            case .petClicked:
                // Refresh happy state & bubble
                return [.playAction("tap_happy"), .showBubble]
                
            case .hideRequested:
                state = .hidden
                return [.hideWindow]
                
            case .packChanged:
                state = .idle
                return [.playAction("idle")]
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .dragging:
            switch event {
            case .dragEnded:
                state = .idle
                return [.savePosition, .playAction("idle")]
                
            case .hideRequested:
                state = .hidden
                return [.hideWindow]
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .resting:
            switch event {
            case .petClicked:
                state = .tapped
                return [.playAction("tap_happy"), .showBubble]
                
            case .dragStarted:
                state = .dragging
                return [.playAction("dragged")]
                
            case .restRequested:
                state = .idle
                return [.playAction("idle")]
                
            case .hideRequested:
                state = .hidden
                return [.hideWindow]
                
            case .packChanged:
                state = .idle
                return [.playAction("idle")]
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .hidden:
            switch event {
            case .showRequested:
                state = .idle
                return [.showWindow, .playAction("idle")]
                
            case .packChanged:
                // Stay hidden but we can play idle internally if shown later
                return []
                
            case .errorOccurred:
                state = .error
                return [.setError]
                
            default:
                return []
            }
            
        case .error:
            switch event {
            case .packChanged:
                state = .idle
                return [.playAction("idle")]
                
            default:
                return []
            }
        }
    }
}

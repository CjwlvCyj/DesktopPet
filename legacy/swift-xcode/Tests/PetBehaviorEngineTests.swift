#if canImport(XCTest)
import XCTest
#endif
@testable import DesktopPet

class PetBehaviorEngineTests: XCTestCase {
    var engine: PetBehaviorEngine!
    
    override func setUp() {
        super.setUp()
        engine = PetBehaviorEngine(walkStepProvider: { (dx: 120.0, dy: 12.0) })
    }
    
    override func tearDown() {
        engine = nil
        super.tearDown()
    }
    
    func testInitialState() {
        XCTAssertEqual(engine.state, .idle)
    }
    
    func testClickTransition() {
        // Idle + Click -> Tapped
        let commands = engine.handle(event: .petClicked)
        XCTAssertEqual(engine.state, .tapped)
        XCTAssertEqual(commands.count, 2)
        XCTAssertEqual(commands[0], .playAction("tap_happy"))
        XCTAssertEqual(commands[1], .showBubble)
        
        // Tapped + ActionCompleted -> Idle
        let afterComplete = engine.handle(event: .actionCompleted)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertEqual(afterComplete, [.playAction("idle")])
    }
    
    func testDragTransition() {
        // Idle + DragStart -> Dragging
        let commands = engine.handle(event: .dragStarted)
        XCTAssertEqual(engine.state, .dragging)
        XCTAssertEqual(commands, [.playAction("dragged")])
        
        // Dragging + DragEnd -> Idle
        let afterEnd = engine.handle(event: .dragEnded)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertEqual(afterEnd, [.savePosition, .playAction("idle")])
    }
    
    func testWalkTransition() {
        // Idle + Timer -> Walking
        let commands = engine.handle(event: .idleTimerFired)
        XCTAssertEqual(engine.state, .walking)
        XCTAssertEqual(commands.count, 2)
        XCTAssertEqual(commands[0], .playAction("walk"))
        XCTAssertEqual(commands[1], .moveWindow(dx: 120.0, dy: 12.0))
        
        // Walking + ActionCompleted -> Idle
        let afterComplete = engine.handle(event: .actionCompleted)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertEqual(afterComplete, [.playAction("idle")])
    }
    
    func testHideShowTransition() {
        // Idle + Hide -> Hidden
        let hideCommands = engine.handle(event: .hideRequested)
        XCTAssertEqual(engine.state, .hidden)
        XCTAssertEqual(hideCommands, [.hideWindow])
        
        // Hidden + Show -> Idle
        let showCommands = engine.handle(event: .showRequested)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertEqual(showCommands, [.showWindow, .playAction("idle")])
    }
    
    func testRestTransition() {
        // Idle + Rest -> Resting
        let restCommands = engine.handle(event: .restRequested)
        XCTAssertEqual(engine.state, .resting)
        XCTAssertEqual(restCommands, [.playAction("rest")])
        
        // Resting + Rest -> Idle
        let awakeCommands = engine.handle(event: .restRequested)
        XCTAssertEqual(engine.state, .idle)
        XCTAssertEqual(awakeCommands, [.playAction("idle")])
    }
    
    func testRestToClickTransition() {
        _ = engine.handle(event: .restRequested)
        XCTAssertEqual(engine.state, .resting)
        
        // Resting + Click -> Tapped
        let clickCommands = engine.handle(event: .petClicked)
        XCTAssertEqual(engine.state, .tapped)
        XCTAssertEqual(clickCommands, [.playAction("tap_happy"), .showBubble])
    }
}

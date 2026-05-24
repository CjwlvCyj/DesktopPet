import Foundation

enum PetLog {
    static func debug(_ message: @autoclosure () -> String) {
        #if DEBUG
        print("[DesktopPet] \(message())")
        #endif
    }
    
    static func error(_ message: @autoclosure () -> String) {
        print("[DesktopPet] \(message())")
    }
}

import SwiftUI
import AppKit

public struct BubbleView: View {
    public let text: String
    
    public init(text: String) {
        self.text = text
    }
    
    public var body: some View {
        VStack(spacing: 0) {
            Text(text)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundColor(Color(nsColor: .labelColor))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(nsColor: .windowBackgroundColor).opacity(0.95))
                        .shadow(color: Color.black.opacity(0.12), radius: 6, x: 0, y: 3)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.secondary.opacity(0.15), lineWidth: 1.5)
                )
            
            // Pointer pointing down
            Path { path in
                path.move(to: CGPoint(x: 0, y: 0))
                path.addLine(to: CGPoint(x: 12, y: 0))
                path.addLine(to: CGPoint(x: 6, y: 6))
                path.closeSubpath()
            }
            .fill(Color(nsColor: .windowBackgroundColor).opacity(0.95))
            .frame(width: 12, height: 6)
            .offset(y: -1)
            .shadow(color: Color.black.opacity(0.05), radius: 1, x: 0, y: 1)
        }
        .padding(8)
        .frame(maxWidth: 240)
    }
}

public class BubblePanel: NSPanel {
    public init(text: String, anchorPoint: CGPoint) {
        let bubbleSize = CGSize(width: 250, height: 110)
        let x = anchorPoint.x - bubbleSize.width / 2
        let y = anchorPoint.y + 8
        
        super.init(
            contentRect: NSRect(origin: CGPoint(x: x, y: y), size: bubbleSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        
        self.isOpaque = false
        self.backgroundColor = .clear
        self.hasShadow = false
        self.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.floatingWindow)) + 1)
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.isReleasedWhenClosed = false
        
        let hostingView = NSHostingView(rootView: BubbleView(text: text))
        hostingView.frame = NSRect(origin: .zero, size: bubbleSize)
        self.contentView = hostingView
    }
    
    public override var canBecomeKey: Bool {
        return false
    }
    
    public override var canBecomeMain: Bool {
        return false
    }
    
    public func updatePosition(anchorPoint: CGPoint) {
        let x = anchorPoint.x - frame.width / 2
        let y = anchorPoint.y + 8
        
        self.setFrameOrigin(CGPoint(x: x, y: y))
    }
}

// Draws images/icon.png (128 x 128), the extension icon: the letters "ST" in a blocky pixel font,
// as on an old home-computer screen, above three colour bars. Own design, made only from this code.
// Usage: swift scripts/make-icon.swift images/icon.png
import AppKit

let size = 128
let cell: CGFloat = 8                     // one "pixel" of the pixel font
// the two letters, 5 x 7 cells each ("#" = filled)
let S = ["#####", "#....", "#....", "#####", "....#", "....#", "#####"]
let T = ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."]

func rgb(_ hex: Int) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let H = CGFloat(size)

// background: a dark blue rounded square
rgb(0x1B2340).setFill()
NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: H, height: H), xRadius: 22, yRadius: 22).fill()

/// Draw a letter with its top-left corner at (x, y), measured from the top of the image.
func letter(_ rows: [String], x: CGFloat, y: CGFloat) {
    for (r, row) in rows.enumerated() {
        for (c, ch) in row.enumerated() where ch == "#" {
            NSRect(x: x + CGFloat(c) * cell, y: H - y - CGFloat(r + 1) * cell, width: cell, height: cell).fill()
        }
    }
}
rgb(0xF2F2F2).setFill()
letter(S, x: 20, y: 24)
letter(T, x: 68, y: 24)

// three colour bars under the letters
for (i, color) in [0xE8483B, 0xF5A623, 0xF8E71C].enumerated() {
    rgb(color).setFill()
    NSRect(x: 20, y: H - 97 - CGFloat(i) * 10, width: 88, height: 7).fill()   // tops at 90, 100, 110
}

NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print("wrote \(CommandLine.arguments[1])")

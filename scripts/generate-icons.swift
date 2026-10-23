#!/usr/bin/env swift
// Original compass artwork, rendered with macOS AppKit; no external assets.
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let output = root.appendingPathComponent("extension/icons")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func render(size: Int, toolbar: Bool) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(size) / 32, y: CGFloat(size) / 32)
    if !toolbar {
        NSColor(calibratedRed: 0.07, green: 0.17, blue: 0.21, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 32, height: 32), xRadius: 7, yRadius: 7).fill()
    }
    let ink = toolbar ? NSColor.black : NSColor(calibratedRed: 0.45, green: 0.86, blue: 0.76, alpha: 1)
    ink.setStroke()
    let ring = NSBezierPath(ovalIn: NSRect(x: 4, y: 4, width: 24, height: 24))
    ring.lineWidth = 1.8
    ring.stroke()
    ink.setFill()
    let needle = NSBezierPath()
    needle.move(to: NSPoint(x: 22, y: 25))
    needle.line(to: NSPoint(x: 18, y: 14))
    needle.line(to: NSPoint(x: 10, y: 7))
    needle.line(to: NSPoint(x: 14, y: 18))
    needle.close()
    needle.fill()
    if !toolbar {
        NSColor.white.setFill()
        let light = NSBezierPath()
        light.move(to: NSPoint(x: 22, y: 25))
        light.line(to: NSPoint(x: 14, y: 18))
        light.line(to: NSPoint(x: 18, y: 14))
        light.close()
        light.fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    let name = "\(toolbar ? "toolbar" : "icon")-\(size).png"
    try bitmap.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(name))
}
for size in [16, 19, 32, 38] { try render(size: size, toolbar: true) }
for size in [48, 64, 96, 128, 256, 512] { try render(size: size, toolbar: false) }
print("Rendered Safari Agent compass icons.")

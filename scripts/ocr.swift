// Build:  swiftc -O scripts/ocr.swift -o <scratchpad>/ocr   (macOS only: PDFKit + Vision, nothing to install)
// Usage: ocr file.pdf firstPage lastPage outDir [pixels]
// Renders each page (longest side = pixels, default 2000) and runs Apple's Vision text
// recognition; writes outDir/page-NNN.txt
import PDFKit
import Vision
import AppKit
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let first = Int(a[2])!, last = min(Int(a[3])!, doc.pageCount), out = a[4]
let pixels = CGFloat(a.count > 5 ? Double(a[5])! : 2000)
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
for n in first...last {
    guard let page = doc.page(at: n - 1) else { continue }
    let box = page.bounds(for: .mediaBox)
    let scale = pixels / max(box.width, box.height)
    let img = page.thumbnail(of: CGSize(width: box.width * scale, height: box.height * scale), for: .mediaBox)
    guard let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false        // keep code and names as printed
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    let lines = (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    try? lines.joined(separator: "\n").write(toFile: String(format: "%@/page-%03d.txt", out, n), atomically: true, encoding: .utf8)
}
print("done \(first)-\(last)")

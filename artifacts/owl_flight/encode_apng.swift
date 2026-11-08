// Make a compact, transparent APNG from Blender's full-size RGBA PNG frames.
// Each frame after the first contains only pixels changed since the prior frame.
import CoreGraphics
import Foundation
import ImageIO

let frameDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let count = CommandLine.arguments.count > 3 ? Int(CommandLine.arguments[3])! : 168
let cycleSeconds = CommandLine.arguments.count > 4 ? Int(CommandLine.arguments[4]) : nil
let width = CommandLine.arguments.count > 5 ? Int(CommandLine.arguments[5])! : 1280
let height = CommandLine.arguments.count > 6 ? Int(CommandLine.arguments[6])! : 720
let fps = CommandLine.arguments.count > 7 ? Int(CommandLine.arguments[7])! : 24
let rowBytes = width * 4
let byteCount = rowBytes * height

func be32(_ n: UInt32) -> Data {
    var x = n.bigEndian
    return withUnsafeBytes(of: &x) { Data($0) }
}

func be16(_ n: UInt16) -> Data {
    var x = n.bigEndian
    return withUnsafeBytes(of: &x) { Data($0) }
}

func read32(_ data: Data, _ index: Int) -> UInt32 {
    UInt32(data[index]) << 24 | UInt32(data[index + 1]) << 16 |
    UInt32(data[index + 2]) << 8 | UInt32(data[index + 3])
}

let crcTable: [UInt32] = (0..<256).map { value in
    var c = UInt32(value)
    for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1 }
    return c
}

func chunk(_ type: String, _ payload: Data) -> Data {
    let bytes = Data(type.utf8)
    var crc: UInt32 = 0xFFFFFFFF
    for byte in bytes { crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
    for byte in payload { crc = crcTable[Int((crc ^ UInt32(byte)) & 0xFF)] ^ (crc >> 8) }
    var result = be32(UInt32(payload.count))
    result.append(bytes)
    result.append(payload)
    result.append(be32(crc ^ 0xFFFFFFFF))
    return result
}

func pngChunks(_ png: Data) -> [(String, Data)] {
    precondition(png.prefix(8) == Data([137, 80, 78, 71, 13, 10, 26, 10]))
    var chunks: [(String, Data)] = []
    var index = 8
    while index + 12 <= png.count {
        let length = Int(read32(png, index))
        let type = String(data: png.subdata(in: index + 4..<index + 8), encoding: .ascii)!
        chunks.append((type, png.subdata(in: index + 8..<index + 8 + length)))
        index += length + 12
        if type == "IEND" { break }
    }
    return chunks
}

func pngForRect(_ pixels: UnsafeMutablePointer<UInt8>,
                _ x: Int, _ y: Int, _ w: Int, _ h: Int) -> Data {
    var crop = Data(capacity: w * h * 4)
    for row in y..<(y + h) {
        crop.append(pixels.advanced(by: row * rowBytes + x * 4), count: w * 4)
    }
    let provider = CGDataProvider(data: crop as CFData)!
    let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue |
                             CGBitmapInfo.byteOrder32Big.rawValue)
    let image = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32,
                        bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: info, provider: provider, decode: nil,
                        shouldInterpolate: false, intent: .defaultIntent)!
    let output = NSMutableData()
    let destination = CGImageDestinationCreateWithData(output as CFMutableData,
                                                       "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination))
    return output as Data
}

func changedBounds(_ current: UnsafeMutablePointer<UInt8>,
                   _ previous: UnsafeMutablePointer<UInt8>) -> (Int, Int, Int, Int) {
    current.withMemoryRebound(to: UInt32.self, capacity: width * height) { a in
        previous.withMemoryRebound(to: UInt32.self, capacity: width * height) { b in
            var minX = width, minY = height, maxX = -1, maxY = -1
            for y in 0..<height {
                let row = y * width
                if memcmp(a.advanced(by: row), b.advanced(by: row), rowBytes) == 0 { continue }
                minY = min(minY, y)
                maxY = max(maxY, y)
                for x in 0..<width where a[row + x] != b[row + x] {
                    minX = min(minX, x)
                    maxX = max(maxX, x)
                }
            }
            if maxX < 0 { return (0, 0, 1, 1) }
            return (minX, minY, maxX - minX + 1, maxY - minY + 1)
        }
    }
}

let first = UnsafeMutablePointer<UInt8>.allocate(capacity: byteCount)
let second = UnsafeMutablePointer<UInt8>.allocate(capacity: byteCount)
defer { first.deallocate(); second.deallocate() }
var current = first
var previous = second
memset(previous, 0, byteCount)

var animation = Data([137, 80, 78, 71, 13, 10, 26, 10])
var sequence: UInt32 = 0
for index in 1...count {
    let filename = String(format: "frame_%04d.png", index)
    let url = frameDirectory.appendingPathComponent(filename)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fatalError("Cannot read \(url.path)")
    }
    memset(current, 0, byteCount)
    let context = CGContext(data: current, width: width, height: height,
                            bitsPerComponent: 8, bytesPerRow: rowBytes,
                            space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue |
                                        CGBitmapInfo.byteOrder32Big.rawValue)!
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    let (x, y, w, h) = index == 1 ? (0, 0, width, height) : changedBounds(current, previous)
    let png = pngChunks(pngForRect(current, x, y, w, h))
    if index == 1 {
        let header = png.first { $0.0 == "IHDR" }!.1
        animation.append(chunk("IHDR", header))
        var control = be32(UInt32(count))
        control.append(be32(cycleSeconds == nil ? 1 : 0))
        animation.append(chunk("acTL", control))
    }
    var frameControl = be32(sequence)
    sequence += 1
    frameControl.append(be32(UInt32(w)))
    frameControl.append(be32(UInt32(h)))
    frameControl.append(be32(UInt32(x)))
    frameControl.append(be32(UInt32(y)))
    let delayTicks = index == count && cycleSeconds != nil
        ? cycleSeconds! * fps - (count - 1) : 1
    precondition(1...65535 ~= delayTicks)
    frameControl.append(be16(UInt16(delayTicks)))
    frameControl.append(be16(UInt16(fps)))
    frameControl.append(contentsOf: [0, 0]) // Keep prior canvas; replace changed pixels.
    animation.append(chunk("fcTL", frameControl))
    // Only image data is carried between independently encoded PNG frames.
    for (type, data) in png where type == "IDAT" {
        if index == 1 {
            animation.append(chunk("IDAT", data))
        } else {
            var frameData = be32(sequence)
            sequence += 1
            frameData.append(data)
            animation.append(chunk("fdAT", frameData))
        }
    }
    swap(&current, &previous)
    if index % 24 == 0 { print("Encoded \(index)/\(count) frames") }
}
animation.append(chunk("IEND", Data()))
try animation.write(to: outputURL, options: .atomic)
print(String(format: "Created %@ (%.1f MB)", outputURL.path,
             Double(animation.count) / 1_000_000))

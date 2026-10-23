// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SafariAppleFM",
    platforms: [.macOS("26.0")],
    products: [.executable(name: "safari-apple-fm", targets: ["SafariAppleFM"])],
    targets: [.executableTarget(name: "SafariAppleFM")]
)

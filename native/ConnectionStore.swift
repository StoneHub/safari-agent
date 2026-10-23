import Foundation
import CoreFoundation
import Darwin

enum NativeConnectionStore {
    enum Failure: Error { case unavailable }
    static func validToken(_ token: String) -> Bool {
        token.utf8.count == 64 && token.utf8.allSatisfy {
            (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
        }
    }
    static func integer(_ value: Any?, range: ClosedRange<Int>) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue == Double(number.intValue),
              range.contains(number.intValue) else { return nil }
        return number.intValue
    }
    static func validate(_ value: [String: Any]) -> Bool {
        value.count == 4 && integer(value["version"], range: 1...1) != nil &&
        integer(value["port"], range: 1024...65535) != nil &&
        integer(value["pid"], range: 1...Int(Int32.max)) != nil &&
        (value["token"] as? String).map(validToken) == true
    }
    private static func privateFile(_ fd: Int32) -> Bool {
        var info = stat()
        return fstat(fd, &info) == 0 && info.st_uid == getuid() &&
            info.st_mode & mode_t(S_IFMT) == mode_t(S_IFREG) &&
            info.st_mode & 0o777 == 0o600 && info.st_nlink == 1
    }
    private static func directory(bundle: Bundle) throws -> Int32 {
        guard let group = bundle.object(forInfoDictionaryKey: "SafariAgentGroupIdentifier") as? String,
              group.range(of: "^[A-Z0-9]{10}\\.app\\.stonehub\\.safari-agent$", options: .regularExpression) != nil,
              group.utf8.count == "ABCDEFGHIJ.app.stonehub.safari-agent".utf8.count,
              let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            throw Failure.unavailable
        }
        let container = Darwin.open(url.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard container >= 0 else { throw Failure.unavailable }
        defer { Darwin.close(container) }
        var info = stat()
        guard fstat(container, &info) == 0, info.st_uid == getuid() else { throw Failure.unavailable }
        if mkdirat(container, "SafariAgent", 0o700) != 0 && errno != EEXIST { throw Failure.unavailable }
        let fd = openat(container, "SafariAgent", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw Failure.unavailable }
        guard fstat(fd, &info) == 0, info.st_uid == getuid(),
              info.st_mode & 0o777 == 0o700 else { Darwin.close(fd); throw Failure.unavailable }
        return fd
    }
    private static func readValue(directory: Int32) -> [String: Any]? {
        let fd = openat(directory, "connection.json", O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { return nil }
        defer { Darwin.close(fd) }
        var info = stat()
        guard privateFile(fd), fstat(fd, &info) == 0, info.st_size > 0, info.st_size <= 4096 else { return nil }
        var data = Data(count: Int(info.st_size))
        let count = data.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress, $0.count) }
        guard count == data.count,
              let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              validate(value) else { return nil }
        return value
    }
    static func descriptor(bundle: Bundle) -> [String: Any]? {
        guard let fd = try? directory(bundle: bundle) else { return nil }
        defer { Darwin.close(fd) }
        return readValue(directory: fd)
    }
    static func read(bundle: Bundle) -> [String: Any]? {
        guard let value = descriptor(bundle: bundle) else { return nil }
        return ["ok": true, "version": 1, "port": value["port"]!, "token": value["token"]!]
    }
    private static func locked<T>(bundle: Bundle, operation: (Int32) throws -> T) throws -> T {
        let directoryFD = try directory(bundle: bundle)
        defer { Darwin.close(directoryFD) }
        let lockFD = openat(directoryFD, ".connection.lock", O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard lockFD >= 0 else { throw Failure.unavailable }
        defer { Darwin.close(lockFD) }
        guard privateFile(lockFD), flock(lockFD, LOCK_EX | LOCK_NB) == 0 else { throw Failure.unavailable }
        defer { flock(lockFD, LOCK_UN) }
        return try operation(directoryFD)
    }
    static func publish(_ value: [String: Any], bundle: Bundle) throws {
        guard validate(value) else { throw Failure.unavailable }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard data.count <= 4096 else { throw Failure.unavailable }
        try locked(bundle: bundle) { directoryFD in
            var info = stat()
            if fstatat(directoryFD, "connection.json", &info, AT_SYMLINK_NOFOLLOW) == 0 {
                let existing = openat(directoryFD, "connection.json", O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
                guard existing >= 0 else { throw Failure.unavailable }
                let valid = privateFile(existing)
                Darwin.close(existing)
                guard valid else { throw Failure.unavailable }
            } else if errno != ENOENT { throw Failure.unavailable }
            let name = ".connection-" + UUID().uuidString
            let fd = openat(directoryFD, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
            guard fd >= 0 else { throw Failure.unavailable }
            defer { Darwin.close(fd); unlinkat(directoryFD, name, 0) }
            let count = data.withUnsafeBytes { Darwin.write(fd, $0.baseAddress, $0.count) }
            guard count == data.count, fsync(fd) == 0,
                  renameat(directoryFD, name, directoryFD, "connection.json") == 0 else { throw Failure.unavailable }
        }
    }
    static func remove(token: String, bundle: Bundle) throws -> Bool {
        guard validToken(token) else { throw Failure.unavailable }
        return try locked(bundle: bundle) { directoryFD in
            guard let current = readValue(directory: directoryFD), current["token"] as? String == token else { return false }
            guard unlinkat(directoryFD, "connection.json", 0) == 0 else { throw Failure.unavailable }
            return true
        }
    }
}
